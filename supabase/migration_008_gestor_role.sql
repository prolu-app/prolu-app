-- ════════════════════════════════════════════════════════════════
-- MIGRATION 008 — Papel "gestor" no banco
-- Rodar no SQL Editor do Supabase.
--
-- O papel gestor foi adicionado no app (src/contexts/AuthContext.jsx —
-- isGestor/isGestorOuSuperior/acesso) e a tela Equipe já deixa convidar
-- e promover pessoas a Gestor, mas os constraints e as policies de RLS
-- no banco ainda só previam prolu_admin/master/comum. Sem essa migration:
--   - convidar alguém como Gestor falha (convites_role_check)
--   - aceitar esse convite e criar o usuário falha (usuarios_role_check)
--   - um Gestor tentando cancelar convite ou trocar o role de um colega
--     é bloqueado pela RLS (só master/prolu_admin tinham policy pra isso)
-- ════════════════════════════════════════════════════════════════

-- 1. Permite o valor 'gestor' em usuarios.role e convites.role
alter table usuarios drop constraint if exists usuarios_role_check;
alter table usuarios add constraint usuarios_role_check
  check (role in ('prolu_admin', 'master', 'gestor', 'comum'));

alter table convites drop constraint if exists convites_role_check;
alter table convites add constraint convites_role_check
  check (role in ('master', 'gestor', 'comum'));

-- 2. Função auxiliar: usuário é gestor, master ou prolu_admin.
create or replace function auth_is_gestor_ou_superior() returns boolean as $$
  select role in ('prolu_admin', 'master', 'gestor') from usuarios where auth_id = auth.uid()
$$ language sql stable security definer;

-- 3. Gestor pode criar e cancelar convites da própria empresa — mas nunca
-- com role = 'master' (a Edge Function invite-user já valida isso do lado
-- do servidor; esta policy é a garantia equivalente no banco, pro caso de
-- algum outro caminho de escrita direta na tabela).
drop policy if exists "gestor gerencia convites nao-master da empresa" on convites;
create policy "gestor gerencia convites nao-master da empresa" on convites
  for all
  using (empresa_id = auth_empresa_id() and auth_is_gestor_ou_superior())
  with check (empresa_id = auth_empresa_id() and auth_is_gestor_ou_superior() and role <> 'master');

-- 4. Gestor pode alterar o role de colegas que não são master/prolu_admin
-- (nunca promover a master, nunca tocar em quem já é master/prolu_admin).
-- Remover pessoas do escritório continua exclusivo do master, coberto
-- pela policy "master gerencia usuarios da empresa" já existente.
drop policy if exists "gestor altera role de nao-master da empresa" on usuarios;
create policy "gestor altera role de nao-master da empresa" on usuarios
  for update
  using (empresa_id = auth_empresa_id() and auth_is_gestor_ou_superior() and role not in ('master', 'prolu_admin'))
  with check (empresa_id = auth_empresa_id() and auth_is_gestor_ou_superior() and role not in ('master', 'prolu_admin'));
