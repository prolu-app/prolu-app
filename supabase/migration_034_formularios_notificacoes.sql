-- ════════════════════════════════════════════════════════════════
-- MIGRATION 034 — Formulários (Fase 4): notificações de novo preenchimento
-- Rodar no SQL Editor do Supabase.
--
-- Aba "Notificações" do editor. A Edge Function `formulario-publico` chama a
-- `formulario-notificacao` depois de gravar um envio; ela lê estas colunas e
-- manda o e-mail (Resend). WhatsApp: só a interface por enquanto ("Em breve").
-- ════════════════════════════════════════════════════════════════

alter table formularios
  add column if not exists notif_ativa boolean not null default false,
  add column if not exists notif_email_ativa boolean not null default false,
  add column if not exists notif_email_destinatarios text[],
  add column if not exists notif_whatsapp_ativa boolean not null default false,
  add column if not exists notif_whatsapp_numero text;

-- no máximo 10 destinatários (a função manda um e-mail para todos); número
-- de WhatsApp curto (ainda sem uso)
alter table formularios drop constraint if exists formularios_notif_valida;
alter table formularios add constraint formularios_notif_valida check (
  coalesce(array_length(notif_email_destinatarios, 1), 0) <= 10
  and char_length(coalesce(notif_whatsapp_numero, '')) <= 30
);

-- a API (PostgREST) passa a enxergar as colunas novas na hora (ver migration_031)
notify pgrst, 'reload schema';
