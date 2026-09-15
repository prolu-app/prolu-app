-- ════════════════════════════════════════════════════════════════
-- MIGRATION 017 — Corrige/garante a policy de precificacao_etiquetas
-- Rodar no SQL Editor do Supabase.
--
-- precificacao_etiquetas é uma tabela que já existia no banco antes de
-- ser documentada aqui (ver nota no topo de migration_015). Insert de
-- etiqueta estava falhando (RLS bloqueando) — provável causa da tabela
-- nunca ter tido policy, ou ter uma policy que não cobre insert. Este
-- script garante a policy correta independente do que já existe.
-- ════════════════════════════════════════════════════════════════

alter table precificacao_etiquetas enable row level security;

drop policy if exists "empresa ve etiquetas prec" on precificacao_etiquetas;
create policy "empresa ve etiquetas prec" on precificacao_etiquetas
  for all using (
    precificacao_id in (
      select id from precificacoes where empresa_id = auth_empresa_id()
    ) or auth_is_prolu_admin()
  );
