-- ════════════════════════════════════════════════════════════════
-- MIGRATION 013 — aulas do tipo "Doc" na Base de Conhecimento
-- Rodar no SQL Editor do Supabase.
--
-- Terceiro tipo de aula, além de 'video' e 'pdf': texto rico (HTML do
-- Tiptap) editado e lido direto no app, sem YouTube nem upload de
-- arquivo. Reaproveita a coluna kb_aulas.tipo criada na migration 012.
-- ════════════════════════════════════════════════════════════════

alter table kb_aulas drop constraint if exists kb_aulas_tipo_check;
alter table kb_aulas add constraint kb_aulas_tipo_check
  check (tipo in ('video', 'pdf', 'doc'));

alter table kb_aulas
  add column if not exists conteudo_doc text;
