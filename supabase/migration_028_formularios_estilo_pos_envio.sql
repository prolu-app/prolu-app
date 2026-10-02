-- ════════════════════════════════════════════════════════════════
-- MIGRATION 028 — Formulários públicos (Fase 3, ajuste): estilo visual e
-- o que acontece depois do envio. Substitui o CSS personalizado (027).
--
-- ORDEM: publicar a Edge Function `formulario-publico` nova ANTES desta
-- migration. A função antiga lê css_personalizado, que é removida aqui; a
-- nova lê as colunas com select('*') e funciona com ou sem elas.
--
-- Escrita segue as policies de formularios (migration_025); leitura
-- pública só pela Edge Function (sem policy anon).
-- ════════════════════════════════════════════════════════════════

-- 1. Estilo visual (painel "Estilo" do editor) — página /f/:slug e embed
--    "Com estilo do Prolu". Chaves em src/utils/formularioEstilo.js; o
--    front ignora valores desconhecidos e cai no padrão ({} = aparência original).
alter table formularios add column if not exists estilo jsonb not null default '{}'::jsonb;
alter table formularios drop constraint if exists formularios_estilo_objeto;
alter table formularios add constraint formularios_estilo_objeto
  check (jsonb_typeof(estilo) = 'object' and pg_column_size(estilo) <= 4000);

-- 2. Depois do envio: mensagem (textos opcionais; vazio = texto padrão do
--    app) ou redirecionar para uma URL do escritório (página de obrigado
--    com Google Tag / Pixel — o Prolu só redireciona, não dispara tracking)
alter table formularios add column if not exists pos_envio text not null default 'mensagem';
alter table formularios add column if not exists sucesso_titulo text;
alter table formularios add column if not exists sucesso_texto text;
alter table formularios add column if not exists redirect_url text;

alter table formularios drop constraint if exists formularios_pos_envio_valido;
alter table formularios add constraint formularios_pos_envio_valido
  check (pos_envio in ('mensagem', 'redirecionar'));
alter table formularios drop constraint if exists formularios_sucesso_tamanho;
alter table formularios add constraint formularios_sucesso_tamanho
  check (char_length(coalesce(sucesso_titulo, '')) <= 120 and char_length(coalesce(sucesso_texto, '')) <= 1000);
-- só http(s) — nada de javascript: e afins; redirecionar exige URL
alter table formularios drop constraint if exists formularios_redirect_url_valida;
alter table formularios add constraint formularios_redirect_url_valida
  check (
    (redirect_url is null or (redirect_url ~* '^https?://[^[:space:]]+$' and char_length(redirect_url) <= 2000))
    and (pos_envio <> 'redirecionar' or redirect_url is not null)
  );

-- 3. Sai o CSS personalizado (migration_027) — trocado pelo painel visual
alter table formularios drop constraint if exists formularios_css_tamanho;
alter table formularios drop column if exists css_personalizado;
