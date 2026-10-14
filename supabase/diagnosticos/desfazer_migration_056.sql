-- ════════════════════════════════════════════════════════════════
-- DESFAZER a migration_056 (Minha Página v2).
-- ANTES: (1) reverter o front para a versão sem o editor novo;
--        (2) se já houver conteúdo v2, exportar com o bloco 1 abaixo e
--            guardar em scripts/_backup_minha_pagina/ (pasta ignorada).
-- Nada de pagina_config / pagina_links / bucket é tocado: a 056 não os alterou.
-- Rodar o bloco 1 sozinho; depois o bloco 2 inteiro.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Exportar o que existe em paginas (SOMENTE LEITURA) ──
select jsonb_pretty(coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('slug', e.slug) order by e.slug), '[]'::jsonb)) as paginas_v2
  from paginas p join empresas e on e.id = p.empresa_id;


-- ── 2. Desfazer ──
begin;

-- pagina_publica volta a ser a da migration_054 ANTES de remover a tabela
-- (o corpo novo lê "paginas")
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
    'selo', not empresa_libera(e.id, 'selo_removivel')
            or coalesce(e.pagina_config->>'rodape_prolu', 'true') <> 'false',
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
    and e.status_conta = 'ativa'
$$;
revoke all on function pagina_publica(text) from public;
grant execute on function pagina_publica(text) to anon, authenticated;

drop function if exists pagina_definir_no_ar(boolean);
drop function if exists pagina_descartar_rascunho();
drop function if exists pagina_publicar(integer);
drop function if exists pagina_salvar_rascunho(jsonb, integer);
drop function if exists _pagina_estado(uuid);
drop function if exists _pagina_minha_empresa();

drop table if exists paginas;                -- leva trigger, constraint e policy
drop function if exists paginas_antes_gravar();

drop function if exists pagina_v2_validar(jsonb);
drop function if exists _pv2_botao_ok(jsonb);
drop function if exists _pv2_num(jsonb, text, numeric, numeric);
drop function if exists _pv2_bool(jsonb, text);
drop function if exists _pv2_img(jsonb, text);
drop function if exists _pv2_cor(jsonb, text, boolean);
drop function if exists _pv2_opc(jsonb, text, text[], boolean);
drop function if exists _pv2_txt(jsonb, text, int);
drop function if exists _pv2_so(jsonb, text[]);
drop function if exists _pv2_exige(boolean, text);

notify pgrst, 'reload schema';

commit;
