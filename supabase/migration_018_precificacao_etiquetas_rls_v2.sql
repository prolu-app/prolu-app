-- ════════════════════════════════════════════════════════════════
-- MIGRATION 018 — precificacao_etiquetas: RLS com WITH CHECK explícito
-- Rodar no SQL Editor do Supabase.
--
-- Antes de rodar, vale conferir o que já existe (cola o resultado se
-- ainda estiver bloqueando depois deste script):
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename = 'precificacao_etiquetas';
--
-- migration_017 já tentou consertar isso, mas sem WITH CHECK explícito
-- (fica implícito = USING pra policies FOR ALL, mas testando de novo
-- com WITH CHECK explícito pra eliminar essa variável). Também troca o
-- nome da policy — roda os drops abaixo pra não deixar duas policies
-- conflitantes (uma antiga com nome diferente pode ter sobrevivido).
-- ════════════════════════════════════════════════════════════════

alter table precificacao_etiquetas enable row level security;

drop policy if exists "empresa ve etiquetas prec" on precificacao_etiquetas;
drop policy if exists "empresa gerencia etiquetas prec" on precificacao_etiquetas;
drop policy if exists "empresa gerencia etiquetas de suas precificacoes" on precificacao_etiquetas;

create policy "empresa gerencia etiquetas prec" on precificacao_etiquetas
  for all
  using (
    precificacao_id in (
      select id from precificacoes
      where empresa_id = auth_empresa_id()
    ) or auth_is_prolu_admin()
  )
  with check (
    precificacao_id in (
      select id from precificacoes
      where empresa_id = auth_empresa_id()
    ) or auth_is_prolu_admin()
  );
