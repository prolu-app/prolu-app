-- ════════════════════════════════════════════════════════════════
-- MIGRATION 041 — Minha Página: página pública do escritório estilo
-- "link na bio", em app.prolu.com.br/<slug do escritório>
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
--
-- • empresas.pagina_config (jsonb): perfil, botões, fundo, texto. O front
--   normaliza tudo (src/utils/paginaConfig.js) — nada do JSON vira CSS cru.
-- • pagina_links: botões da página, um por linha (salvos um a um).
-- • pagina_publica(slug): única porta de leitura pública. Devolve a página só
--   se estiver publicada, com os links ativos e o endereço dos formulários
--   ativos do próprio escritório. empresas, pagina_links e formularios
--   continuam fechados por RLS para visitantes.
-- • Endereços reservados: o slug do escritório agora vira URL na raiz do
--   app, então não pode colidir com as telas (/crm, /admin, /login…).
-- • Bucket pagina-assets: foto de perfil e banner.
-- ════════════════════════════════════════════════════════════════

-- 1. configuração da página ───────────────────────────────────────────────
alter table empresas add column if not exists pagina_config jsonb not null default '{}'::jsonb;
alter table empresas drop constraint if exists empresas_pagina_config_valida;
alter table empresas add constraint empresas_pagina_config_valida
  check (jsonb_typeof(pagina_config) = 'object' and pg_column_size(pagina_config) <= 20000);

-- 2. links ────────────────────────────────────────────────────────────────
create table if not exists pagina_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  ordem integer not null default 0,
  ativo boolean not null default true,
  tipo text not null default 'link',            -- 'link' | 'formulario'
  titulo text not null default '',
  url text,                                     -- tipo 'link'
  formulario_id uuid references formularios(id) on delete set null, -- tipo 'formulario'
  estilo jsonb not null default '{}'::jsonb,    -- override de estilo por link (reservado)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pagina_links drop constraint if exists pagina_links_valida;
alter table pagina_links add constraint pagina_links_valida check (
  tipo in ('link', 'formulario')
  and char_length(titulo) <= 100
  -- só http(s), e-mail e telefone: nada de javascript: na página pública
  and (url is null or (url ~* '^(https?://[^[:space:]]+|mailto:[^[:space:]]+|tel:[+0-9() -]+)$' and char_length(url) <= 2000))
  and jsonb_typeof(estilo) = 'object'
);

create index if not exists pagina_links_empresa_ordem_idx on pagina_links (empresa_id, ordem);

create or replace function pagina_links_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pagina_links_touch on pagina_links;
create trigger pagina_links_touch before update on pagina_links
  for each row execute function pagina_links_touch();

-- 3. RLS (mesmo critério dos formulários, migration_025) ──────────────────
-- lê: master/prolu_admin do próprio escritório, ou prolu_admin em qualquer um
-- escreve: master/prolu_admin só no próprio escritório, e o formulário
-- apontado precisa ser do mesmo escritório
alter table pagina_links enable row level security;

drop policy if exists "pagina_links: le proprio escritorio ou prolu_admin" on pagina_links;
create policy "pagina_links: le proprio escritorio ou prolu_admin" on pagina_links
  for select using (
    (empresa_id = auth_empresa_id() and auth_is_empresa_master())
    or auth_is_prolu_admin()
  );

drop policy if exists "pagina_links: master escreve no proprio escritorio" on pagina_links;
create policy "pagina_links: master escreve no proprio escritorio" on pagina_links
  for all using (empresa_id = auth_empresa_id() and auth_is_empresa_master())
  with check (
    empresa_id = auth_empresa_id() and auth_is_empresa_master()
    and (formulario_id is null or exists (
      select 1 from formularios f where f.id = formulario_id and f.empresa_id = auth_empresa_id()
    ))
  );

-- 4. leitura pública ──────────────────────────────────────────────────────
-- null quando o endereço não existe ou a página não está publicada.
-- Links: ativos, com título; 'link' só com URL; 'formulario' só se o
-- formulário existir, for do escritório e estiver ativo (vira slug_formulario).
create or replace function pagina_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'escritorio', e.nome,
    'slug', e.slug,
    'config', e.pagina_config,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'tipo', l.tipo,
               'titulo', l.titulo,
               'url', case when l.tipo = 'link' then l.url end,
               'slug_formulario', f.slug,
               'estilo', l.estilo
             ) order by l.ordem, l.created_at)
        from pagina_links l
        left join formularios f
          on l.tipo = 'formulario' and f.id = l.formulario_id and f.empresa_id = l.empresa_id and f.ativo
       where l.empresa_id = e.id
         and l.ativo
         and l.titulo <> ''
         and ((l.tipo = 'link' and l.url is not null) or (l.tipo = 'formulario' and f.id is not null))
    ), '[]'::jsonb)
  )
  from empresas e
  where e.slug = lower(trim(coalesce(p_slug, '')))
    and e.pagina_config->>'publicada' = 'true'
$$;
revoke all on function pagina_publica(text) from public;
grant execute on function pagina_publica(text) to anon, authenticated;

-- 5. endereços reservados ─────────────────────────────────────────────────
-- Mesma lista de src/utils/slug.js (SLUGS_RESERVADOS): telas do app, pastas
-- públicas e nomes que não devem virar escritório.
create or replace function slug_reservado(p_slug text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_slug, '')) = any (array[
    'admin', 'aceitar-convite', 'agente-prolu', 'api', 'app', 'assets', 'avisos',
    'base-conhecimento', 'cadastro', 'cliente-ideal', 'clientes', 'configuracoes',
    'contato', 'crm', 'dashboard', 'embed', 'entrar', 'equipe', 'formularios',
    'indicadores', 'login', 'logout', 'minha-pagina', 'onboarding', 'plano-pratico',
    'precificacao', 'privacidade', 'prolu', 'shadows', 'static', 'suporte',
    'termos', 'textures', 'www'
  ])
$$;

-- troca pelo master (migration_037) passa a recusar endereço reservado
create or replace function empresa_atualizar_slug(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  -- auth_is_empresa_master() = role in ('prolu_admin', 'master') (migration_001)
  if auth_empresa_id() is null or not coalesce(auth_is_empresa_master(), false) then
    raise exception 'Somente o Master pode alterar o endereço do escritório' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 60 then
    raise exception 'Endereço inválido: use letras minúsculas, números e hífens (3 a 60)' using errcode = '22023';
  end if;
  if slug_reservado(v_slug) then
    raise exception 'Esse endereço é reservado pelo Prolu — escolha outro' using errcode = '22023';
  end if;
  update empresas set slug = v_slug where id = auth_empresa_id();  -- 23505 se já estiver em uso
  return v_slug;
end $$;
revoke all on function empresa_atualizar_slug(text) from public;
grant execute on function empresa_atualizar_slug(text) to authenticated;

-- escritório novo cujo nome gera um endereço reservado ganha "-escritorio"
create or replace function empresas_preenche_slug()
returns trigger language plpgsql as $$
declare
  v_base text;
  n int := 1;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  v_base := empresa_slug_base(new.nome);
  if slug_reservado(v_base) then v_base := v_base || '-escritorio'; end if;
  new.slug := v_base;
  while exists (select 1 from empresas where slug = new.slug) loop
    n := n + 1;
    new.slug := v_base || '-' || n;
  end loop;
  return new;
end $$;

-- Escritórios que JÁ usam um endereço reservado não são alterados aqui (isso
-- derrubaria os links dos formulários deles); a Minha Página deles só abre
-- depois de trocar o endereço. Para conferir:
--   select id, nome, slug from empresas where slug_reservado(slug);

-- 6. imagens (foto de perfil e banner) ────────────────────────────────────
-- Público para leitura; escrita em <empresa_id>/arquivo só pelo master /
-- prolu_admin do próprio escritório.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pagina-assets', 'pagina-assets', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pagina-assets: master escreve do proprio escritorio" on storage.objects;
create policy "pagina-assets: master escreve do proprio escritorio" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'pagina-assets'
    and (storage.foldername(name))[1] = auth_empresa_id()::text
    and auth_is_empresa_master()
  )
  with check (
    bucket_id = 'pagina-assets'
    and (storage.foldername(name))[1] = auth_empresa_id()::text
    and auth_is_empresa_master()
  );

notify pgrst, 'reload schema';
