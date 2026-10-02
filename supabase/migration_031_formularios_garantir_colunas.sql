-- ════════════════════════════════════════════════════════════════
-- MIGRATION 031 — Formulários: garante as colunas que o editor grava
-- Rodar no SQL Editor do Supabase. Idempotente: não muda nada que já exista.
--
-- Motivo: PATCH em formularios voltando 400 ao salvar a aba Estilo. A aba
-- Estilo grava UMA coluna só — `estilo` (jsonb, migration_028); todas as
-- opções vão dentro dela. Os nomes de coluna usados pelo front batem com os
-- das migrations 025/026/028/029/030, então as causas possíveis de 400 são:
--   (a) coluna ausente no banco (migration não aplicada ou aplicada pela metade);
--   (b) cache de esquema da API (PostgREST) desatualizado, sem enxergar a coluna;
--   (c) um CHECK recusando o valor.
-- Esta migration cobre (a) e (b). O SELECT no fim mostra o resultado; se o
-- 400 continuar depois dela, a causa é (c) — a resposta do PATCH (aba Rede
-- do navegador → Response) traz o nome da constraint.
-- ════════════════════════════════════════════════════════════════

-- 1. Colunas (mesmas definições das migrations originais) ────────────────
alter table formularios add column if not exists slug text;                 -- 026 (já preenchida/única lá)
alter table formularios add column if not exists origem_crm text;           -- 026
alter table formularios add column if not exists estilo jsonb not null default '{}'::jsonb;   -- 028
alter table formularios add column if not exists pos_envio text not null default 'mensagem';  -- 028
alter table formularios add column if not exists sucesso_titulo text;       -- 028
alter table formularios add column if not exists sucesso_texto text;        -- 028
alter table formularios add column if not exists redirect_url text;         -- 028
alter table formularios add column if not exists logo_url text;             -- 029
alter table formularios add column if not exists capa_url text;             -- 029
alter table formularios add column if not exists intro_texto text;          -- 029
alter table formularios add column if not exists intro_video_youtube text;  -- 029
alter table formularios add column if not exists intro_video_posicao text default 'depois';   -- 029
alter table formularios add column if not exists obrigado_botao_texto text; -- 029
alter table formularios add column if not exists obrigado_botao_url text;   -- 029
alter table formularios add column if not exists titulo_pagina text;        -- 030

-- 2. Checks das mesmas migrations (recriados; as linhas atuais já os cumprem)
alter table formularios drop constraint if exists formularios_estilo_objeto;
alter table formularios add constraint formularios_estilo_objeto
  check (jsonb_typeof(estilo) = 'object' and pg_column_size(estilo) <= 4000);

alter table formularios drop constraint if exists formularios_pos_envio_valido;
alter table formularios add constraint formularios_pos_envio_valido
  check (pos_envio in ('mensagem', 'redirecionar'));

alter table formularios drop constraint if exists formularios_sucesso_tamanho;
alter table formularios add constraint formularios_sucesso_tamanho
  check (char_length(coalesce(sucesso_titulo, '')) <= 120 and char_length(coalesce(sucesso_texto, '')) <= 1000);

alter table formularios drop constraint if exists formularios_redirect_url_valida;
alter table formularios add constraint formularios_redirect_url_valida
  check (
    (redirect_url is null or (redirect_url ~* '^https?://[^[:space:]]+$' and char_length(redirect_url) <= 2000))
    and (pos_envio <> 'redirecionar' or redirect_url is not null)
  );

alter table formularios drop constraint if exists formularios_intro_video_posicao_check;
alter table formularios drop constraint if exists formularios_video_posicao_valida;
alter table formularios add constraint formularios_video_posicao_valida
  check (intro_video_posicao is null or intro_video_posicao in ('antes', 'depois'));

alter table formularios drop constraint if exists formularios_apresentacao_valida;
alter table formularios add constraint formularios_apresentacao_valida check (
  (logo_url is null or (logo_url ~* '^https://[^[:space:]]+$' and char_length(logo_url) <= 1000))
  and (capa_url is null or (capa_url ~* '^https://[^[:space:]]+$' and char_length(capa_url) <= 1000))
  and char_length(coalesce(intro_texto, '')) <= 5000
  and (intro_video_youtube is null or char_length(intro_video_youtube) <= 300)
  and char_length(coalesce(obrigado_botao_texto, '')) <= 60
  and (obrigado_botao_url is null or (obrigado_botao_url ~* '^https?://[^[:space:]]+$' and char_length(obrigado_botao_url) <= 2000))
);

alter table formularios drop constraint if exists formularios_titulo_pagina_tamanho;
alter table formularios add constraint formularios_titulo_pagina_tamanho
  check (char_length(coalesce(titulo_pagina, '')) <= 120);

-- 3. API (PostgREST) relê o esquema — resolve coluna "invisível" para o PATCH
notify pgrst, 'reload schema';

-- 4. Conferência: as 15 colunas devem aparecer com "sim"
select c.nome as coluna,
       case when ic.column_name is null then 'NÃO EXISTE' else 'sim' end as existe,
       ic.data_type
  from unnest(array[
         'slug', 'origem_crm', 'estilo', 'pos_envio', 'sucesso_titulo', 'sucesso_texto', 'redirect_url',
         'logo_url', 'capa_url', 'intro_texto', 'intro_video_youtube', 'intro_video_posicao',
         'obrigado_botao_texto', 'obrigado_botao_url', 'titulo_pagina'
       ]) as c(nome)
  left join information_schema.columns ic
         on ic.table_schema = 'public' and ic.table_name = 'formularios' and ic.column_name = c.nome
 order by c.nome;
