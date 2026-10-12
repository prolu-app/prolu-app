-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_055 (base própria e Painel no Business + preço
-- da venda avulsa). Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Todo bloco
-- termina em ROLLBACK: nada fica gravado (plano do escritório de teste,
-- pastas e cursos de teste).
-- Escritório de teste: master andresouzavr@gmail.com.
-- Plano/status mudam ANTES de simular a identidade (com o JWT simulado o
-- gatilho empresas_protege_plano recusa) — mesmo cuidado da 052/054.
-- Blocos que esperam ERRO: depois do erro, rode só "rollback;".
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura (só leitura) ──
select column_name, data_type, numeric_precision, numeric_scale
  from information_schema.columns
 where table_schema = 'public' and table_name = 'kb_pastas' and column_name = 'preco_avulso';   -- numeric 10,2
select conname from pg_constraint where conname = 'kb_pastas_preco_valido';                      -- 1 linha
select pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'admin_salvar_acesso_curso';                         -- só a de 7 (… p_preco numeric)
select policyname, cmd from pg_policies
 where (tablename = 'kb_progresso' and policyname = 'gestor ve progresso da equipe')
    or (schemaname = 'storage' and policyname = 'kb-pdfs: escreve do escritorio ou prolu');      -- 2 linhas
-- escritórios de clientes: todos Mentoria/Consultoria → base_propria e kb_painel = true
select e.plano, e.status_conta, count(*) as escritorios,
       count(*) filter (where empresa_libera(e.id, 'base_propria')) as base_propria,
       count(*) filter (where empresa_libera(e.id, 'kb_painel')) as kb_painel
  from empresas e group by 1, 2 order by 1, 2;
-- pastas de escritório existentes (nada é apagado; só a escrita depende do plano)
select e.nome, e.plano, count(p.id) as pastas_proprias
  from kb_pastas p join empresas e on e.id = p.empresa_id group by 1, 2 order by 1;


-- ── 2. Matriz por plano ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'starter' as plano, empresa_libera(id, 'base_propria') as base_propria, empresa_libera(id, 'kb_painel') as painel
  from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- false, false
update empresas set plano = 'pro' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'pro', empresa_libera(id, 'base_propria'), empresa_libera(id, 'kb_painel')
  from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- false, false
update empresas set plano = 'business' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'business', empresa_libera(id, 'base_propria'), empresa_libera(id, 'kb_painel')
  from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- true, true
update empresas set plano = 'mentoria' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'mentoria', empresa_libera(id, 'base_propria'), empresa_libera(id, 'kb_painel')
  from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- true, true
update empresas set plano = 'consultoria' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'consultoria', empresa_libera(id, 'base_propria'), empresa_libera(id, 'kb_painel')
  from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- true, true
-- conta suspensa nunca libera
update empresas set plano = 'mentoria', status_conta = 'suspensa' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'mentoria suspensa', empresa_libera(id, 'base_propria')
  from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- false
rollback;


-- ── 3. Starter: lê a base própria, mas não edita nem apaga ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
-- pasta, módulo e aula do escritório criados aqui como superusuário (somem no rollback)
insert into kb_pastas (id, titulo, empresa_id) values
  ('00000000-0000-0000-0000-000000000551', 'Pasta 055', (select empresa_id from usuarios where email = 'andresouzavr@gmail.com'));
insert into kb_modulos (id, pasta_id, titulo, empresa_id) values
  ('00000000-0000-0000-0000-000000000552', '00000000-0000-0000-0000-000000000551', 'Módulo 055', (select empresa_id from usuarios where email = 'andresouzavr@gmail.com'));
insert into kb_aulas (id, modulo_id, titulo, empresa_id) values
  ('00000000-0000-0000-0000-000000000553', '00000000-0000-0000-0000-000000000552', 'Aula 055', (select empresa_id from usuarios where email = 'andresouzavr@gmail.com'));
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select (select count(*) from kb_pastas where id = '00000000-0000-0000-0000-000000000551') as le_pasta,    -- 1
       (select count(*) from kb_modulos where id = '00000000-0000-0000-0000-000000000552') as le_modulo,  -- 1
       (select count(*) from kb_aulas where id = '00000000-0000-0000-0000-000000000553') as le_aula;      -- 1
update kb_pastas set titulo = 'mudou' where id = '00000000-0000-0000-0000-000000000551' returning id;     -- 0 linhas
update kb_modulos set titulo = 'mudou' where id = '00000000-0000-0000-0000-000000000552' returning id;    -- 0 linhas
update kb_aulas set titulo = 'mudou' where id = '00000000-0000-0000-0000-000000000553' returning id;      -- 0 linhas
delete from kb_aulas where id = '00000000-0000-0000-0000-000000000553' returning id;                      -- 0 linhas
delete from kb_pastas where id = '00000000-0000-0000-0000-000000000551' returning id;                     -- 0 linhas
reset role;
rollback;


-- ── 4. Starter: criar pasta própria → ERRO (row-level security) ──
-- (troque 'starter' por 'pro' e rode de novo: mesmo ERRO)
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into kb_pastas (titulo, empresa_id) values ('Nova 055', auth_empresa_id()) returning id;   -- ERRO: new row violates row-level security
reset role;
rollback;


-- ── 5. Starter: upload de PDF do escritório no storage → ERRO ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into storage.objects (bucket_id, name) values ('kb-pdfs', auth_empresa_id()::text || '/teste_055.pdf') returning id;   -- ERRO (RLS)
reset role;
rollback;


-- ── 6. Business: cria, edita e apaga a base própria ──
-- (troque 'business' por 'mentoria' e rode de novo: mesmo resultado)
begin;
update empresas set plano = 'business' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into kb_pastas (id, titulo, empresa_id) values ('00000000-0000-0000-0000-000000000551', 'Pasta 055', auth_empresa_id()) returning id;   -- 1 linha
insert into kb_modulos (id, pasta_id, titulo, empresa_id)
values ('00000000-0000-0000-0000-000000000552', '00000000-0000-0000-0000-000000000551', 'Módulo 055', auth_empresa_id()) returning id;     -- 1 linha
insert into kb_aulas (id, modulo_id, titulo, empresa_id)
values ('00000000-0000-0000-0000-000000000553', '00000000-0000-0000-0000-000000000552', 'Aula 055', auth_empresa_id()) returning id;       -- 1 linha
update kb_aulas set titulo = 'mudou' where id = '00000000-0000-0000-0000-000000000553' returning titulo;    -- mudou
insert into storage.objects (bucket_id, name) values ('kb-pdfs', auth_empresa_id()::text || '/teste_055.pdf') returning name;   -- 1 linha
delete from kb_pastas where id = '00000000-0000-0000-0000-000000000551' returning id;                       -- 1 linha
reset role;
rollback;


-- ── 7. Painel: progresso da equipe só a partir do Business ──
-- Precisa de outra pessoa no escritório de teste com aula concluída; se a
-- equipe for só o master, "da_equipe" dá 0 nos dois planos (o bloco 1 da
-- lista abaixo mostra quem existe).
begin;
select u.nome, u.role, (select count(*) from kb_progresso k where k.usuario_id = u.id and k.concluida) as concluidas
  from usuarios u where u.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
update empresas set plano = 'pro' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'pro' as plano,
       (select count(*) from kb_progresso where usuario_id <> (select id from usuarios where auth_id = auth.uid())) as da_equipe,   -- 0
       (select count(*) from kb_progresso where usuario_id = (select id from usuarios where auth_id = auth.uid())) as proprio;      -- o seu, igual ao de antes
reset role;
select set_config('request.jwt.claims', '', true);   -- claims vazios: o gatilho de plano deixa mudar
update empresas set plano = 'business' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'business' as plano,
       (select count(*) from kb_progresso where usuario_id <> (select id from usuarios where auth_id = auth.uid())) as da_equipe,   -- = soma da equipe acima
       (select count(*) from kb_progresso where usuario_id = (select id from usuarios where auth_id = auth.uid())) as proprio;
reset role;
rollback;


-- ── 8. Preço: só em curso bloqueado com venda avulsa = Sim ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
-- dois cursos de teste (somem no rollback): A com venda avulsa e preço, B sem venda avulsa
insert into kb_pastas (id, titulo, planos, venda_avulsa, preco_avulso) values
  ('00000000-0000-0000-0000-0000000005a1', 'Curso A 055', '{mentoria,consultoria}', true, 297),
  ('00000000-0000-0000-0000-0000000005b1', 'Curso B 055', '{mentoria,consultoria}', false, null);
-- venda avulsa = Não não guarda preço (o gatilho limpa)
update kb_pastas set preco_avulso = 10 where id = '00000000-0000-0000-0000-0000000005b1' returning preco_avulso;   -- null
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select c->>'titulo' as curso, c->>'acesso' as acesso, c->>'preco' as preco
  from jsonb_array_elements(kb_cursos()) c where c->>'titulo' like 'Curso _ 055';   -- A: false, 297.00 · B: false, null
select kb_pasta_vitrine('00000000-0000-0000-0000-0000000005a1')->>'preco' as preco_vitrine;   -- 297.00
reset role;
-- com acesso pelo plano: sem preço
select set_config('request.jwt.claims', '', true);   -- claims vazios: o gatilho de plano deixa mudar
update empresas set plano = 'mentoria' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select c->>'titulo' as curso, c->>'acesso' as acesso, c->>'preco' as preco
  from jsonb_array_elements(kb_cursos()) c where c->>'titulo' like 'Curso _ 055';   -- A: true, null · B: true, null
select kb_pasta_vitrine('00000000-0000-0000-0000-0000000005a1')->>'preco' as preco_vitrine;   -- null
reset role;
-- com liberação avulsa: também sem preço (claims vazios = sessão do SQL Editor pode liberar)
select set_config('request.jwt.claims', '', true);
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select liberar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), '00000000-0000-0000-0000-0000000005a1', 'manual', 'teste 055');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select c->>'acesso' as acesso, c->>'preco' as preco
  from jsonb_array_elements(kb_cursos()) c where c->>'titulo' = 'Curso A 055';     -- true, null
reset role;
rollback;


-- ── 9. Salvar acesso (admin): validação e limpeza do preço ──
-- A função exige prolu_admin: o curso de teste é criado como superusuário e
-- simulamos o primeiro usuário prolu_admin cadastrado.
begin;
insert into kb_pastas (id, titulo, planos, venda_avulsa) values
  ('00000000-0000-0000-0000-0000000005a1', 'Curso A 055', '{mentoria}', true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where role = 'prolu_admin' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select admin_salvar_acesso_curso('00000000-0000-0000-0000-0000000005a1', '{mentoria}', '{master,gestor,comum}', true, true, null, 297.456);
select preco_avulso from kb_pastas where id = '00000000-0000-0000-0000-0000000005a1';   -- 297.46
-- venda avulsa vira Não: o preço é limpo
select admin_salvar_acesso_curso('00000000-0000-0000-0000-0000000005a1', '{mentoria}', '{master,gestor,comum}', true, false, null, null);
select venda_avulsa, preco_avulso from kb_pastas where id = '00000000-0000-0000-0000-0000000005a1';   -- false, null
reset role;
rollback;
-- os dois abaixo devem dar ERRO (rode um de cada vez, cada um com o seu rollback):
-- begin; insert into kb_pastas (id, titulo, planos, venda_avulsa) values ('00000000-0000-0000-0000-0000000005a1', 'Curso A 055', '{mentoria}', false);
--   select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from usuarios where role = 'prolu_admin' order by created_at limit 1), 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   select admin_salvar_acesso_curso('00000000-0000-0000-0000-0000000005a1', '{mentoria}', '{master}', true, false, null, 50);   -- ERRO: Preço só com venda avulsa = Sim.
-- rollback;
-- begin; insert into kb_pastas (id, titulo, planos, venda_avulsa) values ('00000000-0000-0000-0000-0000000005a1', 'Curso A 055', '{mentoria}', true);
--   select set_config('request.jwt.claims', json_build_object('sub', (select auth_id from usuarios where role = 'prolu_admin' order by created_at limit 1), 'role', 'authenticated')::text, true);
--   set local role authenticated;
--   select admin_salvar_acesso_curso('00000000-0000-0000-0000-0000000005a1', '{mentoria}', '{master}', true, true, null, -1);     -- ERRO: Preço inválido.
-- rollback;
