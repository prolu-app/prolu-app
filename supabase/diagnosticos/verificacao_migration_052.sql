-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_052 (cursos = pastas)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Todo bloco termina em ROLLBACK:
-- nada fica gravado (plano do escritório de teste, pastas e aulas de teste,
-- liberações — tudo é desfeito).
-- Escritório de teste: master andresouzavr@gmail.com.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estado após a migração (só leitura) ──
-- Pastas Prolu: as duas por ID com venda avulsa = Sim; as demais = Não (conferir)
select id, titulo, planos, tipos_usuario, venda_avulsa, ativo, checkout_url
  from kb_pastas where empresa_id is null order by ordem, titulo;
-- camada da 050 removida; nivel_acesso removido (esperado: tudo null / 0)
select to_regclass('public.cursos') as cursos, to_regclass('public.curso_planos') as curso_planos,
       to_regclass('public.curso_liberacoes') as curso_liberacoes,
       (select count(*) from information_schema.columns
         where table_name = 'kb_pastas' and column_name in ('curso_id', 'nivel_acesso')) as colunas_antigas;
-- todo escritório ativo (Mentoria) continua acessando as duas pastas atuais (esperado: 0 linhas)
select e.nome, p.titulo from empresas e cross join kb_pastas p
 where e.status_conta = 'ativa' and e.plano = 'mentoria' and p.empresa_id is null and p.ativo
   and kb_acesso_empresa_pasta(e.id, p.id) is null;


-- ── 2. Starter sem acesso a curso com venda avulsa: vitrine sem vazamento ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
-- esperado: 0 pastas e 0 aulas da pasta b1bce93c… pela API
select (select count(*) from kb_pastas where id = 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as pastas,
       (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id
         where m.pasta_id = 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as aulas;
-- vitrine: acesso false, venda_avulsa true, planos mentoria/consultoria; aulas só com id/titulo/tipo/ordem/planos/liberada
select kb_pasta_vitrine('b1bce93c-c93e-4a55-9910-45fe3611eac7') - 'modulos' as curso,
       kb_pasta_vitrine('b1bce93c-c93e-4a55-9910-45fe3611eac7') -> 'modulos' -> 0 -> 'aulas' -> 0 as primeira_aula;
-- nenhum PDF dessas aulas é legível (esperado: 0) — sem objeto legível, sem URL assinada
select count(*) as pdfs_legiveis from storage.objects o
 where o.bucket_id = 'kb-pdfs'
   and exists (select 1 from kb_aulas a where split_part(a.pdf_url, '/kb-pdfs/', 2) = o.name);
reset role;
rollback;


-- ── 3. Liberação avulsa: só o escritório de teste; revogar fecha ──
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000052', 'Outro Starter 052');
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select liberar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'),
                     'b1bce93c-c93e-4a55-9910-45fe3611eac7', 'manual', 'teste 052');
-- esperado: teste = avulso, outro = null
select kb_acesso_empresa_pasta((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as teste,
       kb_acesso_empresa_pasta('00000000-0000-0000-0000-000000000052', 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as outro;
-- escritório avulso vê TODAS as aulas (venda avulsa = tudo ou nada): esperado todas liberada = true
select bool_and((a->>'liberada')::boolean) as todas_liberadas
  from jsonb_array_elements((select kb_pasta_vitrine('b1bce93c-c93e-4a55-9910-45fe3611eac7',
         (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')))->'modulos') m,
       jsonb_array_elements(m->'aulas') a;
select revogar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'),
                     'b1bce93c-c93e-4a55-9910-45fe3611eac7', 'teste 052');
select kb_acesso_empresa_pasta((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as depois_de_revogar; -- null
rollback;


-- ── 4. Curso de ativação (venda avulsa = Não) liberado ao Starter, 2 aulas só Pro/Business ──
begin;
insert into kb_pastas (id, titulo, subtitulo, empresa_id, ordem, planos, venda_avulsa, tipos_usuario)
values ('00000000-0000-0000-0000-00000000a052', 'Ativação TESTE 052', 'teste', null, 99,
        '{starter,pro,business,mentoria,consultoria}', false, '{master,gestor,comum}');
insert into kb_modulos (id, pasta_id, titulo, ordem) values ('00000000-0000-0000-0000-00000000b052', '00000000-0000-0000-0000-00000000a052', 'Módulo 1', 0);
insert into kb_aulas (id, modulo_id, titulo, ordem, youtube_url, planos) values
  ('00000000-0000-0000-0000-0000000c0521', '00000000-0000-0000-0000-00000000b052', 'Aula livre 1', 0, 'https://youtu.be/aaaaaaaaaaa', '{}'),
  ('00000000-0000-0000-0000-0000000c0522', '00000000-0000-0000-0000-00000000b052', 'Aula livre 2', 1, 'https://youtu.be/bbbbbbbbbbb', '{}'),
  ('00000000-0000-0000-0000-0000000c0523', '00000000-0000-0000-0000-00000000b052', 'Aula Pro 1', 2, 'https://youtu.be/ccccccccccc', '{pro,business}'),
  ('00000000-0000-0000-0000-0000000c0524', '00000000-0000-0000-0000-00000000b052', 'Aula Pro 2', 3, 'https://youtu.be/ddddddddddd', '{pro,business}');

-- Starter: vê a pasta e só as 2 aulas livres (esperado: pasta 1, aulas 2)
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select (select count(*) from kb_pastas where id = '00000000-0000-0000-0000-00000000a052') as pasta,
       (select count(*) from kb_aulas where modulo_id = '00000000-0000-0000-0000-00000000b052') as aulas,
       (select string_agg(titulo, ', ') from kb_aulas where modulo_id = '00000000-0000-0000-0000-00000000b052') as quais;
-- vitrine marca as restritas como liberada = false (título só)
select a->>'titulo' as aula, a->>'liberada' as liberada, a->'planos' as planos
  from jsonb_array_elements(kb_pasta_vitrine('00000000-0000-0000-0000-00000000a052')->'modulos'->0->'aulas') a;
reset role;

-- Pro e Business: veem as 4 (esperado: 4 e 4).
-- Antes de trocar o plano, limpa a identidade simulada: com ela ativa, o
-- gatilho do Passo 1 entende que é o próprio master trocando o plano e recusa.
select set_config('request.jwt.claims', '', true);
update empresas set plano = 'pro' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as aulas_pro from kb_aulas where modulo_id = '00000000-0000-0000-0000-00000000b052';
reset role;
select set_config('request.jwt.claims', '', true);
update empresas set plano = 'business' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as aulas_business from kb_aulas where modulo_id = '00000000-0000-0000-0000-00000000b052';
reset role;
select set_config('request.jwt.claims', '', true);

-- curso sem venda avulsa recusa liberação avulsa e link de compra (esperado: ERRO em cada um; rode um de cada vez)
-- select liberar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), '00000000-0000-0000-0000-00000000a052');
-- update kb_pastas set checkout_url = 'https://x.com' where id = '00000000-0000-0000-0000-00000000a052';  -- vira null (normalizado)
select checkout_url from kb_pastas where id = '00000000-0000-0000-0000-00000000a052';
rollback;


-- ── 5. Curso de ativação SEM acesso: upgrade, sem "Comprar" ──
begin;
insert into kb_pastas (id, titulo, empresa_id, ordem, planos, venda_avulsa)
values ('00000000-0000-0000-0000-00000000a152', 'Ativação só Business TESTE', null, 99, '{business}', false);
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
-- esperado: acesso false, venda_avulsa false, checkout_url null → front mostra "Fazer upgrade" (/planos?plano=business)
select c->>'titulo', c->>'acesso', c->>'venda_avulsa', c->>'checkout_url', c->'planos'
  from jsonb_array_elements(kb_cursos()) c where c->>'id' = '00000000-0000-0000-0000-00000000a152';
reset role;
rollback;


-- ── 6. Venda avulsa = Sim não aceita regra por aula (UI e banco) ──
begin;
-- esperado: ERRO "Curso com venda avulsa: todas as aulas ficam liberadas…"
update kb_aulas set planos = '{pro}'
 where id = (select a.id from kb_aulas a join kb_modulos m on m.id = a.modulo_id
              where m.pasta_id = 'b1bce93c-c93e-4a55-9910-45fe3611eac7' limit 1);
rollback;


-- ── 7. Alternar venda avulsa nos dois sentidos (nada fica órfão) ──
begin;
insert into kb_pastas (id, titulo, empresa_id, ordem, planos, venda_avulsa)
values ('00000000-0000-0000-0000-00000000a252', 'Alternar TESTE', null, 99, '{mentoria}', false);
insert into kb_modulos (id, pasta_id, titulo, ordem) values ('00000000-0000-0000-0000-00000000b252', '00000000-0000-0000-0000-00000000a252', 'M', 0);
insert into kb_aulas (modulo_id, titulo, ordem, planos) values ('00000000-0000-0000-0000-00000000b252', 'Restrita', 0, '{consultoria}');
-- Não → Sim: a regra da aula é limpa (esperado: planos = {})
update kb_pastas set venda_avulsa = true where id = '00000000-0000-0000-0000-00000000a252';
select planos from kb_aulas where modulo_id = '00000000-0000-0000-0000-00000000b252';
-- libera um escritório; Sim → Não: a liberação é revogada com o motivo (esperado: revogada, "venda avulsa desativada")
select liberar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), '00000000-0000-0000-0000-00000000a252');
update kb_pastas set venda_avulsa = false, checkout_url = null where id = '00000000-0000-0000-0000-00000000a252';
select revogado_em is not null as revogada, revogado_motivo from kb_pasta_liberacoes where pasta_id = '00000000-0000-0000-0000-00000000a252';
rollback;


-- ── 8. Tipo de usuário: comum sem permissão não vê; master vê ──
begin;
-- as duas pastas atuais são só master: rebaixando o usuário de teste a "comum" (desfeito no rollback)
update usuarios set role = 'comum' where email = 'andresouzavr@gmail.com';
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
-- esperado: 0 pastas e o curso nem aparece em kb_cursos (nem vitrine)
select (select count(*) from kb_pastas where id = 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as pasta,
       (select count(*) from jsonb_array_elements(kb_cursos()) c where c->>'id' = 'b1bce93c-c93e-4a55-9910-45fe3611eac7') as em_kb_cursos;
reset role;
rollback;


-- ── 9. Escritório Mentoria (o de teste em mentoria/ativa) vê os dois cursos inteiros ──
begin;
update empresas set plano = 'mentoria', status_conta = 'ativa'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
-- esperado: as duas pastas e todas as aulas delas
select p.titulo,
       (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id) as aulas_visiveis
  from kb_pastas p where p.id in ('b1bce93c-c93e-4a55-9910-45fe3611eac7', 'a720fe69-b91d-48f4-9bfe-ee2d624a62a3');
reset role;
select p.titulo, (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id) as aulas_total
  from kb_pastas p where p.id in ('b1bce93c-c93e-4a55-9910-45fe3611eac7', 'a720fe69-b91d-48f4-9bfe-ee2d624a62a3');
rollback;
