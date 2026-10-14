-- ════════════════════════════════════════════════════════════════
-- Backup da Minha Página ANTES do editor novo (v2). SOMENTE LEITURA.
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Nenhum bloco grava nada.
--
-- Bloco 2 devolve UMA célula com o JSON completo: copiar o conteúdo e
-- salvar em scripts/_backup_minha_pagina/backup_AAAA-MM-DD.json
-- (pasta ignorada pelo git — conferir a linha no .gitignore antes).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Resumo: quem tem página configurada ──
select e.slug, e.nome, e.status_conta,
       e.pagina_config->>'publicada'                        as publicada,
       (select count(*) from pagina_links l where l.empresa_id = e.id) as links,
       (select count(*) from pagina_links l where l.empresa_id = e.id and l.estilo <> '{}'::jsonb) as links_com_estilo,
       pg_column_size(e.pagina_config)                      as bytes_config
  from empresas e
 where e.pagina_config <> '{}'::jsonb
    or exists (select 1 from pagina_links l where l.empresa_id = e.id)
 order by e.slug;


-- ── 2. Backup completo (pagina_config + pagina_links de todas as páginas) ──
select jsonb_pretty(jsonb_build_object(
         'gerado_em', now(),
         'paginas', coalesce(jsonb_agg(jsonb_build_object(
             'empresa_id',    e.id,
             'escritorio',    e.nome,
             'slug',          e.slug,
             'status_conta',  e.status_conta,
             'pagina_config', e.pagina_config,
             'links', coalesce((
                 select jsonb_agg(to_jsonb(l) order by l.ordem, l.created_at)
                   from pagina_links l
                  where l.empresa_id = e.id
               ), '[]'::jsonb)
           ) order by e.slug), '[]'::jsonb)
       )) as backup
  from empresas e
 where e.pagina_config <> '{}'::jsonb
    or exists (select 1 from pagina_links l where l.empresa_id = e.id);


-- ── 3. Estado atual da função pública (para comparar com a versão nova) ──
select pg_get_functiondef('public.pagina_publica(text)'::regprocedure);


-- ── 4. Estrutura real (confere o que a migration v2 pressupõe) ──
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pagina_links'
 order by ordinal_position;
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid in ('public.pagina_links'::regclass, 'public.empresas'::regclass)
 order by 1, 2;
select to_regclass('public.paginas') as tabela_paginas_ja_existe;  -- esperado: null


-- ── 5. Bucket e políticas de Storage ──
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'pagina-assets';
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'pagina-assets%';
