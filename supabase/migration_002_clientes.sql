-- ════════════════════════════════════════════════════════════════
-- MIGRATION 002 — Clientes e histórico de comentários de oportunidades
-- Rodar no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

create table clientes (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  created_at timestamptz default now()
);
alter table clientes enable row level security;
create policy "empresa vê seus clientes" on clientes
  for all using (empresa_id = auth_empresa_id());

create table oportunidade_comentarios (
  id uuid primary key default uuid_generate_v4(),
  linha_id uuid references crm_linhas(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  texto text not null,
  created_at timestamptz default now()
);
alter table oportunidade_comentarios enable row level security;
create policy "empresa vê comentários de suas oportunidades" on oportunidade_comentarios
  for all using (
    linha_id in (select id from crm_linhas where empresa_id = auth_empresa_id())
  );
