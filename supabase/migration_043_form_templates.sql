-- ════════════════════════════════════════════════════════════════
-- MIGRATION 043 — Modelos de formulário (Prolu)
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
--
-- A Prolu (prolu_admin) monta modelos em /admin/modelos-formulario; ao
-- criar um formulário, o escritório pode começar de um modelo ativo — os
-- campos são copiados para formulario_campos (sem coluna do CRM; o
-- escritório mapeia depois). O formulário criado não fica ligado ao modelo.
--
-- form_template_campos segue o formato de formulario_campos (migration_025
-- e 039): mesmos tipos, opcoes = [{ "value": "…" }] e, em radio/checkbox, a
-- opção "Outro" { "value": "__outro__", "tipo": "outro" }.
-- ════════════════════════════════════════════════════════════════

create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists form_template_campos (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  label text not null default '',
  tipo text not null default 'text'
    check (tipo in ('text', 'textarea', 'number', 'phone', 'email', 'select', 'radio', 'checkbox')),
  obrigatorio boolean not null default false,
  ordem int not null default 0,
  -- lista, como em formulario_campos (o editor e a cópia esperam array)
  opcoes jsonb not null default '[]'::jsonb check (jsonb_typeof(opcoes) = 'array')
);

create index if not exists form_template_campos_template_idx on form_template_campos (template_id, ordem);

-- ───────── RLS ─────────
alter table form_templates enable row level security;
alter table form_template_campos enable row level security;

-- leitura: qualquer usuário logado vê os ativos (escolha ao criar formulário);
-- prolu_admin vê todos (inclusive inativos, no admin)
drop policy if exists "Leitura de modelos ativos" on form_templates;
create policy "Leitura de modelos ativos" on form_templates
  for select to authenticated using (ativo = true or auth_is_prolu_admin());

drop policy if exists "Leitura de campos de modelos" on form_template_campos;
create policy "Leitura de campos de modelos" on form_template_campos
  for select to authenticated using (
    exists (select 1 from form_templates t where t.id = template_id and (t.ativo = true or auth_is_prolu_admin()))
  );

-- escrita: só prolu_admin
drop policy if exists "Escrita de modelos só prolu_admin" on form_templates;
create policy "Escrita de modelos só prolu_admin" on form_templates
  for all to authenticated using (auth_is_prolu_admin()) with check (auth_is_prolu_admin());

drop policy if exists "Escrita de campos só prolu_admin" on form_template_campos;
create policy "Escrita de campos só prolu_admin" on form_template_campos
  for all to authenticated using (auth_is_prolu_admin()) with check (auth_is_prolu_admin());

create or replace function form_templates_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_form_templates_touch on form_templates;
create trigger trg_form_templates_touch before update on form_templates
  for each row execute function form_templates_touch();

notify pgrst, 'reload schema';
