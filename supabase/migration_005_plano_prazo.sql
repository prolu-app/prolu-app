-- ════════════════════════════════════════════════════════════════
-- MIGRATION 005 — Adiciona prazo opcional às ações do Plano Prático
-- Rodar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

alter table plano_acoes add column if not exists prazo date;
