-- ════════════════════════════════════════════════════════════════
-- MIGRATION 042 — Minha Página: imagem por link
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
--
-- pagina_links.imagem_url  — imagem no bucket pagina-assets (só https)
-- pagina_links.imagem_modo — 'icone' (pequena, à esquerda do botão) ou
--                            'banner' (largura total no topo; o link vira card)
-- pagina_publica() passa a devolver os dois campos.
-- ════════════════════════════════════════════════════════════════

alter table pagina_links add column if not exists imagem_url text;
alter table pagina_links add column if not exists imagem_modo text;

alter table pagina_links drop constraint if exists pagina_links_imagem_valida;
alter table pagina_links add constraint pagina_links_imagem_valida check (
  (imagem_modo is null or imagem_modo in ('icone', 'banner'))
  and (imagem_url is null or (imagem_url ~* '^https://[^[:space:]]+$' and char_length(imagem_url) <= 2000))
);

-- mesma função da migration_041, com imagem_url e imagem_modo nos links
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
               'estilo', l.estilo,
               'imagem_url', l.imagem_url,
               'imagem_modo', case when l.imagem_url is not null then coalesce(l.imagem_modo, 'icone') end
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

notify pgrst, 'reload schema';
