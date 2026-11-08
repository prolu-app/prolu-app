-- ════════════════════════════════════════════════════════════════
-- Testes da migration_063 (Gestão de Projetos: Base).
-- Rodar DEPOIS dela. UM BLOCO DE CADA VEZ.
--   Bloco 1 só lê.
--   Bloco 2 SEMPRE termina com um erro "RESULTADO …" de propósito: o
--   relatório vem na mensagem e o erro desfaz tudo (nada fica gravado).
--   Usa o escritório de TESTE (master andresouzavr@gmail.com, que precisa
--   estar mentoria/ativa; o teste NÃO muda plano nem status dele) e cria só
--   dentro da transação: gestor, comum, outra pessoa e um prolu_admin
--   temporários nesse escritório, e um escritório "TESTE 063 X" (plano
--   starter, com master próprio) para os cenários de outro escritório e de
--   vitrine. Não toca em escritório de cliente.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura (esperado: todas as linhas com ok = true) ──
select 'tabelas criadas' as item,
       to_regclass('public.projetos') is not null
       and to_regclass('public.projeto_financeiro') is not null
       and to_regclass('public.projeto_itens') is not null as ok
union all select 'NÃO existem comentários, apontamentos nem custos de projeto',
       to_regclass('public.projeto_comentarios') is null
       and to_regclass('public.projeto_apontamentos') is null
       and to_regclass('public.projeto_custos') is null
union all select 'RLS ligada nas três tabelas',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.projetos'::regclass, 'public.projeto_financeiro'::regclass, 'public.projeto_itens'::regclass))
union all select 'índices únicos parciais (nome_oficial, crm_linha_id)',
       exists (select 1 from pg_indexes where indexname = 'projetos_nome_oficial_unico')
       and exists (select 1 from pg_indexes where indexname = 'projetos_crm_linha_unico')
union all select 'índices de itens (árvore, prazo e responsável em aberto)',
       exists (select 1 from pg_indexes where indexname = 'projeto_itens_arvore_idx')
       and exists (select 1 from pg_indexes where indexname = 'projeto_itens_prazo_aberto_idx')
       and exists (select 1 from pg_indexes where indexname = 'projeto_itens_responsavel_aberto_idx')
union all select 'itens: gatilho de integridade; sem a regra antiga da etapa',
       exists (select 1 from pg_trigger where tgname = 'projeto_itens_1_integridade' and tgrelid = 'public.projeto_itens'::regclass)
       and not exists (select 1 from pg_trigger where tgname = 'projeto_itens_2_permissao')
       and to_regprocedure('public.projeto_itens_permissao()') is null
union all select 'projetos: gatilho projetos_permissao existe e é INVOKER',
       exists (select 1 from pg_trigger where tgname = 'projetos_permissao' and tgrelid = 'public.projetos'::regclass)
       and not (select prosecdef from pg_proc where oid = 'public.projetos_permissao()'::regprocedure)
union all select 'projetos: policy "master e gestor gravam" no lugar de "master grava"',
       exists (select 1 from pg_policies where tablename = 'projetos' and policyname = 'projetos: master e gestor gravam')
       and not exists (select 1 from pg_policies where tablename = 'projetos' and policyname = 'projetos: master grava')
union all select 'empresa_libera conhece gestao_projetos',
       pg_get_functiondef('public.empresa_libera(uuid, text)'::regprocedure) ~ 'gestao_projetos'
union all select 'policies RESTRICTIVE de plano nas três tabelas (3 cada)',
       (select count(*) from pg_policies
         where tablename in ('projetos', 'projeto_financeiro', 'projeto_itens')
           and permissive = 'RESTRICTIVE' and policyname like 'plano libera%') = 9
union all select 'anon sem acesso às tabelas',
       not has_table_privilege('anon', 'public.projetos', 'SELECT')
       and not has_table_privilege('anon', 'public.projeto_itens', 'INSERT')
       and not has_table_privilege('anon', 'public.projeto_financeiro', 'SELECT');


-- ── 2. Cenários (esperado: erro "RESULTADO DA MIGRATION 063 — falhas: 0 de 79") ──
--      "passa" = recebeu ou alterou ao menos 1 linha (e a verificação, se
--      houver, deu certo). "falha" = 0 linhas (RLS filtrou) ou erro.
do $cenarios$
declare
  c_inst constant uuid := '00000000-0000-0000-0000-000000000000';
  v_t uuid; v_m_auth uuid;                                   -- escritório de teste e master real
  v_g_auth uuid := gen_random_uuid();  v_g_id uuid;          -- gestor (temp, T)
  v_c_auth uuid := gen_random_uuid();                        -- comum (temp, T)
  v_r_auth uuid := gen_random_uuid();  v_r_id uuid;          -- pessoa que será removida (temp, T)
  v_p_auth uuid := gen_random_uuid();                        -- prolu_admin (temp, T = escritório dele)
  v_x uuid := gen_random_uuid();                             -- outro escritório (temp, starter)
  v_mx_auth uuid := gen_random_uuid(); v_mx_id uuid;
  v_cx uuid;                                                 -- cliente do escritório X
  v_pt uuid; v_et uuid; v_tt uuid; v_st uuid;                -- projeto ativo de T: etapa > tarefa > subtarefa
  v_pa uuid; v_ea uuid;                                      -- projeto arquivado de T
  v_pg uuid;                                                 -- projeto de T sem financeiro
  v_px uuid; v_ex uuid;                                      -- projeto de X
  r record; v_n bigint; v_ok boolean; v_msg text; v_res text;
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
      (v_g_auth,  'teste063.gestor@exemplo.invalid'),
      (v_c_auth,  'teste063.comum@exemplo.invalid'),
      (v_r_auth,  'teste063.removida@exemplo.invalid'),
      (v_p_auth,  'teste063.admin@exemplo.invalid'),
      (v_mx_auth, 'teste063.masterx@exemplo.invalid')
    ) as f(a, e);

  insert into empresas (id, nome) values (v_x, 'TESTE 063 escritório X');  -- nasce starter/ativa

  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_g_auth, v_t, 'Teste 063 gestor', 'teste063.gestor@exemplo.invalid', 'gestor') returning id into v_g_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_c_auth, v_t, 'Teste 063 comum', 'teste063.comum@exemplo.invalid', 'comum');
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_r_auth, v_t, 'Teste 063 removida', 'teste063.removida@exemplo.invalid', 'comum') returning id into v_r_id;
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_p_auth, v_t, 'Teste 063 admin', 'teste063.admin@exemplo.invalid', 'prolu_admin');
  insert into usuarios (auth_id, empresa_id, nome, email, role)
    values (v_mx_auth, v_x, 'Teste 063 master X', 'teste063.masterx@exemplo.invalid', 'master') returning id into v_mx_id;

  insert into clientes (empresa_id, nome) values (v_x, 'TESTE 063 cliente X') returning id into v_cx;

  -- Projetos e itens (como SQL Editor: os gatilhos de integridade rodam)
  insert into projetos (empresa_id, nome, nome_oficial, situacao)
    values (v_t, 'TESTE 063 ativo', 'TESTE-063-OFICIAL', 'ativo') returning id into v_pt;
  insert into projeto_itens (projeto_id, nome) values (v_pt, 'Etapa') returning id into v_et;
  insert into projeto_itens (projeto_id, parent_id, nome, responsavel_id)
    values (v_pt, v_et, 'Tarefa', v_r_id) returning id into v_tt;
  insert into projeto_itens (projeto_id, parent_id, nome, status)
    values (v_pt, v_tt, 'Subtarefa', 'concluido') returning id into v_st;
  insert into projeto_financeiro (projeto_id, valor_fechado) values (v_pt, 10000);

  insert into projetos (empresa_id, nome) values (v_t, 'TESTE 063 sem financeiro') returning id into v_pg;
  insert into projetos (empresa_id, nome, situacao) values (v_t, 'TESTE 063 arquivado', 'arquivado') returning id into v_pa;
  insert into projeto_itens (projeto_id, nome) values (v_pa, 'Etapa arquivada') returning id into v_ea;

  insert into projetos (empresa_id, nome) values (v_x, 'TESTE 063 X') returning id into v_px;
  insert into projeto_itens (projeto_id, nome) values (v_px, 'Etapa X') returning id into v_ex;
  insert into projeto_financeiro (projeto_id, valor_fechado) values (v_px, 5000);

  for r in select * from (values
    -- ── quem vê ──
    ('comum não vê projeto_financeiro',          'falha', 'authenticated', v_c_auth, format('select count(*) from projeto_financeiro where projeto_id = %L', v_pt), null::text),
    ('gestor não vê projeto_financeiro',         'falha', 'authenticated', v_g_auth, format('select count(*) from projeto_financeiro where projeto_id = %L', v_pt), null),
    ('master vê projeto_financeiro',             'passa', 'authenticated', v_m_auth, format('select count(*) from projeto_financeiro where projeto_id = %L', v_pt), null),
    ('prolu_admin lê financeiro de outro',       'passa', 'authenticated', v_p_auth, format('select count(*) from projeto_financeiro where projeto_id = %L', v_px), null),
    ('comum vê projeto ativo',                   'passa', 'authenticated', v_c_auth, format('select count(*) from projetos where id = %L', v_pt), null),
    ('comum vê itens do projeto ativo',          'passa', 'authenticated', v_c_auth, format('select count(*) from projeto_itens where projeto_id = %L', v_pt), null),
    ('comum não vê projeto arquivado',           'falha', 'authenticated', v_c_auth, format('select count(*) from projetos where id = %L', v_pa), null),
    ('gestor não vê itens do arquivado',         'falha', 'authenticated', v_g_auth, format('select count(*) from projeto_itens where projeto_id = %L', v_pa), null),
    ('master vê projeto arquivado',              'passa', 'authenticated', v_m_auth, format('select count(*) from projetos where id = %L', v_pa), null),
    ('escritório A não vê projeto de B',         'falha', 'authenticated', v_m_auth, format('select count(*) from projetos where id = %L', v_px), null),
    ('escritório A não vê itens de B',           'falha', 'authenticated', v_c_auth, format('select count(*) from projeto_itens where projeto_id = %L', v_px), null),
    ('prolu_admin lê projeto de outro',          'passa', 'authenticated', v_p_auth, format('select count(*) from projetos where id = %L', v_px), null),
    ('anon não vê projetos',                     'falha', 'anon',          null::uuid, format('select count(*) from projetos where id = %L', v_pt), null),
    ('escritório B não vê projeto de A',         'falha', 'authenticated', v_mx_auth, format('select count(*) from projetos where id = %L', v_pt), null),
    ('escritório B não vê financeiro de A',      'falha', 'authenticated', v_mx_auth, format('select count(*) from projeto_financeiro where projeto_id = %L', v_pt), null),
    -- ── projeto: master e gestor gravam; comum não ──
    ('comum não cria projeto',                   'falha', 'authenticated', v_c_auth, format('insert into projetos (empresa_id, nome) values (%L, %L)', v_t, 'x'), null),
    ('comum não renomeia projeto',               'falha', 'authenticated', v_c_auth, format('update projetos set nome = %L where id = %L', 'x', v_pt), null),
    ('comum não exclui projeto',                 'falha', 'authenticated', v_c_auth, format('delete from projetos where id = %L', v_pt), null),
    ('gestor cria projeto avulso',               'passa', 'authenticated', v_g_auth, format('insert into projetos (empresa_id, nome, cidade) values (%L, %L, %L)', v_t, 'TESTE 063 do gestor', 'Curitiba'),
      format('select created_by = %L and origem = %L from projetos where empresa_id = %L and nome = %L', v_g_id, 'avulso', v_t, 'TESTE 063 do gestor')),
    ('gestor renomeia projeto (nome oficial fica)', 'passa', 'authenticated', v_g_auth, format('update projetos set nome = %L where id = %L', 'Renomeado pelo gestor', v_pt),
      format('select nome_oficial = %L from projetos where id = %L', 'TESTE-063-OFICIAL', v_pt)),
    ('gestor edita cidade, datas e situação',    'passa', 'authenticated', v_g_auth, format('update projetos set cidade = %L, data_inicio = current_date, prazo_final = current_date + 60, situacao = %L where id = %L', 'Recife', 'pausado', v_pt), null),
    ('gestor exclui projeto (itens e financeiro vão junto)', 'passa', 'authenticated', v_g_auth, format('delete from projetos where id = %L', v_pt),
      format('select not exists (select 1 from projeto_financeiro where projeto_id = %L) and not exists (select 1 from projeto_itens where projeto_id = %L)', v_pt, v_pt)),
    ('gestor não cria projeto com nome oficial', 'falha', 'authenticated', v_g_auth, format('insert into projetos (empresa_id, nome, nome_oficial) values (%L, %L, %L)', v_t, 'x', 'TESTE-063-G'), null),
    ('gestor não altera nome oficial',           'falha', 'authenticated', v_g_auth, format('update projetos set nome_oficial = %L where id = %L', 'TESTE-063-G', v_pt), null),
    ('gestor não apaga nome oficial',            'falha', 'authenticated', v_g_auth, format('update projetos set nome_oficial = null where id = %L', v_pt), null),
    ('gestor não arquiva projeto',               'falha', 'authenticated', v_g_auth, format('update projetos set situacao = %L where id = %L', 'arquivado', v_pt), null),
    ('gestor não cria projeto do CRM',           'falha', 'authenticated', v_g_auth, format('insert into projetos (empresa_id, nome, origem) values (%L, %L, %L)', v_t, 'x', 'crm'), null),
    ('gestor não altera projeto arquivado',      'falha', 'authenticated', v_g_auth, format('update projetos set nome = %L where id = %L', 'x', v_pa), null),
    ('gestor não exclui projeto arquivado',      'falha', 'authenticated', v_g_auth, format('delete from projetos where id = %L', v_pa), null),
    ('gestor não altera projeto de outro escritório', 'falha', 'authenticated', v_g_auth, format('update projetos set nome = %L where id = %L', 'x', v_px), null),
    ('gestor não cria projeto em outro escritório', 'falha', 'authenticated', v_g_auth, format('insert into projetos (empresa_id, nome) values (%L, %L)', v_x, 'x'), null),
    -- ── financeiro: só master ──
    ('gestor não grava financeiro',              'falha', 'authenticated', v_g_auth, format('update projeto_financeiro set valor_fechado = 1 where projeto_id = %L', v_pt), null),
    ('gestor não cria financeiro',               'falha', 'authenticated', v_g_auth, format('insert into projeto_financeiro (projeto_id, valor_fechado) values (%L, 1)', v_pg), null),
    ('comum não grava financeiro',               'falha', 'authenticated', v_c_auth, format('insert into projeto_financeiro (projeto_id, valor_fechado) values (%L, 1)', v_pg), null),
    ('master cria projeto avulso',               'passa', 'authenticated', v_m_auth, format('insert into projetos (empresa_id, nome) values (%L, %L)', v_t, 'TESTE 063 novo'), null),
    ('master altera nome oficial',               'passa', 'authenticated', v_m_auth, format('update projetos set nome_oficial = %L where id = %L', 'TESTE-063-NOVO', v_pt), null),
    ('master arquiva projeto',                   'passa', 'authenticated', v_m_auth, format('update projetos set situacao = %L where id = %L', 'arquivado', v_pt), null),
    ('master grava financeiro',                  'passa', 'authenticated', v_m_auth, format('update projeto_financeiro set valor_fechado = 12000 where projeto_id = %L', v_pt), null),
    ('master cria financeiro',                   'passa', 'authenticated', v_m_auth, format('insert into projeto_financeiro (projeto_id, valor_fechado) values (%L, 1)', v_pg), null),
    ('master não cria projeto em outro escritório', 'falha', 'authenticated', v_m_auth, format('insert into projetos (empresa_id, nome) values (%L, %L)', v_x, 'x'), null),
    ('nome oficial repetido no escritório',      'falha', 'authenticated', v_m_auth, format('insert into projetos (empresa_id, nome, nome_oficial) values (%L, %L, %L)', v_t, 'x', 'teste-063-oficial'), null),
    -- ── etapa: qualquer papel do escritório ──
    ('comum cria etapa',                         'passa', 'authenticated', v_c_auth, format('insert into projeto_itens (projeto_id, nome) values (%L, %L)', v_pt, 'Etapa do comum'),
      format('select nivel = 1 from projeto_itens where projeto_id = %L and nome = %L', v_pt, 'Etapa do comum')),
    ('comum renomeia etapa',                     'passa', 'authenticated', v_c_auth, format('update projeto_itens set nome = %L where id = %L', 'Etapa renomeada', v_et), null),
    ('comum reordena etapa',                     'passa', 'authenticated', v_c_auth, format('update projeto_itens set ordem = 99 where id = %L', v_et), null),
    ('comum exclui etapa (tarefas vão junto)',   'passa', 'authenticated', v_c_auth, format('delete from projeto_itens where id = %L', v_et),
      format('select not exists (select 1 from projeto_itens where id in (%L, %L))', v_tt, v_st)),
    ('comum altera prazo da etapa',              'passa', 'authenticated', v_c_auth, format('update projeto_itens set prazo = current_date + 30, data_inicio = current_date where id = %L', v_et), null),
    ('comum altera status e responsável da etapa','passa', 'authenticated', v_c_auth, format('update projeto_itens set status = %L, responsavel_id = %L where id = %L', 'fazendo', v_g_id, v_et), null),
    ('gestor cria etapa',                        'passa', 'authenticated', v_g_auth, format('insert into projeto_itens (projeto_id, nome) values (%L, %L)', v_pt, 'Etapa do gestor'), null),
    ('gestor reordena etapa',                    'passa', 'authenticated', v_g_auth, format('update projeto_itens set ordem = 99 where id = %L', v_et), null),
    ('gestor exclui etapa',                      'passa', 'authenticated', v_g_auth, format('delete from projeto_itens where id = %L', v_et), null),
    ('comum não cria etapa no arquivado',        'falha', 'authenticated', v_c_auth, format('insert into projeto_itens (projeto_id, nome) values (%L, %L)', v_pa, 'x'), null),
    ('comum não exclui etapa do arquivado',      'falha', 'authenticated', v_c_auth, format('delete from projeto_itens where id = %L', v_ea), null),
    ('comum não cria etapa em outro escritório', 'falha', 'authenticated', v_c_auth, format('insert into projeto_itens (projeto_id, nome) values (%L, %L)', v_px, 'x'), null),
    ('comum não exclui etapa de outro escritório', 'falha', 'authenticated', v_c_auth, format('delete from projeto_itens where id = %L', v_ex), null),
    ('master renomeia etapa',                    'passa', 'authenticated', v_m_auth, format('update projeto_itens set nome = %L where id = %L', 'Etapa renomeada', v_et), null),
    ('master exclui etapa',                      'passa', 'authenticated', v_m_auth, format('delete from projeto_itens where id = %L', v_et),
      format('select not exists (select 1 from projeto_itens where id in (%L, %L))', v_tt, v_st)),
    -- ── tarefas e subtarefas: qualquer papel ──
    ('gestor cria tarefa',                       'passa', 'authenticated', v_g_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_pt, v_et, 'Nova tarefa'), null),
    ('gestor exclui tarefa',                     'passa', 'authenticated', v_g_auth, format('delete from projeto_itens where id = %L', v_tt), null),
    ('comum renomeia subtarefa',                 'passa', 'authenticated', v_c_auth, format('update projeto_itens set nome = %L where id = %L', 'Sub renomeada', v_st), null),
    ('comum cria subtarefa',                     'passa', 'authenticated', v_c_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_pt, v_tt, 'Nova sub'), null),
    ('comum não cria tarefa no arquivado',       'falha', 'authenticated', v_c_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_pa, v_ea, 'x'), null),
    -- ── plano starter: lê, não grava (escritório X) ──
    ('starter: master lê o próprio projeto',     'passa', 'authenticated', v_mx_auth, format('select count(*) from projetos where id = %L', v_px), null),
    ('starter: master não cria item',            'falha', 'authenticated', v_mx_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_px, v_ex, 'x'), null),
    ('starter: master não altera projeto',       'falha', 'authenticated', v_mx_auth, format('update projetos set nome = %L where id = %L', 'x', v_px), null),
    -- ── prolu_admin grava só no próprio escritório ──
    ('prolu_admin cria item no próprio',         'passa', 'authenticated', v_p_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_pt, v_et, 'Do admin'), null),
    ('prolu_admin não cria item em outro',       'falha', 'authenticated', v_p_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_px, v_ex, 'x'), null),
    ('prolu_admin não altera projeto de outro',  'falha', 'authenticated', v_p_auth, format('update projetos set nome = %L where id = %L', 'x', v_px), null),
    ('prolu_admin não grava financeiro de outro','falha', 'authenticated', v_p_auth, format('update projeto_financeiro set valor_fechado = 1 where projeto_id = %L', v_px), null),
    -- ── integridade ──
    ('empresa_id enviado é ignorado',            'passa', 'authenticated', v_m_auth, format('insert into projeto_itens (empresa_id, projeto_id, parent_id, nome) values (%L, %L, %L, %L)', v_x, v_pt, v_et, 'Integridade'),
      format('select empresa_id = %L from projeto_itens where nome = %L and projeto_id = %L', v_t, 'Integridade', v_pt)),
    ('nível calculado pelo pai',                 'passa', 'authenticated', v_m_auth, format('insert into projeto_itens (projeto_id, parent_id, nivel, nome) values (%L, %L, 3, %L)', v_pt, v_et, 'Nivel'),
      format('select nivel = 2 from projeto_itens where nome = %L and projeto_id = %L', 'Nivel', v_pt)),
    ('não existe quarto nível',                  'falha', 'authenticated', v_m_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_pt, v_st, 'x'), null),
    ('pai precisa ser do mesmo projeto',         'falha', 'authenticated', v_m_auth, format('insert into projeto_itens (projeto_id, parent_id, nome) values (%L, %L, %L)', v_pa, v_et, 'x'), null),
    ('item não muda de etapa',                   'falha', 'authenticated', v_m_auth, format('update projeto_itens set parent_id = %L where id = %L', v_ea, v_tt), null),
    ('responsável de outro escritório',          'falha', 'authenticated', v_m_auth, format('update projeto_itens set responsavel_id = %L where id = %L', v_mx_id, v_tt), null),
    ('concluir preenche concluido_em',           'passa', 'authenticated', v_g_auth, format('update projeto_itens set status = %L where id = %L', 'concluido', v_tt),
      format('select concluido_em is not null from projeto_itens where id = %L', v_tt)),
    ('reabrir limpa concluido_em',               'passa', 'authenticated', v_c_auth, format('update projeto_itens set status = %L where id = %L', 'a_fazer', v_st),
      format('select concluido_em is null from projeto_itens where id = %L', v_st)),
    ('pessoa removida vira "Sem responsável"',   'passa', 'postgres',      null::uuid, format('delete from usuarios where id = %L', v_r_id),
      format('select responsavel_id is null from projeto_itens where id = %L', v_tt)),
    ('cliente de outro escritório no projeto',   'falha', 'authenticated', v_m_auth, format('update projetos set cliente_id = %L where id = %L', v_cx, v_pt), null),
    ('tags limpas e sem repetição',              'passa', 'authenticated', v_m_auth, format('update projetos set tags = %L::text[] where id = %L', '{" casa ",casa,"",reforma}', v_pt),
      format('select tags = %L::text[] from projetos where id = %L', '{casa,reforma}', v_pt))
  ) as c(nome, esperado, papel, ator, sql1, verifica) loop
    v_msg := null;
    begin
      perform set_config('request.jwt.claims',
        case when r.ator is null then jsonb_build_object('role', r.papel)
             else jsonb_build_object('sub', r.ator, 'role', r.papel) end::text, true);
      if r.papel <> 'postgres' then
        execute format('set local role %I', r.papel);
      end if;

      if lower(left(btrim(r.sql1), 6)) = 'select' then
        execute r.sql1 into v_n;
      else
        execute r.sql1;
        get diagnostics v_n = row_count;
      end if;
      if coalesce(v_n, 0) = 0 then raise exception '0 linhas'; end if;

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

  raise exception E'RESULTADO DA MIGRATION 063 — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $cenarios$;
