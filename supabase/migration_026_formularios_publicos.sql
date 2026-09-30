-- ════════════════════════════════════════════════════════════════
-- MIGRATION 026 — Formulários públicos (Fase 2): link público + envio → CRM
-- Rodar no SQL Editor do Supabase ANTES do deploy do front/da Edge Function.
--
-- Toda leitura e escrita pública passa pela Edge Function
-- `formulario-publico` (service role, valida antes de gravar). Esta
-- migration NÃO cria nenhuma policy para anon — nem de leitura.
-- ════════════════════════════════════════════════════════════════

-- 1. formularios: endereço público (slug) e Origem padrão no CRM ─────────
alter table formularios add column if not exists slug text;
-- valor da coluna "Origem" do CRM preenchido em todo registro vindo deste
-- formulário (opcional; um campo mapeado para Origem tem prioridade)
alter table formularios add column if not exists origem_crm text;

-- Backfill dos formulários criados na Fase 1: nome "slugificado" + 6
-- caracteres do id (garante unicidade sem precisar consultar os outros).
update formularios
   -- (corta em 50 ANTES de tirar os hífens das pontas, pra não sobrar "--")
   set slug = coalesce(nullif(trim(both '-' from left(regexp_replace(
                lower(translate(nome,
                  'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
                  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
                '[^a-z0-9]+', '-', 'g'), 50)), ''), 'formulario')
              || '-' || left(replace(id::text, '-', ''), 6)
 where slug is null;

alter table formularios alter column slug set not null;
alter table formularios drop constraint if exists formularios_slug_formato;
alter table formularios add constraint formularios_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60);
-- único no sistema todo: a URL /f/:slug não leva o escritório
create unique index if not exists formularios_slug_unico on formularios (slug);

-- 2. formulario_campos: para qual coluna do CRM o campo vai (null = campo extra)
alter table formulario_campos
  add column if not exists crm_coluna_id uuid references crm_colunas(id) on delete set null;
-- cada coluna do CRM recebe no máximo um campo por formulário
create unique index if not exists formulario_campos_coluna_unica
  on formulario_campos (formulario_id, crm_coluna_id) where crm_coluna_id is not null;

-- 3. crm_linhas: qual formulário gerou o registro ─────────────────────────
alter table crm_linhas
  add column if not exists formulario_id uuid references formularios(id) on delete set null;

-- 4. Ficha do pedido: respostas dos campos extras (sem coluna no CRM) ─────
-- Snapshot do label/tipo no momento do envio (o formulário pode mudar depois).
-- respostas: [{ "campo_id": "...", "label": "...", "tipo": "text", "valor": "..." }]
create table if not exists crm_fichas (
  id uuid primary key default uuid_generate_v4(),
  linha_id uuid not null references crm_linhas(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  formulario_id uuid references formularios(id) on delete set null,
  formulario_nome text,
  respostas jsonb not null default '[]'::jsonb check (jsonb_typeof(respostas) = 'array'),
  created_at timestamptz default now()
);
create index if not exists crm_fichas_linha_idx on crm_fichas (linha_id);

alter table crm_fichas enable row level security;
-- leitura: quem é do escritório (mesmo critério de crm_linhas) + prolu_admin.
-- Sem policy de escrita: só a Edge Function (service role) grava; excluir o
-- registro do CRM apaga a ficha junto (on delete cascade).
drop policy if exists "crm_fichas: le do proprio escritorio ou prolu_admin" on crm_fichas;
create policy "crm_fichas: le do proprio escritorio ou prolu_admin" on crm_fichas
  for select using (empresa_id = auth_empresa_id() or auth_is_prolu_admin());
