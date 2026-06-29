-- ════════════════════════════════════════════════════════════════
-- MIGRATION 004 — Corrige constraint de tipo em crm_colunas
--                 e adiciona coluna fixo (inclui o que a 003 fazia)
-- Rodar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- 1. Remove a constraint antiga que só aceitava os tipos legados.
--    Os tipos 'client' e 'tags' das colunas fixas eram bloqueados aqui,
--    fazendo o seed falhar silenciosamente.
alter table crm_colunas
  drop constraint if exists crm_colunas_tipo_check;

-- 2. Recria aceitando todos os tipos atuais.
alter table crm_colunas
  add constraint crm_colunas_tipo_check
  check (tipo in ('text', 'number', 'money', 'date', 'select', 'checkbox', 'client', 'tags'));

-- 3. Adiciona coluna fixo (seguro rodar mesmo se a migration 003 já foi rodada).
alter table crm_colunas
  add column if not exists fixo boolean not null default false;

-- 4. Marca como fixas quaisquer colunas que já tenham opcoes.fixed = true (legado).
update crm_colunas
  set fixo = true
  where opcoes is not null
    and jsonb_typeof(opcoes) = 'object'
    and (opcoes->>'fixed')::boolean = true
    and fixo = false;
