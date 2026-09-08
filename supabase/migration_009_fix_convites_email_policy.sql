-- ════════════════════════════════════════════════════════════════
-- MIGRATION 009 — Corrige a policy de convites que quebrava o SELECT
-- Rodar no SQL Editor do Supabase.
--
-- A policy "qualquer um vê convite do próprio email" (migration_001)
-- consulta `auth.users` direto pra descobrir o e-mail de quem está
-- logado:
--
--   email = (select email from auth.users where id = auth.uid())
--
-- O role `authenticated` do PostgREST nunca teve GRANT SELECT em
-- auth.users (só `postgres` tem). RLS avalia o USING de TODAS as
-- policies permissivas aplicáveis, e o Postgres checa permissão de
-- acesso a `auth.users` na fase de abertura do plano — antes de
-- qualquer short-circuit do OR entre policies. Resultado: TODO select
-- em `convites` como usuário autenticado falhava com
-- "permission denied for table users" (42501), silenciosamente
-- engolido pelo destructuring de Promise.all em carregar(), então a
-- lista de convites pendentes nunca aparecia — para ninguém, master
-- ou gestor.
--
-- A troca usa auth.jwt() (lê o token já decodificado pelo PostgREST,
-- sem precisar de acesso à tabela) em vez de consultar auth.users.
-- ════════════════════════════════════════════════════════════════

drop policy if exists "qualquer um vê convite do próprio email" on convites;
create policy "qualquer um vê convite do próprio email" on convites
  for select using (email = (auth.jwt() ->> 'email'));
