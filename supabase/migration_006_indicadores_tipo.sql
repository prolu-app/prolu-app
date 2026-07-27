-- ════════════════════════════════════════════════════════════════
-- MIGRATION 006 — Indicadores automáticos (derivados do CRM) vs manuais
-- Rodar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

alter table indicadores add column if not exists tipo text default 'manual'
  check (tipo in ('automatico', 'manual'));
alter table indicadores add column if not exists fonte_coluna text;

-- Backfill: se já existirem indicadores com os nomes padrão (criados antes
-- desta migration), marca como automáticos e associa a fonte de cálculo.
update indicadores set tipo = 'automatico', fonte_coluna = 'faturamento'
  where nome = 'Faturamento' and fonte_coluna is null;
update indicadores set tipo = 'automatico', fonte_coluna = 'ticket_medio'
  where nome = 'Ticket médio' and fonte_coluna is null;
update indicadores set tipo = 'automatico', fonte_coluna = 'projetos_fechados'
  where nome = 'Projetos fechados' and fonte_coluna is null;
update indicadores set tipo = 'automatico', fonte_coluna = 'pedidos_orcamento'
  where nome = 'Pedidos de orçamento' and fonte_coluna is null;
update indicadores set tipo = 'automatico', fonte_coluna = 'taxa_conversao'
  where nome = 'Taxa de conversão' and fonte_coluna is null;
