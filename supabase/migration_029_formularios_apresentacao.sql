-- ════════════════════════════════════════════════════════════════
-- MIGRATION 029 — Formulários públicos: apresentação (logo, capa, texto de
-- introdução, vídeo do YouTube) e botão opcional na mensagem de agradecimento.
-- Rodar no SQL Editor do Supabase. Não remove nem altera colunas existentes.
--
-- A Edge Function `formulario-publico` lê formularios com select('*'): pode
-- ser publicada antes ou depois desta migration.
-- ════════════════════════════════════════════════════════════════

-- 1. Colunas ──────────────────────────────────────────────────────────────
alter table formularios
  add column if not exists logo_url text,
  add column if not exists capa_url text,
  add column if not exists intro_texto text,
  add column if not exists intro_video_youtube text,
  add column if not exists intro_video_posicao text default 'depois' check (intro_video_posicao in ('antes', 'depois')),
  add column if not exists obrigado_botao_texto text,
  add column if not exists obrigado_botao_url text;

-- Formatos/tamanhos (as URLs vão para src de <img> e href de <a> na página
-- pública): só http(s). O vídeo guarda a URL do YouTube como digitada; o ID
-- é extraído no front e na função.
alter table formularios drop constraint if exists formularios_apresentacao_valida;
alter table formularios add constraint formularios_apresentacao_valida check (
  (logo_url is null or (logo_url ~* '^https://[^[:space:]]+$' and char_length(logo_url) <= 1000))
  and (capa_url is null or (capa_url ~* '^https://[^[:space:]]+$' and char_length(capa_url) <= 1000))
  and char_length(coalesce(intro_texto, '')) <= 5000
  and (intro_video_youtube is null or char_length(intro_video_youtube) <= 300)
  and char_length(coalesce(obrigado_botao_texto, '')) <= 60
  and (obrigado_botao_url is null or (obrigado_botao_url ~* '^https?://[^[:space:]]+$' and char_length(obrigado_botao_url) <= 2000))
);

-- 2. Bucket das imagens (logo e capa) ─────────────────────────────────────
-- Público para leitura: a página pública e os embeds mostram as imagens pela
-- URL pública (bucket público não precisa de policy de SELECT para isso).
-- Limite de 10 MB e só imagens — o editor também limita (logo 5 MB, capa 10 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('formularios-assets', 'formularios-assets', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Escrita: caminho <empresa_id>/<formulario_id>/arquivo — só master /
-- prolu_admin do próprio escritório, e só em pasta de formulário dele
-- (mesmo critério de escrita de formularios, migration_025).
drop policy if exists "formularios-assets: master escreve do proprio escritorio" on storage.objects;
create policy "formularios-assets: master escreve do proprio escritorio" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'formularios-assets'
    and (storage.foldername(name))[1] = auth_empresa_id()::text
    and auth_is_empresa_master()
    and exists (
      select 1 from formularios f
       where f.id::text = (storage.foldername(name))[2]
         and f.empresa_id = auth_empresa_id()
    )
  )
  with check (
    bucket_id = 'formularios-assets'
    and (storage.foldername(name))[1] = auth_empresa_id()::text
    and auth_is_empresa_master()
    and exists (
      select 1 from formularios f
       where f.id::text = (storage.foldername(name))[2]
         and f.empresa_id = auth_empresa_id()
    )
  );
