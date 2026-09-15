-- ════════════════════════════════════════════════════════════════
-- MIGRATION 016 — Catálogo de etiquetas de Precificação
-- Rodar no SQL Editor do Supabase, depois da migration_015.
-- ════════════════════════════════════════════════════════════════

create table if not exists precificacao_etiquetas_cadastro (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  created_at timestamptz default now()
);
alter table precificacao_etiquetas_cadastro enable row level security;
create policy "empresa ve etiquetas cadastro" on precificacao_etiquetas_cadastro
  for all using (empresa_id = auth_empresa_id() or auth_is_prolu_admin());
