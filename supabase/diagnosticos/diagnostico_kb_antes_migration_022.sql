-- ════════════════════════════════════════════════════════════════
-- Diagnóstico ANTES da migration_022 — somente leitura, não altera nada.
-- Rodar no SQL Editor do Supabase e mandar o resultado das 2 consultas.
-- ════════════════════════════════════════════════════════════════

-- 1. Policies reais hoje nas tabelas da Base de Conhecimento e no bucket kb-pdfs
select schemaname, tablename, policyname, cmd, permissive, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('kb_pastas', 'kb_modulos', 'kb_aulas', 'kb_aula_pdfs'))
   or (schemaname = 'storage' and tablename = 'objects'
       and (qual ilike '%kb-pdfs%' or with_check ilike '%kb-pdfs%'))
order by schemaname, tablename, cmd;

-- 2. Módulos/aulas cujo empresa_id difere do da pasta/módulo pai
--    (com a regra nova, esses registros ficariam sem poder ser editados)
select 'modulo' as tipo, m.id, m.titulo, m.empresa_id, p.empresa_id as empresa_do_pai
from kb_modulos m join kb_pastas p on p.id = m.pasta_id
where m.empresa_id is distinct from p.empresa_id
union all
select 'aula', a.id, a.titulo, a.empresa_id, m.empresa_id
from kb_aulas a join kb_modulos m on m.id = a.modulo_id
where a.empresa_id is distinct from m.empresa_id;
