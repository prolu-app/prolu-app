-- ════════════════════════════════════════════════════════════════
-- Testes da migration_061 (proteção de `usuarios`).
-- Rodar DEPOIS dela. UM BLOCO DE CADA VEZ.
--   Bloco 1 só lê.
--   Bloco 2 SEMPRE termina com um erro "RESULTADO …" de propósito: o
--   relatório vem na mensagem e o erro desfaz tudo (nada fica gravado).
--   Ele usa o escritório de TESTE (master andresouzavr@gmail.com) e cria,
--   só dentro da transação, pessoas e escritórios temporários
--   (*@exemplo.invalid, "TESTE 061 …"). Não toca em escritório de cliente.
--   Parte B (no fim) é manual: testa a Edge Function invite-user.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura (esperado: todas as linhas com ok = true) ──
select 'coluna empresas.criado_por' as item,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'empresas' and column_name = 'criado_por') as ok
union all select 'gatilho usuarios_protege (insert/update/delete)',
       exists (select 1 from pg_trigger where tgname = 'usuarios_protege' and tgrelid = 'public.usuarios'::regclass and tgenabled = 'O')
union all select 'gatilho usuarios_marca_convite_aceito',
       exists (select 1 from pg_trigger where tgname = 'usuarios_marca_convite_aceito' and tgrelid = 'public.usuarios'::regclass and tgenabled = 'O')
union all select 'gatilho empresas_registra_criador',
       exists (select 1 from pg_trigger where tgname = 'empresas_registra_criador' and tgrelid = 'public.empresas'::regclass and tgenabled = 'O')
union all select 'usuarios_protege é INVOKER',
       not (select prosecdef from pg_proc where oid = 'public.usuarios_protege()'::regprocedure)
union all select 'marca convite é DEFINER com search_path',
       (select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = 'public.usuarios_marca_convite_aceito()'::regprocedure)
union all select 'policy do próprio registro tem with_check',
       (select with_check is not null from pg_policies where tablename = 'usuarios' and policyname = 'usuario edita o próprio registro')
union all select 'policy do master tem with_check',
       (select with_check is not null from pg_policies where tablename = 'usuarios' and policyname = 'master gerencia usuarios da empresa')
union all select 'anon NÃO grava em usuarios',
       not has_table_privilege('anon', 'public.usuarios', 'INSERT')
       and not has_table_privilege('anon', 'public.usuarios', 'UPDATE')
       and not has_table_privilege('anon', 'public.usuarios', 'DELETE')
union all select 'ninguém da API faz TRUNCATE em usuarios',
       not has_table_privilege('anon', 'public.usuarios', 'TRUNCATE')
       and not has_table_privilege('authenticated', 'public.usuarios', 'TRUNCATE')
union all select 'anon NÃO chama os helpers',
       not has_function_privilege('anon', 'public.usuarios_convite_valido(uuid, text)', 'EXECUTE')
union all select 'authenticated chama os helpers',
       has_function_privilege('authenticated', 'public.usuarios_convite_valido(uuid, text)', 'EXECUTE');


-- ── 2. Cenários (esperado: erro "RESULTADO DA MIGRATION 061 — falhas: 0 de 30") ──
do $cenarios$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  v_t uuid;                     -- escritório de teste
  v_m_auth uuid; v_m_id uuid;   -- master real do escritório de teste
  v_g_auth uuid := gen_random_uuid();  v_g_id uuid;   -- gestor (temp)
  v_c_auth uuid := gen_random_uuid();  v_c_id uuid;   -- comum (temp)
  v_c2_auth uuid := gen_random_uuid(); v_c2_id uuid;  -- outro comum (temp)
  v_m2_auth uuid := gen_random_uuid(); v_m2_id uuid;  -- segundo master (temp)
  v_p_auth uuid := gen_random_uuid();  v_p_id uuid;   -- prolu_admin (temp, só na transação)
  v_x uuid := gen_random_uuid();                      -- escritório temp com 1 master
  v_mx_auth uuid := gen_random_uuid(); v_mx_id uuid;
  v_y uuid := gen_random_uuid();                      -- escritório órfão (sem usuários, sem criador)
  v_n_auth uuid := gen_random_uuid();                 -- pessoa nova, sem cadastro
  v_i_auth uuid := gen_random_uuid();                 -- convidada, e-mail confirmado
  v_i2_auth uuid := gen_random_uuid();                -- convidada, e-mail NÃO confirmado
  v_nova uuid := gen_random_uuid();                   -- empresa que a pessoa nova cria
  r record; v_n int; v_ok boolean; v_msg text; v_res text;
  v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  -- Escritório de teste
  select u.empresa_id, u.auth_id, u.id into v_t, v_m_auth, v_m_id
    from usuarios u
   where lower(u.email) = 'andresouzavr@gmail.com' and u.role = 'master';
  if v_t is null then
    raise exception 'andresouzavr@gmail.com não é master de nenhum escritório — teste abortado.';
  end if;
  if not exists (select 1 from empresas where id = v_t and status_conta = 'ativa') then
    raise exception 'Escritório de teste não está ativo — teste abortado.';
  end if;

  -- Logins temporários
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select f.a, c_inst, 'authenticated', 'authenticated', f.e, '',
         case when f.conf then now() end, '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values
      (v_g_auth,  'teste061.gestor@exemplo.invalid',  true),
      (v_c_auth,  'teste061.comum@exemplo.invalid',   true),
      (v_c2_auth, 'teste061.comum2@exemplo.invalid',  true),
      (v_m2_auth, 'teste061.master2@exemplo.invalid', true),
      (v_p_auth,  'teste061.admin@exemplo.invalid',   true),
      (v_mx_auth, 'teste061.masterx@exemplo.invalid', true),
      (v_n_auth,  'teste061.nova@exemplo.invalid',    true),
      (v_i_auth,  'teste061.convidada@exemplo.invalid', true),
      (v_i2_auth, 'teste061.naoconfirmada@exemplo.invalid', false)
    ) as f(a, e, conf);

  -- Escritórios temporários (criados como SQL Editor: criado_por fica null)
  insert into empresas (id, nome) values (v_x, 'TESTE 061 escritório X'), (v_y, 'TESTE 061 escritório órfão');

  -- Pessoas temporárias
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_g_auth, v_t, 'Teste 061 gestor', 'teste061.gestor@exemplo.invalid', 'gestor') returning id into v_g_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_c_auth, v_t, 'Teste 061 comum', 'teste061.comum@exemplo.invalid', 'comum') returning id into v_c_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_c2_auth, v_t, 'Teste 061 comum 2', 'teste061.comum2@exemplo.invalid', 'comum') returning id into v_c2_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_m2_auth, v_t, 'Teste 061 master 2', 'teste061.master2@exemplo.invalid', 'master') returning id into v_m2_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_p_auth, v_t, 'Teste 061 admin', 'teste061.admin@exemplo.invalid', 'prolu_admin') returning id into v_p_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_mx_auth, v_x, 'Teste 061 master X', 'teste061.masterx@exemplo.invalid', 'master') returning id into v_mx_id;

  -- Convites pendentes no escritório de teste (e-mail em maiúsculas de propósito)
  insert into convites (empresa_id, email, nome, role, status, convidado_por) values
    (v_t, 'Teste061.Convidada@exemplo.invalid', 'Convidada', 'comum', 'pendente', v_m_id),
    (v_t, 'teste061.naoconfirmada@exemplo.invalid', 'Não confirmada', 'comum', 'pendente', v_m_id);

  -- Cada cenário roda isolado (subtransação desfeita no fim) e parte do mesmo
  -- estado. "0 linhas afetadas" conta como recusado (a RLS filtrou).
  for r in select * from (values
    -- ── devem FALHAR ──
    ('comum vira master', 'falha', 'authenticated', v_c_auth,
      format('update usuarios set role = %L where id = %L', 'master', v_c_id), null::text, null::text),
    ('comum troca empresa_id', 'falha', 'authenticated', v_c_auth,
      format('update usuarios set empresa_id = %L where id = %L', v_x, v_c_id), null, null),
    ('comum troca o próprio auth_id', 'falha', 'authenticated', v_c_auth,
      format('update usuarios set auth_id = %L where id = %L', v_n_auth, v_c_id), null, null),
    ('comum altera papel de colega', 'falha', 'authenticated', v_c_auth,
      format('update usuarios set role = %L where id = %L', 'gestor', v_c2_id), null, null),
    ('master grava prolu_admin', 'falha', 'authenticated', v_m_auth,
      format('update usuarios set role = %L where id = %L', 'prolu_admin', v_c_id), null, null),
    ('master altera o próprio papel', 'falha', 'authenticated', v_m_auth,
      format('update usuarios set role = %L where id = %L', 'gestor', v_m_id), null, null),
    ('master rebaixa prolu_admin', 'falha', 'authenticated', v_m_auth,
      format('update usuarios set role = %L where id = %L', 'comum', v_p_id), null, null),
    ('gestor promove a master', 'falha', 'authenticated', v_g_auth,
      format('update usuarios set role = %L where id = %L', 'master', v_c_id), null, null),
    ('gestor rebaixa master', 'falha', 'authenticated', v_g_auth,
      format('update usuarios set role = %L where id = %L', 'comum', v_m2_id), null, null),
    ('gestor altera nome de colega', 'falha', 'authenticated', v_g_auth,
      format('update usuarios set nome = %L where id = %L', 'Outro nome', v_c_id), null, null),
    ('gestor convida master direto na tabela', 'falha', 'authenticated', v_g_auth,
      format('insert into convites (empresa_id, email, nome, role, status, convidado_por) values (%L, %L, %L, %L, %L, %L)',
             v_t, 'teste061.forjado@exemplo.invalid', 'Forjado', 'master', 'pendente', v_g_id), null, null),
    ('INSERT como prolu_admin', 'falha', 'authenticated', v_i_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_i_auth, v_t, 'Convidada', 'teste061.convidada@exemplo.invalid', 'prolu_admin'), null, null),
    ('INSERT em escritório existente sem convite', 'falha', 'authenticated', v_n_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_n_auth, v_t, 'Nova', 'teste061.nova@exemplo.invalid', 'master'), null, null),
    ('INSERT reivindicando escritório órfão', 'falha', 'authenticated', v_n_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_n_auth, v_y, 'Nova', 'teste061.nova@exemplo.invalid', 'master'), null, null),
    ('INSERT para outra pessoa', 'falha', 'authenticated', v_n_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_i_auth, v_t, 'Convidada', 'teste061.convidada@exemplo.invalid', 'comum'), null, null),
    ('convite com papel diferente do convite', 'falha', 'authenticated', v_i_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_i_auth, v_t, 'Convidada', 'teste061.convidada@exemplo.invalid', 'master'), null, null),
    ('convite com e-mail não confirmado', 'falha', 'authenticated', v_i2_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_i2_auth, v_t, 'Não confirmada', 'teste061.naoconfirmada@exemplo.invalid', 'comum'), null, null),
    ('master remove prolu_admin', 'falha', 'authenticated', v_m_auth,
      format('delete from usuarios where id = %L', v_p_id), null, null),
    ('último master remove a si mesmo', 'falha', 'authenticated', v_mx_auth,
      format('delete from usuarios where id = %L', v_mx_id), null, null),
    ('master altera criado_por da empresa', 'falha', 'authenticated', v_m_auth,
      format('update empresas set criado_por = %L where id = %L', v_m_auth, v_t), null, null),
    ('anon altera usuário', 'falha', 'anon', null::uuid,
      format('update usuarios set nome = %L where id = %L', 'Anon', v_c_id), null, null),
    -- ── devem PASSAR ──
    ('master troca papel de comum', 'passa', 'authenticated', v_m_auth,
      format('update usuarios set role = %L where id = %L', 'gestor', v_c_id), null,
      format('select role = %L from usuarios where id = %L', 'gestor', v_c_id)),
    ('gestor promove comum a gestor', 'passa', 'authenticated', v_g_auth,
      format('update usuarios set role = %L where id = %L', 'gestor', v_c_id), null,
      format('select role = %L from usuarios where id = %L', 'gestor', v_c_id)),
    ('master rebaixa outro master (sobra 1)', 'passa', 'authenticated', v_m_auth,
      format('update usuarios set role = %L where id = %L', 'gestor', v_m2_id), null, null),
    ('master remove comum', 'passa', 'authenticated', v_m_auth,
      format('delete from usuarios where id = %L', v_c2_id), null, null),
    ('comum muda o próprio nome', 'passa', 'authenticated', v_c_auth,
      format('update usuarios set nome = %L where id = %L', 'Nome novo', v_c_id), null, null),
    ('cadastro novo (empresa + master)', 'passa', 'authenticated', v_n_auth,
      format('insert into empresas (id, nome) values (%L, %L)', v_nova, 'TESTE 061 escritório novo'),
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_n_auth, v_nova, 'Nova', 'teste061.nova@exemplo.invalid', 'master'),
      format('select criado_por = %L and plano = %L from empresas where id = %L', v_n_auth, 'starter', v_nova)),
    ('convite aceito (e convite marcado)', 'passa', 'authenticated', v_i_auth,
      format('insert into usuarios (auth_id, empresa_id, nome, email, role) values (%L, %L, %L, %L, %L)',
             v_i_auth, v_t, 'Convidada', 'teste061.convidada@exemplo.invalid', 'comum'), null,
      format('select status = %L from convites where empresa_id = %L and lower(email) = %L', 'aceito', v_t, 'teste061.convidada@exemplo.invalid')),
    ('exclusão do escritório pela service_role', 'passa', 'service_role', null::uuid,
      format('delete from empresas where id = %L', v_x), null,
      format('select empresa_id is null from usuarios where id = %L', v_mx_id)),
    ('exclusão do escritório pelo SQL Editor', 'passa', 'postgres', null::uuid,
      format('delete from empresas where id = %L', v_x), null,
      format('select empresa_id is null from usuarios where id = %L', v_mx_id))
  ) as c(nome, esperado, papel, ator, sql1, sql2, verifica) loop
    v_msg := null;
    begin
      perform set_config('request.jwt.claims',
        case when r.ator is null then jsonb_build_object('role', r.papel)
             else jsonb_build_object('sub', r.ator, 'role', r.papel) end::text, true);
      if r.papel <> 'postgres' then
        execute format('set local role %I', r.papel);
      end if;

      execute r.sql1;
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception '0 linhas afetadas (RLS)'; end if;
      if r.sql2 is not null then
        execute r.sql2;
        get diagnostics v_n = row_count;
        if v_n = 0 then raise exception '0 linhas afetadas no 2º comando (RLS)'; end if;
      end if;

      execute 'reset role';
      if r.verifica is not null then
        execute r.verifica into v_ok;
        if not coalesce(v_ok, false) then raise exception 'verificação depois do comando falhou'; end if;
      end if;

      raise exception '__PASSOU__';
    exception when others then
      v_msg := sqlerrm;
    end;

    v_res := case when v_msg = '__PASSOU__' then 'passa' else 'falha' end;
    v_total := v_total + 1;
    if v_res = r.esperado then
      v_texto := v_texto || 'OK     ' || r.nome
                 || case when v_res = 'falha' then ' (' || v_msg || ')' else '' end || E'\n';
    else
      v_falhas := v_falhas + 1;
      v_texto := v_texto || 'FALHOU ' || r.nome || ' — esperado ' || r.esperado || ', veio: '
                 || case when v_res = 'passa' then 'passou' else v_msg end || E'\n';
    end if;
  end loop;

  raise exception E'RESULTADO DA MIGRATION 061 — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $cenarios$;


-- ════════════════════════════════════════════════════════════════
-- PARTE B — Edge Function invite-user (manual, depois do deploy)
-- ════════════════════════════════════════════════════════════════
-- Precisa de: URL do projeto (<REF>), anon key, e o access_token de quem
-- vai chamar. Para pegar o token: logado no app, DevTools → Application →
-- Local Storage → chave "sb-<REF>-auth-token" → campo "access_token".
-- Use e-mails seus para não mandar convite a terceiros, por exemplo
-- andresouzavr+teste061a@gmail.com. Cada convite que PASSAR cria um login
-- em auth.users e uma linha em convites: apague os dois depois
-- (Authentication → Users, e a aba Equipe → remover convite).
--
-- B1. Sem login → esperado 401
--   curl -i -X POST "https://<REF>.supabase.co/functions/v1/invite-user" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
--     -H "Content-Type: application/json" \
--     -d '{"email":"andresouzavr+teste061a@gmail.com","role":"comum","empresa_id":"<ID_ESCRITORIO_TESTE>"}'
--
-- B2. Gestor convida master → esperado 403 "Você não pode convidar com essa permissão."
--   (token de um gestor do escritório de teste)
--   mesmo curl, com -H "Authorization: Bearer <TOKEN_GESTOR>" e "role":"master"
--
-- B3. convidado_por forjado é ignorado → esperado 200
--   (token do master do escritório de teste; convidado_por = id de OUTRA pessoa)
--   -d '{"email":"andresouzavr+teste061b@gmail.com","role":"comum","empresa_id":"<ID_ESCRITORIO_TESTE>","convidado_por":"<ID_DE_OUTRO_USUARIO>"}'
--   Conferir que o convite ficou em nome de quem chamou:
--     select c.email, u.email as convidado_por
--       from convites c join usuarios u on u.id = c.convidado_por
--      where c.email = 'andresouzavr+teste061b@gmail.com';
--   esperado: convidado_por = andresouzavr@gmail.com
--
-- B4. Empresa de outro escritório → esperado 403 "Não autorizado a convidar…"
--   token do master de teste com "empresa_id" de outro escritório.
--
-- B5. Fluxo normal pela tela: Configurações → Equipe → convidar (e reenviar)
--   continua funcionando como antes.
