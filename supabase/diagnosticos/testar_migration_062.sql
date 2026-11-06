-- ════════════════════════════════════════════════════════════════
-- Testes da migration_062 (dados financeiros só do master).
-- Rodar DEPOIS dela. UM BLOCO DE CADA VEZ.
--   Bloco 1 só lê.
--   Bloco 2 SEMPRE termina com um erro "RESULTADO …" de propósito: o
--   relatório vem na mensagem e o erro desfaz tudo (nada fica gravado).
--   Usa o escritório de TESTE (master andresouzavr@gmail.com, que precisa
--   estar mentoria/ativa) e cria só dentro da transação: gestor, comum e um
--   prolu_admin temporários nesse escritório, um escritório "TESTE 062 X"
--   com master próprio, e registros de CRM/precificação/modelos/indicadores
--   nos dois. Não toca em escritório de cliente.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura ──
-- 1a. Policies das tabelas financeiras. Esperado: em cada tabela só
--     "financeiro: le" e "financeiro: grava" (crm_fichas só "le"), mais as
--     RESTRICTIVE "plano libera …" dos indicadores. Qualquer outra linha
--     é sobra e precisa ser olhada.
select tablename, policyname, permissive, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('crm_colunas', 'crm_linhas', 'crm_fichas', 'oportunidade_comentarios',
                     'precificacoes', 'precificacao_etapas', 'precificacao_tarefas',
                     'precificacao_subtarefas', 'precificacao_custos_extras',
                     'precificacao_etiquetas', 'precificacao_etiquetas_cadastro',
                     'modelos_precificacao', 'modelo_etapas', 'modelo_tarefas', 'modelo_subtarefas',
                     'indicadores', 'indicador_metas', 'indicador_resultados')
 order by (policyname like 'financeiro:%' or policyname like 'plano libera%'), tablename, policyname;

-- 1b. Esperado: todas as linhas com ok = true
select 'nenhuma policy fora do padrão' as item,
       not exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename in ('crm_colunas', 'crm_linhas', 'crm_fichas', 'oportunidade_comentarios',
                              'precificacoes', 'precificacao_etapas', 'precificacao_tarefas',
                              'precificacao_subtarefas', 'precificacao_custos_extras',
                              'precificacao_etiquetas', 'precificacao_etiquetas_cadastro',
                              'modelos_precificacao', 'modelo_etapas', 'modelo_tarefas', 'modelo_subtarefas',
                              'indicadores', 'indicador_metas', 'indicador_resultados')
            and policyname not like 'financeiro:%' and policyname not like 'plano libera%') as ok
-- (em modelos_precificacao o auth_is_prolu_admin() é a regra dos modelos da Prolu)
union all select 'escrita não libera prolu_admin em outro escritório',
       not exists (select 1 from pg_policies
                    where schemaname = 'public' and policyname = 'financeiro: grava'
                      and coalesce(qual, '') || coalesce(with_check, '') ~ 'auth_is_prolu_admin'
                      and tablename <> 'modelos_precificacao')
union all select 'crm_fichas sem policy de escrita',
       not exists (select 1 from pg_policies where tablename = 'crm_fichas' and cmd <> 'SELECT')
union all select 'fn_fechamentos exige master',
       pg_get_functiondef('public.fn_fechamentos(uuid, date, date)'::regprocedure) ~ 'auth_is_empresa_master'
union all select 'fn_fechamentos segue DEFINER com search_path',
       (select prosecdef and proconfig::text like '%search_path=public%'
          from pg_proc where oid = 'public.fn_fechamentos(uuid, date, date)'::regprocedure)
union all select 'authenticated chama fn_fechamentos(_periodo)',
       has_function_privilege('authenticated', 'public.fn_fechamentos(uuid, date, date)', 'EXECUTE')
       and has_function_privilege('authenticated', 'public.fn_fechamentos_periodo(uuid, date, date)', 'EXECUTE')
union all select 'anon NÃO chama fn_fechamentos(_periodo)',
       not has_function_privilege('anon', 'public.fn_fechamentos(uuid, date, date)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.fn_fechamentos_periodo(uuid, date, date)', 'EXECUTE')
union all select 'authenticated NÃO chama _fechamentos_base',
       not has_function_privilege('authenticated', 'public._fechamentos_base(uuid, date, date)', 'EXECUTE')
union all select 'anon NÃO chama os helpers fin_*',
       not has_function_privilege('anon', 'public.fin_pode_ler(uuid)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.fin_pode_gravar(uuid)', 'EXECUTE');


-- ── 2. Cenários (esperado: erro "RESULTADO DA MIGRATION 062 — falhas: 0 de 52") ──
--      "passa" = recebeu ou alterou ao menos 1 linha.
--      "falha" = 0 linhas (RLS filtrou) ou erro.
do $cenarios$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_t uuid; v_m_auth uuid;                                  -- escritório de teste e master real
  v_g_auth uuid := gen_random_uuid();                       -- gestor (temp, T)
  v_c_auth uuid := gen_random_uuid();                       -- comum (temp, T)
  v_p_auth uuid := gen_random_uuid();                       -- prolu_admin (temp, T = escritório dele)
  v_x uuid := gen_random_uuid();                            -- outro escritório (temp)
  v_mx_auth uuid := gen_random_uuid();                      -- master de X
  v_t_status uuid; v_t_data uuid; v_t_valor uuid;
  v_x_status uuid; v_x_data uuid; v_x_valor uuid;
  v_lt uuid; v_lx uuid;                                     -- crm_linhas
  v_pt uuid; v_pt_etapa uuid; v_pt_tarefa uuid; v_pt_sub uuid;
  v_px uuid; v_px_etapa uuid; v_px_tarefa uuid; v_px_sub uuid;
  v_mt uuid; v_mp uuid; v_mp_etapa uuid; v_mx uuid;         -- modelos
  v_it uuid; v_ix uuid;                                     -- indicadores
  r record; v_n bigint; v_msg text; v_res text;
  v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  -- Escritório de teste
  select u.empresa_id, u.auth_id into v_t, v_m_auth
    from usuarios u
   where lower(u.email) = 'andresouzavr@gmail.com' and u.role = 'master';
  if v_t is null then
    raise exception 'andresouzavr@gmail.com não é master de nenhum escritório — teste abortado.';
  end if;
  if not exists (select 1 from empresas where id = v_t and status_conta = 'ativa' and plano = 'mentoria') then
    raise exception 'Escritório de teste precisa estar mentoria/ativa — teste abortado.';
  end if;

  -- Logins e pessoas temporárias (o gatilho da 061 deixa o SQL Editor passar)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select f.a, c_inst, 'authenticated', 'authenticated', f.e, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
    from (values
      (v_g_auth,  'teste062.gestor@exemplo.invalid'),
      (v_c_auth,  'teste062.comum@exemplo.invalid'),
      (v_p_auth,  'teste062.admin@exemplo.invalid'),
      (v_mx_auth, 'teste062.masterx@exemplo.invalid')
    ) as f(a, e);

  insert into empresas (id, nome) values (v_x, 'TESTE 062 escritório X');

  insert into usuarios (auth_id, empresa_id, nome, email, role) values
    (v_g_auth,  v_t, 'Teste 062 gestor',   'teste062.gestor@exemplo.invalid',  'gestor'),
    (v_c_auth,  v_t, 'Teste 062 comum',    'teste062.comum@exemplo.invalid',   'comum'),
    (v_p_auth,  v_t, 'Teste 062 admin',    'teste062.admin@exemplo.invalid',   'prolu_admin'),
    (v_mx_auth, v_x, 'Teste 062 master X', 'teste062.masterx@exemplo.invalid', 'master');

  -- Colunas fixas do CRM usadas pelos fechamentos (usa as do escritório de
  -- teste se já existirem; o índice único da 047 impede duplicar)
  select id into v_t_status from crm_colunas where empresa_id = v_t and opcoes->>'slug' = 'status';
  if v_t_status is null then
    insert into crm_colunas (empresa_id, nome, tipo, fixo, opcoes)
      values (v_t, 'Status', 'select', true, '{"slug":"status"}') returning id into v_t_status;
  end if;
  select id into v_t_data from crm_colunas where empresa_id = v_t and opcoes->>'slug' = 'data_fechamento';
  if v_t_data is null then
    insert into crm_colunas (empresa_id, nome, tipo, fixo, opcoes)
      values (v_t, 'Data de fechamento', 'date', true, '{"slug":"data_fechamento"}') returning id into v_t_data;
  end if;
  select id into v_t_valor from crm_colunas where empresa_id = v_t and opcoes->>'slug' = 'valor';
  if v_t_valor is null then
    insert into crm_colunas (empresa_id, nome, tipo, fixo, opcoes)
      values (v_t, 'Valor', 'money', true, '{"slug":"valor"}') returning id into v_t_valor;
  end if;
  insert into crm_colunas (empresa_id, nome, tipo, fixo, opcoes)
    values (v_x, 'Status', 'select', true, '{"slug":"status"}') returning id into v_x_status;
  insert into crm_colunas (empresa_id, nome, tipo, fixo, opcoes)
    values (v_x, 'Data de fechamento', 'date', true, '{"slug":"data_fechamento"}') returning id into v_x_data;
  insert into crm_colunas (empresa_id, nome, tipo, fixo, opcoes)
    values (v_x, 'Valor', 'money', true, '{"slug":"valor"}') returning id into v_x_valor;

  -- Um negócio fechado hoje em cada escritório
  insert into crm_linhas (empresa_id, valores)
    values (v_t, jsonb_build_object(v_t_status::text, 'Fechado', v_t_data::text, v_hoje::text, v_t_valor::text, 1000))
    returning id into v_lt;
  insert into crm_linhas (empresa_id, valores)
    values (v_x, jsonb_build_object(v_x_status::text, 'Fechado', v_x_data::text, v_hoje::text, v_x_valor::text, 2000))
    returning id into v_lx;
  insert into crm_fichas (linha_id, empresa_id, respostas) values (v_lt, v_t, '[]'), (v_lx, v_x, '[]');
  insert into oportunidade_comentarios (linha_id, texto) values (v_lt, 'Teste 062'), (v_lx, 'Teste 062');

  -- Precificações com etapa > tarefa > subtarefa, custo e etiqueta
  insert into precificacoes (empresa_id, nome) values (v_t, 'TESTE 062 T') returning id into v_pt;
  insert into precificacao_etapas (precificacao_id, nome) values (v_pt, 'Etapa') returning id into v_pt_etapa;
  insert into precificacao_tarefas (etapa_id, nome) values (v_pt_etapa, 'Tarefa') returning id into v_pt_tarefa;
  insert into precificacao_subtarefas (tarefa_id, nome) values (v_pt_tarefa, 'Sub') returning id into v_pt_sub;
  insert into precificacao_custos_extras (precificacao_id, nome, valor_estimado) values (v_pt, 'Custo', 100);
  insert into precificacao_etiquetas (precificacao_id, nome) values (v_pt, 'Etiqueta');
  insert into precificacoes (empresa_id, nome) values (v_x, 'TESTE 062 X') returning id into v_px;
  insert into precificacao_etapas (precificacao_id, nome) values (v_px, 'Etapa') returning id into v_px_etapa;
  insert into precificacao_tarefas (etapa_id, nome) values (v_px_etapa, 'Tarefa') returning id into v_px_tarefa;
  insert into precificacao_subtarefas (tarefa_id, nome) values (v_px_tarefa, 'Sub') returning id into v_px_sub;
  insert into precificacao_etiquetas_cadastro (empresa_id, nome) values (v_t, 'TESTE 062'), (v_x, 'TESTE 062');

  -- Modelos: do escritório de teste, da Prolu (global) e do escritório X
  insert into modelos_precificacao (empresa_id, is_prolu, nome) values (v_t, false, 'TESTE 062 modelo T') returning id into v_mt;
  insert into modelos_precificacao (empresa_id, is_prolu, nome) values (null, true, 'TESTE 062 modelo Prolu') returning id into v_mp;
  insert into modelo_etapas (modelo_id, nome) values (v_mp, 'Etapa Prolu') returning id into v_mp_etapa;
  insert into modelos_precificacao (empresa_id, is_prolu, nome) values (v_x, false, 'TESTE 062 modelo X') returning id into v_mx;

  -- Indicadores
  insert into indicadores (empresa_id, nome) values (v_t, 'TESTE 062') returning id into v_it;
  insert into indicador_resultados (indicador_id, ano, trimestre, valor) values (v_it, 2026, 1, 10);
  insert into indicadores (empresa_id, nome) values (v_x, 'TESTE 062') returning id into v_ix;

  for r in select * from (values
    -- ── gestor e comum: nada ──
    ('gestor lê crm_linhas',                'falha', 'authenticated', v_g_auth, format('select count(*) from crm_linhas where id = %L', v_lt)),
    ('comum lê crm_linhas',                 'falha', 'authenticated', v_c_auth, format('select count(*) from crm_linhas where id = %L', v_lt)),
    ('gestor lê crm_colunas',               'falha', 'authenticated', v_g_auth, format('select count(*) from crm_colunas where id = %L', v_t_valor)),
    ('comum lê crm_fichas',                 'falha', 'authenticated', v_c_auth, format('select count(*) from crm_fichas where linha_id = %L', v_lt)),
    ('gestor lê comentários',               'falha', 'authenticated', v_g_auth, format('select count(*) from oportunidade_comentarios where linha_id = %L', v_lt)),
    ('comum lê precificacoes',              'falha', 'authenticated', v_c_auth, format('select count(*) from precificacoes where id = %L', v_pt)),
    ('gestor lê precificacao_subtarefas',   'falha', 'authenticated', v_g_auth, format('select count(*) from precificacao_subtarefas where id = %L', v_pt_sub)),
    ('comum lê custos extras',              'falha', 'authenticated', v_c_auth, format('select count(*) from precificacao_custos_extras where precificacao_id = %L', v_pt)),
    ('comum lê etiquetas (cadastro)',       'falha', 'authenticated', v_c_auth, format('select count(*) from precificacao_etiquetas_cadastro where empresa_id = %L', v_t)),
    ('gestor lê modelo do escritório',      'falha', 'authenticated', v_g_auth, format('select count(*) from modelos_precificacao where id = %L', v_mt)),
    ('comum lê modelo da Prolu',            'falha', 'authenticated', v_c_auth, format('select count(*) from modelos_precificacao where id = %L', v_mp)),
    ('gestor lê etapa de modelo da Prolu',  'falha', 'authenticated', v_g_auth, format('select count(*) from modelo_etapas where id = %L', v_mp_etapa)),
    ('gestor lê indicadores',               'falha', 'authenticated', v_g_auth, format('select count(*) from indicadores where id = %L', v_it)),
    ('comum lê indicador_resultados',       'falha', 'authenticated', v_c_auth, format('select count(*) from indicador_resultados where indicador_id = %L', v_it)),
    ('gestor cria registro no CRM',         'falha', 'authenticated', v_g_auth, format('insert into crm_linhas (empresa_id, valores) values (%L, %L)', v_t, '{}')),
    ('comum altera precificação',           'falha', 'authenticated', v_c_auth, format('update precificacoes set nome = %L where id = %L', 'x', v_pt)),
    ('gestor comenta oportunidade',         'falha', 'authenticated', v_g_auth, format('insert into oportunidade_comentarios (linha_id, texto) values (%L, %L)', v_lt, 'x')),
    ('gestor altera em massa (RPC)',        'falha', 'authenticated', v_g_auth, format('select crm_linhas_atualizar_em_massa(array[%L]::uuid[], %L::jsonb)', v_lt, '{}')),
    ('comum: fn_fechamentos do escritório', 'falha', 'authenticated', v_c_auth, format('select count(*) from fn_fechamentos(%L, %L, %L)', v_t, v_hoje, v_hoje)),
    ('gestor: fn_fechamentos do escritório','falha', 'authenticated', v_g_auth, format('select count(*) from fn_fechamentos(%L, %L, %L)', v_t, v_hoje, v_hoje)),
    ('gestor: fn_fechamentos sem filtro',   'falha', 'authenticated', v_g_auth, format('select count(*) from fn_fechamentos(null, %L, %L)', v_hoje, v_hoje)),
    ('comum: fn_fechamentos_periodo',       'falha', 'authenticated', v_c_auth, format('select count(*) from fn_fechamentos_periodo(%L, %L, %L)', v_t, v_hoje, v_hoje)),
    ('anon lê crm_linhas',                  'falha', 'anon',          null::uuid, format('select count(*) from crm_linhas where id = %L', v_lt)),
    -- ── master: tudo do próprio escritório, nada de outro ──
    ('master lê crm_linhas',                'passa', 'authenticated', v_m_auth, format('select count(*) from crm_linhas where id = %L', v_lt)),
    ('master lê crm_fichas',                'passa', 'authenticated', v_m_auth, format('select count(*) from crm_fichas where linha_id = %L', v_lt)),
    ('master lê precificacao_subtarefas',   'passa', 'authenticated', v_m_auth, format('select count(*) from precificacao_subtarefas where id = %L', v_pt_sub)),
    ('master lê modelo da Prolu',           'passa', 'authenticated', v_m_auth, format('select count(*) from modelos_precificacao where id = %L', v_mp)),
    ('master: fn_fechamentos',              'passa', 'authenticated', v_m_auth, format('select count(*) from fn_fechamentos(%L, %L, %L)', v_t, v_hoje, v_hoje)),
    ('master: fn_fechamentos_periodo',      'passa', 'authenticated', v_m_auth, format('select count(*) from fn_fechamentos_periodo(%L, %L, %L)', v_t, v_hoje, v_hoje)),
    ('master altera precificação',          'passa', 'authenticated', v_m_auth, format('update precificacoes set nome = %L where id = %L', 'TESTE 062 alterada', v_pt)),
    ('master cria tarefa na precificação',  'passa', 'authenticated', v_m_auth, format('insert into precificacao_tarefas (etapa_id, nome) values (%L, %L)', v_pt_etapa, 'Nova')),
    ('master comenta oportunidade',         'passa', 'authenticated', v_m_auth, format('insert into oportunidade_comentarios (linha_id, texto) values (%L, %L)', v_lt, 'ok')),
    ('master altera resultado de indicador','passa', 'authenticated', v_m_auth, format('update indicador_resultados set valor = 20 where indicador_id = %L', v_it)),
    ('master lê CRM de outro escritório',   'falha', 'authenticated', v_m_auth, format('select count(*) from crm_linhas where id = %L', v_lx)),
    ('master: fn_fechamentos de outro',     'falha', 'authenticated', v_m_auth, format('select count(*) from fn_fechamentos(%L, %L, %L)', v_x, v_hoje, v_hoje)),
    ('master altera precificação de outro', 'falha', 'authenticated', v_m_auth, format('update precificacoes set nome = %L where id = %L', 'x', v_px)),
    ('master marca modelo como da Prolu',   'falha', 'authenticated', v_m_auth, format('update modelos_precificacao set is_prolu = true where id = %L', v_mt)),
    ('master cria modelo da Prolu',         'falha', 'authenticated', v_m_auth, format('insert into modelos_precificacao (empresa_id, is_prolu, nome) values (%L, true, %L)', v_t, 'x')),
    ('master altera modelo da Prolu',       'falha', 'authenticated', v_m_auth, format('update modelos_precificacao set nome = %L where id = %L', 'x', v_mp)),
    ('master cria etapa em modelo da Prolu','falha', 'authenticated', v_m_auth, format('insert into modelo_etapas (modelo_id, nome) values (%L, %L)', v_mp, 'x')),
    -- ── prolu_admin: lê qualquer escritório, grava só no dele e nos da Prolu ──
    ('prolu_admin lê CRM de outro',         'passa', 'authenticated', v_p_auth, format('select count(*) from crm_linhas where id = %L', v_lx)),
    ('prolu_admin lê ficha de outro',       'passa', 'authenticated', v_p_auth, format('select count(*) from crm_fichas where linha_id = %L', v_lx)),
    ('prolu_admin lê subtarefa de outro',   'passa', 'authenticated', v_p_auth, format('select count(*) from precificacao_subtarefas where id = %L', v_px_sub)),
    ('prolu_admin: fn_fechamentos de outro','passa', 'authenticated', v_p_auth, format('select count(*) from fn_fechamentos(%L, %L, %L)', v_x, v_hoje, v_hoje)),
    ('prolu_admin: fechamentos de todos',   'passa', 'authenticated', v_p_auth, format('select count(*) from fn_fechamentos_periodo(null, %L, %L)', v_hoje, v_hoje)),
    ('prolu_admin altera precificação de outro', 'falha', 'authenticated', v_p_auth, format('update precificacoes set nome = %L where id = %L', 'x', v_px)),
    ('prolu_admin cria etiqueta em outro',  'falha', 'authenticated', v_p_auth, format('insert into precificacao_etiquetas_cadastro (empresa_id, nome) values (%L, %L)', v_x, 'x')),
    ('prolu_admin altera CRM de outro',     'falha', 'authenticated', v_p_auth, format('update crm_linhas set valores = valores where id = %L', v_lx)),
    ('prolu_admin altera modelo de outro',  'falha', 'authenticated', v_p_auth, format('update modelos_precificacao set nome = %L where id = %L', 'x', v_mx)),
    ('prolu_admin altera precificação própria', 'passa', 'authenticated', v_p_auth, format('update precificacoes set nome = %L where id = %L', 'TESTE 062 admin', v_pt)),
    ('prolu_admin altera modelo da Prolu',  'passa', 'authenticated', v_p_auth, format('update modelos_precificacao set nome = %L where id = %L', 'TESTE 062 Prolu alterado', v_mp)),
    ('prolu_admin cria etapa em modelo da Prolu', 'passa', 'authenticated', v_p_auth, format('insert into modelo_etapas (modelo_id, nome) values (%L, %L)', v_mp, 'Nova'))
  ) as c(nome, esperado, papel, ator, sql1) loop
    v_msg := null;
    begin
      perform set_config('request.jwt.claims',
        case when r.ator is null then jsonb_build_object('role', r.papel)
             else jsonb_build_object('sub', r.ator, 'role', r.papel) end::text, true);
      execute format('set local role %I', r.papel);

      if lower(left(btrim(r.sql1), 6)) = 'select' then
        execute r.sql1 into v_n;
      else
        execute r.sql1;
        get diagnostics v_n = row_count;
      end if;
      if coalesce(v_n, 0) = 0 then raise exception '0 linhas'; end if;

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

  raise exception E'RESULTADO DA MIGRATION 062 — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $cenarios$;
