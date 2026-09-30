-- ════════════════════════════════════════════════════════════════
-- MIGRATION 025 — Formulários (Fase 1: modelo + builder no app)
-- Rodar no SQL Editor do Supabase ANTES do deploy do front que usa isso.
--
-- Um escritório pode ter vários formulários (ex: "Instagram", "Google Ads").
-- Respostas/submissões e acesso público (anon) ficam para a Fase 2 — por
-- isso aqui NÃO há policy para anon.
--
-- Acesso (mesma regra da Base de Conhecimento, migration_022):
--   leitura : master/prolu_admin do próprio escritório  +  prolu_admin em
--             qualquer escritório (suporte, só leitura)
--   escrita : master/prolu_admin do PRÓPRIO escritório (empresa_id =
--             auth_empresa_id()) — prolu_admin visitando outro escritório lê,
--             mas não edita
-- auth_is_empresa_master() = role in ('prolu_admin', 'master'). O gestor não
-- acessa: Formulários fica na seção Comercial, que é só master.
--
-- Tipos de campo (códigos em inglês, como crm_colunas.tipo; rótulos em
-- português ficam no app):
--   text = texto curto · textarea = texto longo · number = número ·
--   phone = telefone · email = e-mail · select = seleção com opções
-- opcoes: só para tipo = 'select'; mesmo formato das opções do CRM:
--   [{ "value": "Opção A" }, { "value": "Opção B" }]
-- ════════════════════════════════════════════════════════════════

create table if not exists formularios (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists formulario_campos (
  id uuid primary key default uuid_generate_v4(),
  formulario_id uuid not null references formularios(id) on delete cascade,
  label text not null default '',
  tipo text not null default 'text'
    check (tipo in ('text', 'textarea', 'number', 'phone', 'email', 'select')),
  obrigatorio boolean not null default false,
  ordem int not null default 0,
  opcoes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(opcoes) = 'array'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists formularios_empresa_idx on formularios (empresa_id);
create index if not exists formulario_campos_form_idx on formulario_campos (formulario_id, ordem);

-- updated_at do formulário acompanha qualquer mudança nele ou nos campos
-- (a lista mostra "editado em"); o app não precisa lembrar de atualizar.
create or replace function formularios_touch() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'formularios' then
    new.updated_at := now();
    return new;
  end if;
  if tg_op <> 'DELETE' then new.updated_at := now(); end if;
  update formularios set updated_at = now()
   where id = coalesce(new.formulario_id, old.formulario_id);
  return coalesce(new, old);
end $$;

drop trigger if exists formularios_touch on formularios;
create trigger formularios_touch before update on formularios
  for each row execute function formularios_touch();

drop trigger if exists formulario_campos_touch on formulario_campos;
create trigger formulario_campos_touch before insert or update or delete on formulario_campos
  for each row execute function formularios_touch();

-- ───────── RLS ─────────
alter table formularios enable row level security;
alter table formulario_campos enable row level security;

drop policy if exists "formularios: le proprio escritorio ou prolu_admin" on formularios;
create policy "formularios: le proprio escritorio ou prolu_admin" on formularios
  for select using (
    (empresa_id = auth_empresa_id() and auth_is_empresa_master())
    or auth_is_prolu_admin()
  );

drop policy if exists "formularios: master escreve no proprio escritorio" on formularios;
create policy "formularios: master escreve no proprio escritorio" on formularios
  for all using (empresa_id = auth_empresa_id() and auth_is_empresa_master())
  with check (empresa_id = auth_empresa_id() and auth_is_empresa_master());

-- campos herdam do formulário: a subquery em formularios passa pela RLS dele
drop policy if exists "formulario_campos: le se ve o formulario" on formulario_campos;
create policy "formulario_campos: le se ve o formulario" on formulario_campos
  for select using (formulario_id in (select id from formularios));

drop policy if exists "formulario_campos: master escreve no proprio escritorio" on formulario_campos;
create policy "formulario_campos: master escreve no proprio escritorio" on formulario_campos
  for all using (
    exists (select 1 from formularios f
             where f.id = formulario_id
               and f.empresa_id = auth_empresa_id() and auth_is_empresa_master())
  )
  with check (
    exists (select 1 from formularios f
             where f.id = formulario_id
               and f.empresa_id = auth_empresa_id() and auth_is_empresa_master())
  );
