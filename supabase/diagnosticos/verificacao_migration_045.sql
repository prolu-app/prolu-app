-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_045 (planos e status da conta)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ (selecione o bloco e Run).
-- Nada aqui altera dados: os testes simulados terminam em ROLLBACK.
--
-- Escritório de teste: master andresouzavr@gmail.com
-- (não use um escritório real).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Backfill: todos os escritórios atuais em mentoria / ativa ──
-- Esperado: uma linha "mentoria | ativa | N" (mais os que você já trocou).
select plano, status_conta, count(*) from empresas group by 1, 2 order by 1, 2;


-- ── 2. Funções, trigger e policies criadas ──
-- Esperado: 5 funções, 1 trigger, 19 policies "plano libera …" (RESTRICTIVE)
-- e 1 "usuario vê o próprio registro" (PERMISSIVE)
select proname from pg_proc
 where proname in ('conta_atual', 'empresa_libera', 'plano_nivel', 'empresas_protege_plano', 'auth_empresa_id')
 order by 1;
select tgname from pg_trigger where tgname = 'empresas_protege_plano';
select tablename, policyname, permissive, cmd from pg_policies
 where policyname like 'plano libera%' or policyname = 'usuario vê o próprio registro'
 order by 1, 2;


-- ── 3. Como o master de teste: conta_atual() e auth_empresa_id() ──
-- Esperado: a empresa de teste com plano/status atuais, e o mesmo id.
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'),
  'role', 'authenticated')::text, true);
set local role authenticated;
select * from conta_atual();
select auth_empresa_id();
rollback;


-- ── 4. Master NÃO consegue trocar o próprio plano pela API ──
-- Esperado: ERRO "Plano e status da conta só podem ser alterados pela Prolu."
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'),
  'role', 'authenticated')::text, true);
set local role authenticated;
update empresas set plano = 'consultoria' where id = auth_empresa_id();
rollback;


-- ── 5. Cadastro novo nasce starter/ativa, mesmo pedindo outro plano ──
-- Esperado: "starter | ativa"
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'),
  'role', 'authenticated')::text, true);
set local role authenticated;
insert into empresas (id, nome, plano, status_conta)
values ('00000000-0000-0000-0000-000000000045', 'Teste 045', 'consultoria', 'suspensa');
reset role;
select plano, status_conta from empresas where id = '00000000-0000-0000-0000-000000000045';
rollback;


-- ── 6. Matriz no banco para o escritório de teste ──
-- Esperado (por plano):
--   starter  → todos false
--   pro      → painel_comercial, indicadores
--   business → + equipe_convites
--   mentoria / consultoria → todos true
--   conta suspensa → todos false
select r.recurso, empresa_libera(u.empresa_id, r.recurso) as libera
  from usuarios u
 cross join (values ('painel_comercial'), ('indicadores'), ('equipe_convites'), ('ferramentas_mentoria')) r(recurso)
 where u.email = 'andresouzavr@gmail.com';
