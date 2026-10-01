-- ════════════════════════════════════════════════════════════════
-- MIGRATION 027 — Formulários públicos (Fase 3): CSS personalizado
-- Rodar no SQL Editor do Supabase ANTES do deploy da Edge Function
-- `formulario-publico` (ela passa a ler esta coluna) e do front.
--
-- CSS escrito pelo escritório no editor do formulário, aplicado na página
-- pública /f/:slug e no modo de incorporação "com estilo do Prolu" (iframe).
-- O modo "cru" (direto no site) não usa: quem estiliza é o CSS do site.
-- Escrita segue as policies de formularios (migration_025); leitura pública
-- só pela Edge Function (sem policy anon).
-- ════════════════════════════════════════════════════════════════

alter table formularios add column if not exists css_personalizado text;

alter table formularios drop constraint if exists formularios_css_tamanho;
alter table formularios add constraint formularios_css_tamanho
  check (css_personalizado is null or char_length(css_personalizado) <= 20000);
