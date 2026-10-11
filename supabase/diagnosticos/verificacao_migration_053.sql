-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_053 (cenários de valor-hora)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Todo bloco termina em ROLLBACK:
-- nada fica gravado (cenários, papel do usuário, status da conta e o
-- escritório "outro" são desfeitos).
-- Escritório de teste: master andresouzavr@gmail.com.
-- Mudanças de plano/status/papel são feitas ANTES de simular a identidade
-- (com o JWT simulado, o gatilho empresas_protege_plano recusaria).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura (só leitura) ──
-- esperado: tabela existe, RLS ligada, 2 policies, gatilho de updated_at
select to_regclass('public.valor_hora_cenarios') as tabela,
       (select relrowsecurity from pg_class where oid = 'public.valor_hora_cenarios'::regclass) as rls,
       (select count(*) from pg_policies where tablename = 'valor_hora_cenarios') as policies,
       (select count(*) from pg_trigger where tgrelid = 'public.valor_hora_cenarios'::regclass
         and tgname = 'valor_hora_cenarios_touch') as gatilho;
select policyname, cmd, qual, with_check from pg_policies where tablename = 'valor_hora_cenarios';


-- ── 2. Master do escritório de teste: cria, lê, edita (updated_at anda), exclui ──
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into valor_hora_cenarios (id, empresa_id, nome, dados)
values ('00000000-0000-0000-0000-0000000a0531', auth_empresa_id(), 'Teste 053', '{"horasFuncionamento": 180}');
select id, nome, dados, created_at = updated_at as recem_criado
  from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0531'; -- 1 linha, true
update valor_hora_cenarios set nome = 'Teste 053 editado' where id = '00000000-0000-0000-0000-0000000a0531';
select nome from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0531'; -- 'Teste 053 editado'
-- dados precisa ser objeto (esperado: ERRO de check constraint ao descomentar)
-- insert into valor_hora_cenarios (empresa_id, nome, dados) values (auth_empresa_id(), 'x', '[]');
delete from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0531';
select count(*) as depois_de_excluir from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0531'; -- 0
reset role;
rollback;


-- ── 3. Outro escritório: o master de teste não lê nem grava lá ──
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000053', 'Outro 053');
insert into valor_hora_cenarios (id, empresa_id, nome) values
  ('00000000-0000-0000-0000-0000000a0532', '00000000-0000-0000-0000-000000000053', 'Cenário do outro');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
-- esperado: 0 (a menos que o e-mail de teste seja prolu_admin, que lê todos)
select count(*) as cenarios_do_outro from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0532';
-- esperado: 0 linhas alteradas
update valor_hora_cenarios set nome = 'invadido' where id = '00000000-0000-0000-0000-0000000a0532' returning id;
-- esperado: ERRO "new row violates row-level security policy" ao descomentar
-- insert into valor_hora_cenarios (empresa_id, nome) values ('00000000-0000-0000-0000-000000000053', 'x');
reset role;
rollback;


-- ── 4. Usuário não-master (gestor e comum): sem acesso ──
begin;
insert into valor_hora_cenarios (id, empresa_id, nome) values
  ('00000000-0000-0000-0000-0000000a0533', (select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), 'Cenário do master');
update usuarios set role = 'gestor' where email = 'andresouzavr@gmail.com';
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as gestor_le from valor_hora_cenarios;  -- 0
update valor_hora_cenarios set nome = 'x' where id = '00000000-0000-0000-0000-0000000a0533' returning id; -- 0 linhas
reset role;
select set_config('request.jwt.claims', '', true);
update usuarios set role = 'comum' where email = 'andresouzavr@gmail.com';
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as comum_le from valor_hora_cenarios;   -- 0
reset role;
rollback;


-- ── 5. Conta suspensa: master sem acesso ──
begin;
insert into valor_hora_cenarios (id, empresa_id, nome) values
  ('00000000-0000-0000-0000-0000000a0534', (select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), 'Cenário 053');
update empresas set status_conta = 'suspensa'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select auth_empresa_id() as empresa_vista;               -- null
select count(*) as le_com_conta_suspensa from valor_hora_cenarios;  -- 0
-- esperado: ERRO de RLS ao descomentar
-- insert into valor_hora_cenarios (empresa_id, nome) values ((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), 'x');
reset role;
rollback;


-- ── 6. prolu_admin: lê o cenário de outro escritório, mas não grava lá ──
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000053', 'Outro 053');
insert into valor_hora_cenarios (id, empresa_id, nome) values
  ('00000000-0000-0000-0000-0000000a0535', '00000000-0000-0000-0000-000000000053', 'Cenário do outro');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where role = 'prolu_admin' order by created_at limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as admin_le from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0535'; -- 1
update valor_hora_cenarios set nome = 'x' where id = '00000000-0000-0000-0000-0000000a0535' returning id; -- 0 linhas
delete from valor_hora_cenarios where id = '00000000-0000-0000-0000-0000000a0535' returning id;        -- 0 linhas
reset role;
rollback;
