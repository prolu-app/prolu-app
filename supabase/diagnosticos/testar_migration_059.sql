-- ════════════════════════════════════════════════════════════════
-- Testes da migration_059 (layouts Editorial, Quadrados e Cartões).
-- Rodar DEPOIS dela. UM BLOCO DE CADA VEZ. Bloco 1 só lê. Blocos 2 e 3
-- SEMPRE terminam com um erro "RESULTADO …" de propósito: o relatório vem na
-- mensagem e o erro desfaz tudo (nada fica gravado). O bloco 3 simula o master
-- do escritório de TESTE (andresouzavr@gmail.com) e não toca em outro escritório.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Funções trocadas (esperado: todas as linhas com ok = true) ──
select 'validador conhece layout_opcoes' as item,
       pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) ~ 'layout_opcoes' as ok
union all select 'validador mantém as regras da 057/058',
       pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) ~ 'FONTES_LEGADAS'
       and pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) !~ 'mais de um destaque'
union all select 'publicar: capa só no Clássico',
       pg_get_functiondef('public.pagina_publicar(integer)'::regprocedure) ~ 'classico'
union all select 'pública: banner só no Clássico',
       pg_get_functiondef('public.pagina_publica(text)'::regprocedure) ~ 'classico'
union all select 'anon chama pagina_publica', has_function_privilege('anon', 'pagina_publica(text)', 'EXECUTE')
union all select 'anon NÃO chama publicar', not has_function_privilege('anon', 'pagina_publicar(integer)', 'EXECUTE')
union all select 'authenticated chama publicar', has_function_privilege('authenticated', 'pagina_publicar(integer)', 'EXECUTE');


-- ── 2. Validador ──
--      Esperado: erro "RESULTADO DO VALIDADOR 059 — falhas: 0 de 12".
do $validador$
declare
  r record; v_res text; v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  for r in select * from (values
  ('sem layout_opcoes',                  'aceito',  '{"v":2,"layout":"editorial"}'),
  ('editorial linhas',                   'aceito',  '{"v":2,"layout":"editorial","layout_opcoes":{"editorial_links":"linhas"}}'),
  ('editorial botões',                   'aceito',  '{"v":2,"layout":"editorial","layout_opcoes":{"editorial_links":"botoes"}}'),
  ('cartões sem seta',                   'aceito',  '{"v":2,"layout":"cartoes","layout_opcoes":{"cartoes_seta":false}}'),
  ('as duas opções',                     'aceito',  '{"v":2,"layout":"quadrados","layout_opcoes":{"editorial_links":"botoes","cartoes_seta":true}}'),
  ('estilo dos links inválido',          'recusa',  '{"v":2,"layout_opcoes":{"editorial_links":"cards"}}'),
  ('seta não booleana',                  'recusa',  '{"v":2,"layout_opcoes":{"cartoes_seta":"sim"}}'),
  ('opção desconhecida',                 'recusa',  '{"v":2,"layout_opcoes":{"quadrados_colunas":3}}'),
  ('layout_opcoes não é objeto',         'recusa',  '{"v":2,"layout_opcoes":"linhas"}'),
  ('layout desconhecido',                'recusa',  '{"v":2,"layout":"tipografico"}'),
  ('regras de antes (fonte fora)',       'recusa',  '{"v":2,"aparencia":{"fonte":"Comic Sans"}}'),
  ('destaque antigo segue aceito',       'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":true}}]}')
  ) as casos(caso, esperado, doc) loop
    begin
      perform pagina_v2_validar(r.doc::jsonb);
      v_res := 'aceito';
    exception when others then
      v_res := sqlerrm;
    end;
    v_total := v_total + 1;
    if (v_res = 'aceito') = (r.esperado = 'aceito') then
      v_texto := v_texto || 'OK     ' || r.caso || ' (' || v_res || E')\n';
    else
      v_falhas := v_falhas + 1;
      v_texto := v_texto || 'FALHOU ' || r.caso || ' — esperado ' || r.esperado || ', veio: ' || v_res || E'\n';
    end if;
  end loop;
  raise exception E'RESULTADO DO VALIDADOR 059 — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $validador$;


-- ── 3. Publicar e ler no escritório de TESTE (simulado e desfeito) ──
--      Esperado: erro "RESULTADO DO TESTE 059 (tudo desfeito) — falhas: 0".
do $teste$
declare
  v_auth uuid; v_emp uuid; v_slug text; v_rev int; v_est jsonb; v_pub jsonb; v_err text;
  v_res jsonb := '[]'; v_texto text; v_falhas int;
  IMG constant text := 'https://exemplo.com/capa.jpg';
begin
  select u.auth_id, u.empresa_id, e.slug into v_auth, v_emp, v_slug
    from usuarios u join empresas e on e.id = u.empresa_id
   where lower(u.email) = 'andresouzavr@gmail.com';
  if v_auth is null then raise exception 'usuário de teste não encontrado'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_rev := coalesce((select revisao from paginas where empresa_id = v_emp), 0);

  -- Editorial com capa "Capa" sem imagem: publica (a capa não é desenhada)
  v_est := pagina_salvar_rascunho('{"v":2,"layout":"editorial","layout_opcoes":{"editorial_links":"linhas"},"capa":{"estilo":"capa","imagem":null},"perfil":{"nome":"Teste 059"}}', v_rev);
  v_rev := (v_est->>'revisao')::int;
  begin v_est := pagina_publicar(v_rev); v_err := 'publicou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('Editorial com capa sem imagem publica', v_err = 'publicou', v_err));
  v_pub := pagina_publica(v_slug);
  v_res := v_res || jsonb_build_array(jsonb_build_array('pública devolve o layout e as opções',
    v_pub#>>'{pagina,layout}' = 'editorial' and v_pub#>>'{pagina,layout_opcoes,editorial_links}' = 'linhas', (v_pub->'pagina'->'layout_opcoes')::text));

  -- Editorial com imagem de capa guardada: OG sem banner
  v_est := pagina_salvar_rascunho(jsonb_build_object('v', 2, 'layout', 'editorial', 'capa', jsonb_build_object('estilo', 'capa', 'imagem', IMG), 'perfil', '{"nome":"Teste 059"}'::jsonb), v_rev);
  v_rev := (v_est->>'revisao')::int;
  v_est := pagina_publicar(v_rev);
  v_pub := pagina_publica(v_slug);
  v_res := v_res || jsonb_build_array(jsonb_build_array('Editorial: imagem da capa fica guardada, OG sem banner',
    v_pub#>>'{pagina,capa,imagem}' = IMG and v_pub#>'{config,banner_url}' = 'null'::jsonb, (v_pub->'config')::text));

  -- Clássico com a mesma capa: OG com banner
  v_est := pagina_salvar_rascunho(jsonb_build_object('v', 2, 'layout', 'classico', 'capa', jsonb_build_object('estilo', 'capa', 'imagem', IMG), 'perfil', '{"nome":"Teste 059"}'::jsonb), v_rev);
  v_rev := (v_est->>'revisao')::int;
  v_est := pagina_publicar(v_rev);
  v_pub := pagina_publica(v_slug);
  v_res := v_res || jsonb_build_array(jsonb_build_array('Clássico: OG com banner', v_pub#>>'{config,banner_url}' = IMG, (v_pub->'config')::text));

  -- Clássico com capa sem imagem: continua bloqueando
  v_est := pagina_salvar_rascunho('{"v":2,"layout":"classico","capa":{"estilo":"hero","imagem":null}}', v_rev);
  v_rev := (v_est->>'revisao')::int;
  begin perform pagina_publicar(v_rev); v_err := 'publicou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('Clássico com capa sem imagem continua bloqueado', v_err = 'capa_sem_imagem', v_err));

  -- sem layout (documento de antes da 059): vale o Clássico
  v_est := pagina_salvar_rascunho('{"v":2,"capa":{"estilo":"banner","imagem":null}}', v_rev);
  v_rev := (v_est->>'revisao')::int;
  begin perform pagina_publicar(v_rev); v_err := 'publicou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('sem layout = Clássico (bloqueia capa sem imagem)', v_err = 'capa_sem_imagem', v_err));

  select count(*) filter (where not coalesce((x->>1)::boolean, false)),
         string_agg(case when coalesce((x->>1)::boolean, false) then 'OK    ' else 'FALHOU ' end
                    || (x->>0) || coalesce(' — ' || left(x->>2, 120), ''), E'\n' order by o)
    into v_falhas, v_texto
    from jsonb_array_elements(v_res) with ordinality as t(x, o);
  raise exception E'RESULTADO DO TESTE 059 (tudo desfeito) — falhas: %\n%', v_falhas, v_texto;
end $teste$;


-- ── 4. Regressão: páginas antigas (sem publicação v2) respondem igual à 054 ──
--      Esperado: todas as linhas com igual = true.
with antiga as (
  select e.slug, jsonb_build_object(
    'escritorio', e.nome,
    'slug', e.slug,
    'config', e.pagina_config,
    'selo', not empresa_libera(e.id, 'selo_removivel')
            or coalesce(e.pagina_config->>'rodape_prolu', 'true') <> 'false',
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'tipo', l.tipo, 'titulo', l.titulo,
               'url', case when l.tipo = 'link' then l.url end,
               'slug_formulario', f.slug, 'estilo', l.estilo, 'imagem_url', l.imagem_url,
               'imagem_modo', case when l.imagem_url is not null then coalesce(l.imagem_modo, 'icone') end
             ) order by l.ordem, l.created_at)
        from pagina_links l
        left join formularios f
          on l.tipo = 'formulario' and f.id = l.formulario_id and f.empresa_id = l.empresa_id and f.ativo
       where l.empresa_id = e.id and l.ativo and l.titulo <> ''
         and ((l.tipo = 'link' and l.url is not null) or (l.tipo = 'formulario' and f.id is not null))
    ), '[]'::jsonb)) as resposta
  from empresas e
  where e.pagina_config->>'publicada' = 'true' and e.status_conta = 'ativa'
    and not exists (select 1 from paginas p where p.empresa_id = e.id and p.publicado is not null)
)
select a.slug, pagina_publica(a.slug) = a.resposta as igual
  from antiga a
 order by 2, 1;
