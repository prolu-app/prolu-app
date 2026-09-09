-- ════════════════════════════════════════════════════════════════
-- MIGRATION 011 — Policy de UPDATE em empresas (faltava)
-- Rodar no SQL Editor do Supabase.
--
-- `empresas` tinha RLS habilitado (schema.sql) com policy de SELECT
-- ("usuarios veem a própria empresa") e de INSERT (migration_001/007),
-- mas nunca uma de UPDATE. Resultado: o master salvando o nome do
-- escritório em Configurações → Escritório sempre batia em 0 linhas
-- afetadas pela RLS — e como o update não usa .select(), o
-- supabase-js não reporta isso como erro (Prefer: return=minimal),
-- então a tela mostrava "Escritório atualizado" mesmo sem persistir
-- nada.
-- ════════════════════════════════════════════════════════════════

drop policy if exists "master atualiza a própria empresa" on empresas;
create policy "master atualiza a própria empresa" on empresas
  for update
  using (id = auth_empresa_id() and auth_is_empresa_master())
  with check (id = auth_empresa_id() and auth_is_empresa_master());
