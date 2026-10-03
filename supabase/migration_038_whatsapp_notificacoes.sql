-- ════════════════════════════════════════════════════════════════
-- MIGRATION 038 — Notificações por WhatsApp (número único da Prolu, template
-- aprovado "novo_lead_formulario")
-- Rodar no SQL Editor do Supabase ANTES de publicar a Edge Function
-- formulario-whatsapp e o front (eles leem estas colunas/tabela).
--
-- (a 037 já é a do endereço do escritório só para master — por isso 038)
-- ════════════════════════════════════════════════════════════════

-- 1. formulário: quais campos vão na mensagem (ids de formulario_campos, na
--    ordem da mensagem; até 5). notif_whatsapp_ativa já existe (migration_034).
alter table formularios add column if not exists notif_whatsapp_campos text[] not null default '{}';
alter table formularios drop constraint if exists formularios_whatsapp_campos_max;
alter table formularios add constraint formularios_whatsapp_campos_max
  check (cardinality(notif_whatsapp_campos) <= 5);

-- 2. escritório: número que recebe as notificações (E.164, ex. +5543999998888)
--    e o consentimento (opt-in) — sem opt-in a função não envia.
alter table empresas
  add column if not exists whatsapp_numero text,
  add column if not exists whatsapp_optin boolean not null default false,
  add column if not exists whatsapp_optin_em timestamptz;
alter table empresas drop constraint if exists empresas_whatsapp_numero_formato;
alter table empresas add constraint empresas_whatsapp_numero_formato
  check (whatsapp_numero is null or whatsapp_numero ~ '^\+[0-9]{10,15}$');

-- 3. log de envios (escrito só pela Edge Function, com service role)
create table if not exists whatsapp_notif_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  formulario_id uuid not null references formularios(id) on delete cascade,
  crm_linha_id uuid references crm_linhas(id) on delete set null,
  status text not null check (status in ('enviado', 'erro', 'ignorado')),
  whatsapp_message_id text,   -- id devolvido pela Meta quando enviado
  erro text,                  -- motivo (erro da Meta ou por que foi ignorado)
  criado_em timestamptz not null default now()
);
create index if not exists whatsapp_notif_log_empresa_idx on whatsapp_notif_log (empresa_id, criado_em desc);

alter table whatsapp_notif_log enable row level security;
-- só leitura pelo app: master/gestor do próprio escritório; prolu_admin tudo.
-- Sem policy de escrita: só a Edge Function (service role) grava.
drop policy if exists "admin vê tudo" on whatsapp_notif_log;
drop policy if exists "empresa vê os próprios" on whatsapp_notif_log;
drop policy if exists "whatsapp_notif_log: prolu_admin lê tudo" on whatsapp_notif_log;
drop policy if exists "whatsapp_notif_log: master e gestor leem do escritório" on whatsapp_notif_log;
create policy "whatsapp_notif_log: prolu_admin lê tudo" on whatsapp_notif_log
  for select using (auth_is_prolu_admin());
create policy "whatsapp_notif_log: master e gestor leem do escritório" on whatsapp_notif_log
  for select using (empresa_id = auth_empresa_id() and coalesce(auth_is_gestor_ou_superior(), false));

-- 4. Configurações (master e gestor): a policy de update de empresas é só do
--    master e vale para todas as colunas — esta função mexe SÓ no número e no
--    opt-in. whatsapp_optin_em guarda quando o consentimento foi dado
--    (mantido ao desmarcar, para histórico).
create or replace function empresa_atualizar_whatsapp(p_numero text, p_optin boolean)
returns table (whatsapp_numero text, whatsapp_optin boolean, whatsapp_optin_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text := nullif(trim(coalesce(p_numero, '')), '');
begin
  if auth_empresa_id() is null or not coalesce(auth_is_gestor_ou_superior(), false) then
    raise exception 'Sem permissão para alterar as notificações do escritório' using errcode = '42501';
  end if;
  if v_numero is not null and v_numero !~ '^\+[0-9]{10,15}$' then
    raise exception 'Número inválido: use o formato +5543999998888' using errcode = '22023';
  end if;
  if coalesce(p_optin, false) and v_numero is null then
    raise exception 'Informe o número antes de aceitar receber notificações' using errcode = '22023';
  end if;
  return query
  update empresas e
     set whatsapp_numero = v_numero,
         whatsapp_optin = coalesce(p_optin, false),
         whatsapp_optin_em = case when coalesce(p_optin, false) and not e.whatsapp_optin then now() else e.whatsapp_optin_em end
   where e.id = auth_empresa_id()
  returning e.whatsapp_numero, e.whatsapp_optin, e.whatsapp_optin_em;
end $$;
revoke all on function empresa_atualizar_whatsapp(text, boolean) from public;
grant execute on function empresa_atualizar_whatsapp(text, boolean) to authenticated;

notify pgrst, 'reload schema';
