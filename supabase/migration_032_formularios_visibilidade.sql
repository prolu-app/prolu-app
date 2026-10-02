-- ════════════════════════════════════════════════════════════════
-- MIGRATION 032 — Formulários: o que exibir no topo da página pública
-- Rodar no SQL Editor do Supabase.
--
-- Liga/desliga por elemento (aba Geral → "O que exibir na página"). Cada um só
-- aparece se estiver ligado E tiver conteúdo; o nome do escritório depende só
-- do liga/desliga. Quem aplica é a Edge Function `formulario-publico` (lê com
-- select('*'): pode ser publicada antes ou depois desta migration).
--
-- Os controles novos da aba Estilo NÃO precisam de migration: ficam dentro da
-- coluna formularios.estilo (jsonb, migration_028), como os demais.
-- ════════════════════════════════════════════════════════════════

alter table formularios
  add column if not exists exibir_nome_escritorio boolean not null default true,
  add column if not exists exibir_titulo boolean not null default true,
  add column if not exists exibir_logo boolean not null default true,
  add column if not exists exibir_capa boolean not null default true,
  add column if not exists exibir_introducao boolean not null default true;

-- a API (PostgREST) passa a enxergar as colunas novas na hora (ver migration_031)
notify pgrst, 'reload schema';
