-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_046 (gestão de escritórios + histórico)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ.
-- Use só o escritório de teste (master andresouzavr@gmail.com); troque
-- 'contato@prolu.com.br' pelo e-mail do seu prolu_admin, se for outro.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Objetos criados ──
-- Esperado: tabela empresa_historico, 1 trigger, 4 funções
select to_regclass('public.empresa_historico') as tabela;
select tgname from pg_trigger where tgname = 'empresas_registra_historico';
select proname from pg_proc
 where proname in ('empresas_registra_historico', 'admin_alterar_plano', 'admin_alterar_status', 'admin_escritorio_equipe')
 order by 1;


-- ── 2. Mudança pelo SQL Editor também entra no histórico (origem 'sistema') ──
-- Desfeita no final (rollback). Esperado: 1 linha plano, origem sistema.
begin;
update empresas set plano = 'pro'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
   and plano <> 'pro';
select tipo, valor_anterior, valor_novo, origem, motivo from empresa_historico
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
 order by criado_em desc limit 1;
rollback;


-- ── 3. Master do escritório NÃO consegue usar as RPCs de admin ──
-- Esperado: ERRO "Apenas a Prolu pode alterar planos."
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'),
  'role', 'authenticated')::text, true);
set local role authenticated;
select admin_alterar_plano((select auth_empresa_id()), 'consultoria', 'teste');
rollback;


-- ── 4. Master NÃO lê o histórico ──
-- Esperado: 0 linhas
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'),
  'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from empresa_historico;
rollback;


-- ── 5. Como prolu_admin: equipe e Base de Conhecimento do escritório de teste ──
-- Esperado: uma linha por pessoa, com último login e kb_concluidas/kb_total
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'contato@prolu.com.br'),
  'role', 'authenticated')::text, true);
set local role authenticated;
select * from admin_escritorio_equipe((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'));
rollback;
