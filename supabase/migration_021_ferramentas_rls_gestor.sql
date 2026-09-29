-- ════════════════════════════════════════════════════════════════
-- MIGRATION 021 — Seção Ferramentas fora do perfil comum (RLS)
-- Rodar no SQL Editor do Supabase.
--
-- O app já esconde Plano Prático e Cliente Ideal do perfil comum
-- (acesso.planoPratico / clienteIdeal em AuthContext.jsx), mas as tabelas
-- continuavam legíveis/graváveis por qualquer usuário da empresa via API.
--
-- Usa policies RESTRICTIVE: o Postgres faz AND delas com as policies
-- permissivas que já existem (empresa_id = auth_empresa_id() e as de
-- prolu_admin que existirem no banco). Nada é removido ou recriado — só
-- passa a exigir, além do que já era exigido, papel gestor ou superior.
--
-- auth_is_gestor_ou_superior() (migration 008) = prolu_admin, master ou
-- gestor. Sem registro em `usuarios` devolve null → acesso negado.
-- ════════════════════════════════════════════════════════════════

-- Plano Prático
drop policy if exists "ferramentas: so gestor ou superior" on plano_acoes;
create policy "ferramentas: so gestor ou superior" on plano_acoes
  as restrictive for all to public
  using (auth_is_gestor_ou_superior())
  with check (auth_is_gestor_ou_superior());

drop policy if exists "ferramentas: so gestor ou superior" on plano_tags;
create policy "ferramentas: so gestor ou superior" on plano_tags
  as restrictive for all to public
  using (auth_is_gestor_ou_superior())
  with check (auth_is_gestor_ou_superior());

-- Cliente Ideal
drop policy if exists "ferramentas: so gestor ou superior" on icp_perfis;
create policy "ferramentas: so gestor ou superior" on icp_perfis
  as restrictive for all to public
  using (auth_is_gestor_ou_superior())
  with check (auth_is_gestor_ou_superior());

-- Conferência (opcional): lista as policies dessas tabelas após rodar.
-- select tablename, policyname, permissive, cmd, qual
-- from pg_policies
-- where tablename in ('plano_acoes', 'plano_tags', 'icp_perfis')
-- order by tablename, permissive desc;
