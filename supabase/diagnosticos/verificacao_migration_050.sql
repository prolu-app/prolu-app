-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_050 (cursos)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Os testes terminam em ROLLBACK.
-- Escritório de teste: master andresouzavr@gmail.com. Troque
-- 'master@outro.com' pelo de OUTRO escritório (para conferir que a liberação
-- avulsa vale só para um).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Backfill: um curso, 5 planos, todas as pastas Prolu nele ──
select c.titulo, c.ativo,
       (select string_agg(plano, ', ' order by plano_nivel(plano)) from curso_planos where curso_id = c.id) as planos,
       (select count(*) from kb_pastas where curso_id = c.id) as pastas
  from cursos c;
-- esperado: 0 (nenhuma pasta Prolu fora do curso)
select count(*) as pastas_prolu_sem_curso from kb_pastas where empresa_id is null and curso_id is null;


-- ── 2. Todo escritório ativo continua acessando o curso atual ──
-- esperado: 0 linhas
select e.nome, e.plano from empresas e
 where e.status_conta = 'ativa'
   and not empresa_acessa_curso(e.id, (select id from cursos order by ordem limit 1));


-- ── 3. Bucket de PDFs privado ──
-- esperado: public = false e só as policies de leitura/escrita novas
select id, public from storage.buckets where id = 'kb-pdfs';
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') || coalesce(with_check, '') like '%kb-pdfs%';


-- ── 4. Starter sem acesso, liberação avulsa e revogação (simulado) ──
begin;
-- curso só para Business+ e escritório de teste no Starter
delete from curso_planos where curso_id = (select id from cursos order by ordem limit 1) and plano in ('starter', 'pro');
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');

-- esperado: false (Starter sem o curso)
select empresa_acessa_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'),
                            (select id from cursos order by ordem limit 1)) as starter_acessa;

-- como o master de teste: pastas do curso somem; vitrine só com títulos
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as pastas_visiveis from kb_pastas where curso_id is not null;            -- esperado: 0
select count(*) as aulas_visiveis from kb_aulas;                                         -- esperado: só aulas de pastas do escritório
select kb_cursos() -> 0 -> 'acesso' as acesso, kb_cursos() -> 0 -> 'planos' as planos;  -- esperado: false, business..consultoria
-- vitrine: só id/título/tipo — sem youtube_url, pdf_url, descricao
select kb_pasta_vitrine((select id from kb_pastas where curso_id is not null limit 1)) -> 'modulos' -> 0 -> 'aulas' -> 0;
-- tentar liberar para si mesmo (descomente): esperado ERRO "Apenas a Prolu pode liberar cursos."
-- select liberar_curso(auth_empresa_id(), (select id from cursos limit 1));
reset role;
rollback;


-- ── 5. Liberação avulsa vale só para um escritório; revogar tira ──
begin;
delete from curso_planos where curso_id = (select id from cursos order by ordem limit 1) and plano in ('starter', 'pro');
update empresas set plano = 'starter'
 where id in (select empresa_id from usuarios where email in ('andresouzavr@gmail.com', 'master@outro.com'));
select liberar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'),
                     (select id from cursos order by ordem limit 1), 'manual', 'teste');
-- esperado: teste = true, outro = false
select empresa_acessa_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), (select id from cursos order by ordem limit 1)) as teste,
       empresa_acessa_curso((select empresa_id from usuarios where email = 'master@outro.com'), (select id from cursos order by ordem limit 1)) as outro;
select revogar_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'),
                     (select id from cursos order by ordem limit 1), 'teste');
-- esperado: false; e a liberação revogada continua no histórico
select empresa_acessa_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), (select id from cursos order by ordem limit 1)) as depois_de_revogar;
select origem, motivo, revogado_em is not null as revogada from curso_liberacoes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
rollback;


-- ── 6. Business libera curso listado; conta suspensa não acessa ──
begin;
delete from curso_planos where curso_id = (select id from cursos order by ordem limit 1) and plano in ('starter', 'pro');
update empresas set plano = 'business' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select empresa_acessa_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), (select id from cursos order by ordem limit 1)) as business; -- true
update empresas set status_conta = 'suspensa', suspensao_motivo = 'teste' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select empresa_acessa_curso((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), (select id from cursos order by ordem limit 1)) as suspensa; -- false
rollback;
