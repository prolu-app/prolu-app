-- ════════════════════════════════════════════════════════════════
-- MIGRATION 007 — Garante as policies de INSERT usadas no cadastro
-- Rodar no SQL Editor do Supabase.
--
-- Corrige o erro "new row violates row-level security policy for
-- table empresas" (42501) no fluxo de cadastro. Essas policies já
-- existem em migration_001_roles.sql — esse arquivo só garante que
-- elas existem de fato no banco, recriando se necessário (idempotente,
-- seguro rodar mesmo que migration_001 já tenha sido aplicada).
-- ════════════════════════════════════════════════════════════════

drop policy if exists "usuario autenticado cria empresa" on empresas;
create policy "usuario autenticado cria empresa" on empresas
  for insert with check (auth.uid() is not null);

drop policy if exists "usuario cria o próprio registro" on usuarios;
create policy "usuario cria o próprio registro" on usuarios
  for insert with check (auth_id = auth.uid());

-- A tabela `convites` só existe se migration_001 já tiver rodado
-- (senão essa parte é ignorada, sem erro).
do $$
begin
  if to_regclass('public.convites') is not null then
    execute 'drop policy if exists "qualquer um vê convite do próprio email" on convites';
    execute $q$create policy "qualquer um vê convite do próprio email" on convites
      for select using (email = (select email from auth.users where id = auth.uid()))$q$;
  end if;
end $$;
