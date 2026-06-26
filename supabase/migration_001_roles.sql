-- ════════════════════════════════════════════════════════════════
-- MIGRATION 001 — Permissões em 3 níveis + Convites
-- Rodar no SQL Editor do Supabase, depois do schema.sql original.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Ampliar os papéis possíveis ─────────
-- prolu_admin = você (André/Prolu) — único que edita Base de Conhecimento, Avisos, Citações
-- master      = dono/admin do escritório cliente — gerencia dados e usuários da própria empresa
-- comum       = colaborador do escritório — acesso à empresa, sem gerenciar usuários

alter table usuarios drop constraint if exists usuarios_role_check;
alter table usuarios add constraint usuarios_role_check
  check (role in ('prolu_admin', 'master', 'comum'));

-- ───────── 2. Corrigir a função de checagem de admin Prolu ─────────
-- Antes, auth_is_master() = role = 'master', o que dava poder de
-- editar Base de Conhecimento para qualquer dono de escritório cliente.
-- Agora separamos em duas funções com responsabilidades diferentes.

create or replace function auth_is_prolu_admin() returns boolean as $$
  select role = 'prolu_admin' from usuarios where auth_id = auth.uid()
$$ language sql stable security definer;

create or replace function auth_is_empresa_master() returns boolean as $$
  select role in ('prolu_admin', 'master') from usuarios where auth_id = auth.uid()
$$ language sql stable security definer;

-- Mantém auth_is_master() por compatibilidade, mas agora aponta para
-- "é prolu_admin" — que é o que ela deveria checar desde o início,
-- já que era usada só nas tabelas de conteúdo Prolu (avisos, citações, kb_*).
create or replace function auth_is_master() returns boolean as $$
  select auth_is_prolu_admin()
$$ language sql stable security definer;

-- ───────── 3. Tornar contato@prolu.com.br o prolu_admin ─────────
update usuarios set role = 'prolu_admin' where email = 'contato@prolu.com.br';

-- ───────── 4. Convites ─────────
-- Um master de empresa convida pessoas por email. O convite vira
-- usuário de verdade quando a pessoa aceita (cria conta com esse email).

create table convites (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'comum' check (role in ('master', 'comum')),
  convidado_por uuid references usuarios(id),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'expirado')),
  created_at timestamptz default now(),
  unique (empresa_id, email)
);

alter table convites enable row level security;

create policy "empresa vê seus convites" on convites
  for select using (empresa_id = auth_empresa_id());

create policy "master gerencia convites da empresa" on convites
  for all using (empresa_id = auth_empresa_id() and auth_is_empresa_master());

-- Permite que qualquer pessoa (mesmo sem empresa ainda) veja se existe
-- um convite pendente para o próprio email, no momento do cadastro.
create policy "qualquer um vê convite do próprio email" on convites
  for select using (email = (select email from auth.users where id = auth.uid()));

-- ───────── 5. Permitir que o próprio usuário se cadastre ─────────
-- Hoje só existia policy de "update" no próprio registro. Precisamos
-- de "insert" para o fluxo de auto-cadastro (criar empresa + virar master,
-- ou aceitar convite existente e entrar como comum/master na empresa convidada).

create policy "usuario cria o próprio registro" on usuarios
  for insert with check (auth_id = auth.uid());

-- Master da empresa também pode gerenciar (editar role, remover) outros
-- usuários da própria empresa.
create policy "master gerencia usuarios da empresa" on usuarios
  for all using (empresa_id = auth_empresa_id() and auth_is_empresa_master());

-- ───────── 6. Empresas: permitir criação por quem está se cadastrando ─────────
create policy "usuario autenticado cria empresa" on empresas
  for insert with check (auth.uid() is not null);

-- ───────── 7. Atualizar policies de conteúdo Prolu (kb_*, avisos, citações) ─────────
-- Essas já usam auth_is_master(), que agora aponta corretamente para
-- auth_is_prolu_admin(). Nenhuma alteração de policy necessária aqui —
-- só documentando que o comportamento mudou (ver passo 2 acima).
