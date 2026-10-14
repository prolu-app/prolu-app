-- ════════════════════════════════════════════════════════════════
-- Testes da migration_056 (Minha Página v2). Rodar DEPOIS da migration.
-- UM BLOCO DE CADA VEZ. Blocos 1 e 3 só leem. Blocos 2 e 4 SEMPRE terminam
-- com um erro "RESULTADO …" de propósito: o relatório vem na mensagem e o
-- erro desfaz tudo o que o bloco fez (sem begin/rollback nem tabela temporária).
-- O bloco 4 simula o master do escritório de TESTE (andresouzavr@gmail.com)
-- e não toca em nenhum outro escritório.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura: tudo criado? (esperado: todas as linhas com ok = true) ──
select 'tabela paginas' as item, to_regclass('public.paginas') is not null as ok
union all select 'rls ligada', (select relrowsecurity from pg_class where oid = 'public.paginas'::regclass)
union all select 'policy de leitura', exists (select 1 from pg_policies where tablename = 'paginas' and cmd = 'SELECT')
union all select 'sem policy de escrita', not exists (select 1 from pg_policies where tablename = 'paginas' and cmd <> 'SELECT')
union all select 'trigger de validação', exists (select 1 from pg_trigger where tgname = 'paginas_antes_gravar')
union all select 'authenticated não grava direto', not has_table_privilege('authenticated', 'public.paginas', 'INSERT')
                                                and not has_table_privilege('authenticated', 'public.paginas', 'UPDATE')
union all select 'anon não chama salvar', not has_function_privilege('anon', 'pagina_salvar_rascunho(jsonb, integer)', 'EXECUTE')
union all select 'authenticated chama salvar', has_function_privilege('authenticated', 'pagina_salvar_rascunho(jsonb, integer)', 'EXECUTE')
union all select 'authenticated chama publicar', has_function_privilege('authenticated', 'pagina_publicar(integer)', 'EXECUTE')
union all select 'helper fechado', not has_function_privilege('authenticated', '_pagina_minha_empresa()', 'EXECUTE')
union all select 'anon chama pagina_publica', has_function_privilege('anon', 'pagina_publica(text)', 'EXECUTE')
union all select 'nenhuma linha v2 ainda', (select count(*) = 0 from paginas);


-- ── 2. Validador: casos aceitos e recusados ──
--      Esperado: erro "RESULTADO DO VALIDADOR — falhas: 0 de 35".
do $validador$
declare
  r record; v_res text; v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  for r in select * from (values
  ('mínimo',                         'aceito',  '{"v":2}'),
  ('completo',                       'aceito',  '{"v":2,"layout":"classico","tema":null,"selo":false,
     "perfil":{"nome":"Ana","subtitulo":"Arquitetura","bio":"Oi","foto":"https://x.co/a.jpg","foto_formato":"redondo","foto_oculta":false},
     "capa":{"estilo":"hero","imagem":"https://x.co/c.jpg","foco":"topo"},
     "aparencia":{"fonte_titulo":"Playfair Display","fonte_corpo":"Inter","cor_texto":"#111111","cor_texto_suave":"#555555","cor_destaque":null,
       "fundo":{"tipo":"pattern","cor":"#ffffff","pattern":"grade","pattern_cor":"#000000","pattern_opacidade":0.1,"imagem":null,"imagem_opacidade":0.15},
       "botao":{"estilo":"contorno","cor":"#000000","cor_texto":"#ffffff","cor_contorno":"#000000","cor_texto_contorno":"","espessura_contorno":2,"cantos":"full","sombra":"soft"}},
     "itens":[
       {"id":"00000000-0000-4000-8000-000000000001","tipo":"secao","ativo":true,"titulo":"Projetos"},
       {"id":"00000000-0000-4000-8000-000000000002","tipo":"link","ativo":true,"titulo":"Instagram","descricao":"Siga","url":"https://instagram.com/x",
        "imagem_url":null,"imagem_modo":null,"estilo":{"v":1,"destaque":true,"icone":"instagram","botao":{"cor":"#ff0000"},"legado":{"qualquer":1}}},
       {"id":"00000000-0000-4000-8000-000000000003","tipo":"formulario","ativo":false,"titulo":"Orçamento","formulario_id":"00000000-0000-4000-8000-0000000000aa",
        "imagem_url":"https://x.co/i.png","imagem_modo":"banner"}]}'),
  ('versão errada',                  'recusa',  '{"v":1}'),
  ('sem versão',                     'recusa',  '{}'),
  ('chave desconhecida na raiz',     'recusa',  '{"v":2,"xyz":1}'),
  ('layout fora da lista',           'recusa',  '{"v":2,"layout":"grade"}'),
  ('tema na Fase 1',                 'recusa',  '{"v":2,"tema":"minimal"}'),
  ('subtítulo com 41',               'recusa',  '{"v":2,"perfil":{"subtitulo":"12345678901234567890123456789012345678901"}}'),
  ('subtítulo com 40',               'aceito',  '{"v":2,"perfil":{"subtitulo":"1234567890123456789012345678901234567890"}}'),
  ('foto http',                      'recusa',  '{"v":2,"perfil":{"foto":"http://x.co/a.jpg"}}'),
  ('foto com aspas',                 'recusa',  '{"v":2,"perfil":{"foto":"https://x.co/a\".jpg"}}'),
  ('capa estilo inválido',           'recusa',  '{"v":2,"capa":{"estilo":"tela"}}'),
  ('capa sem imagem (rascunho ok)',  'aceito',  '{"v":2,"capa":{"estilo":"capa","imagem":null}}'),
  ('cor inválida',                   'recusa',  '{"v":2,"aparencia":{"cor_texto":"red"}}'),
  ('fonte fora da lista',            'recusa',  '{"v":2,"aparencia":{"fonte_corpo":"Comic Sans"}}'),
  ('opacidade acima de 0.4',         'recusa',  '{"v":2,"aparencia":{"fundo":{"pattern_opacidade":0.9}}}'),
  ('opacidade como texto',           'recusa',  '{"v":2,"aparencia":{"fundo":{"pattern_opacidade":"0.1"}}}'),
  ('espessura 4',                    'recusa',  '{"v":2,"aparencia":{"botao":{"espessura_contorno":4}}}'),
  ('itens não é lista',              'recusa',  '{"v":2,"itens":{}}'),
  ('item sem id',                    'recusa',  '{"v":2,"itens":[{"tipo":"link"}]}'),
  ('id repetido',                    'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link"},{"id":"00000000-0000-4000-8000-000000000001","tipo":"link"}]}'),
  ('tipo desconhecido',              'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"video"}]}'),
  ('url javascript:',                'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","url":"javascript:alert(1)"}]}'),
  ('url mailto',                     'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","url":"mailto:a@b.co"}]}'),
  ('descrição com 81',               'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","descricao":"123456789012345678901234567890123456789012345678901234567890123456789012345678901"}]}'),
  ('seção com ícone',                'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"secao","titulo":"A","estilo":{"icone":"link"}}]}'),
  ('seção desativada',               'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"secao","titulo":"A","ativo":false}]}'),
  ('formulário com url',             'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"formulario","url":"https://a.co"}]}'),
  ('ícone fora da lista',            'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"icone":"linkedin"}}]}'),
  ('ícone e imagem juntos',          'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","imagem_url":"https://x.co/i.png","estilo":{"icone":"link"}}]}'),
  ('imagem_modo inválido',           'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","imagem_modo":"grande"}]}'),
  ('estilo v2',                      'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"v":2}}]}'),
  ('estilo com chave desconhecida',  'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"cor":"#000000"}}]}'),
  ('dois destaques',                 'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":true}},{"id":"00000000-0000-4000-8000-000000000002","tipo":"link","estilo":{"destaque":true}}]}'),
  ('um destaque',                    'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":true}},{"id":"00000000-0000-4000-8000-000000000002","tipo":"link","estilo":{"destaque":false}}]}')
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
  raise exception E'RESULTADO DO VALIDADOR — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $validador$;


-- ── 3. Regressão: pagina_publica nova = resposta da migration_054 para todas
--      as páginas antigas publicadas (esperado: todas com igual = true) ──
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
)
select a.slug, pagina_publica(a.slug) = a.resposta as igual
  from antiga a
union all
-- não publicadas continuam sem resposta
select e.slug, pagina_publica(e.slug) is null
  from empresas e
 where coalesce(e.pagina_config->>'publicada', 'false') <> 'true'
   and e.pagina_config <> '{}'::jsonb
order by 2, 1;


-- ── 4. Fluxo do editor no escritório de TESTE, simulado e desfeito ──
--      ATENÇÃO: este bloco SEMPRE termina com um erro "RESULTADO DO TESTE".
--      É proposital: o relatório vem na mensagem e o erro desfaz tudo.
--      Esperado: "falhas: 0" e todas as linhas começando com OK.
do $teste$
declare
  v_auth uuid; v_emp uuid; v_slug text; v_est jsonb; v_pub jsonb; v_err text;
  v_res jsonb := '[]'; v_texto text; v_falhas int;
  v_doc jsonb := '{"v":2,"perfil":{"nome":"Teste v2","subtitulo":"Sub"},
    "capa":{"estilo":"nenhuma"},"selo":false,
    "itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","ativo":true,"titulo":"Site","url":"https://prolu.com.br","estilo":{"v":1,"destaque":true,"legado":{"x":1}}},
             {"id":"00000000-0000-4000-8000-000000000002","tipo":"link","ativo":false,"titulo":"Oculto","url":"https://prolu.com.br"},
             {"id":"00000000-0000-4000-8000-000000000003","tipo":"secao","ativo":true,"titulo":"Seção"},
             {"id":"00000000-0000-4000-8000-000000000004","tipo":"formulario","ativo":true,"titulo":"Form inexistente","formulario_id":"00000000-0000-4000-8000-0000000000aa"}]}';
begin
  select u.auth_id, u.empresa_id, e.slug into v_auth, v_emp, v_slug
    from usuarios u join empresas e on e.id = u.empresa_id
   where lower(u.email) = 'andresouzavr@gmail.com';
  if v_auth is null then raise exception 'usuário de teste não encontrado'; end if;
  if exists (select 1 from paginas where empresa_id = v_emp) then
    raise exception 'o escritório de teste já tem linha em paginas: teste abortado';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_res := v_res || jsonb_build_array(jsonb_build_array('escritório de teste', true, v_slug));

  -- antes de publicar: a página antiga continua valendo
  v_est := pagina_salvar_rascunho(v_doc, 0);
  v_res := v_res || jsonb_build_array(jsonb_build_array('salvar rascunho (rev 0→1)', (v_est->>'revisao')::int = 1 and (v_est->>'pendente')::boolean, v_est::text));
  v_res := v_res || jsonb_build_array(jsonb_build_array('rascunho não altera a página pública',
    coalesce(pagina_publica(v_slug)->>'v', '') <> '2', null));

  begin perform pagina_salvar_rascunho(v_doc, 0); v_err := 'gravou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('revisão velha = conflito', v_err = 'conflito_revisao', v_err));

  begin perform pagina_salvar_rascunho('{"v":2,"xyz":1}', 1); v_err := 'gravou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('documento inválido recusado', v_err like 'pagina_invalida%', v_err));

  begin perform pagina_definir_no_ar(true); v_err := 'gravou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('no ar antes de publicar = recusado', v_err = 'nunca_publicada', v_err));

  -- capa sem imagem bloqueia a publicação
  v_est := pagina_salvar_rascunho(v_doc || '{"capa":{"estilo":"capa","imagem":null}}', 1);
  begin perform pagina_publicar(2); v_err := 'publicou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('capa sem imagem bloqueia', v_err = 'capa_sem_imagem', v_err));

  -- 1ª publicação: põe no ar
  v_est := pagina_salvar_rascunho(v_doc, 2);
  v_est := pagina_publicar(3);
  v_res := v_res || jsonb_build_array(jsonb_build_array('1ª publicação põe no ar', (v_est->>'no_ar')::boolean and not (v_est->>'pendente')::boolean, v_est::text));

  v_pub := pagina_publica(v_slug);
  v_res := v_res || jsonb_build_array(jsonb_build_array('pública devolve v2', v_pub->>'v' = '2' and v_pub#>>'{pagina,perfil,nome}' = 'Teste v2', null));
  v_res := v_res || jsonb_build_array(jsonb_build_array('itens: oculto e form inexistente saem',
    jsonb_array_length(v_pub#>'{pagina,itens}') = 2, (v_pub#>'{pagina,itens}')::text));
  v_res := v_res || jsonb_build_array(jsonb_build_array('formulario_id e estilo.legado não saem',
    not (v_pub::text like '%formulario_id%') and v_pub#>'{pagina,itens,0,estilo,legado}' is null, null));
  v_res := v_res || jsonb_build_array(jsonb_build_array('config de OG (sem capa = sem banner)',
    v_pub#>>'{config,nome_exibicao}' = 'Teste v2' and v_pub#>'{config,banner_url}' = 'null'::jsonb, (v_pub->'config')::text));
  v_res := v_res || jsonb_build_array(jsonb_build_array('selo segue o plano',
    (v_pub->>'selo')::boolean = not empresa_libera(v_emp, 'selo_removivel'), v_pub->>'selo'));

  -- fora do ar: some; publicar de novo respeita o "fora do ar"
  v_est := pagina_definir_no_ar(false);
  v_res := v_res || jsonb_build_array(jsonb_build_array('fora do ar some da pública', pagina_publica(v_slug) is null, null));
  v_est := pagina_salvar_rascunho(v_doc || '{"perfil":{"nome":"Teste v2 b"}}', 3);
  v_est := pagina_publicar(4);
  v_res := v_res || jsonb_build_array(jsonb_build_array('republicar mantém fora do ar', not (v_est->>'no_ar')::boolean and pagina_publica(v_slug) is null, v_est::text));
  v_est := pagina_definir_no_ar(true);
  v_res := v_res || jsonb_build_array(jsonb_build_array('colocar no ar mostra o novo conteúdo', pagina_publica(v_slug)#>>'{pagina,perfil,nome}' = 'Teste v2 b', null));

  -- descartar volta ao publicado
  v_est := pagina_salvar_rascunho(v_doc || '{"perfil":{"nome":"Rascunho c"}}', 4);
  v_est := pagina_descartar_rascunho();
  v_res := v_res || jsonb_build_array(jsonb_build_array('descartar volta ao publicado',
    not (v_est->>'pendente')::boolean and (select rascunho#>>'{perfil,nome}' from paginas where empresa_id = v_emp) = 'Teste v2 b', v_est::text));

  -- só o master: sem JWT não grava
  perform set_config('request.jwt.claims', '{}', true);
  begin perform pagina_salvar_rascunho(v_doc, 7); v_err := 'gravou';
  exception when others then v_err := sqlerrm; end;
  v_res := v_res || jsonb_build_array(jsonb_build_array('sem login = sem permissão', v_err = 'sem_permissao', v_err));

  -- relatório: sai como ERRO de propósito (garante que nada fica gravado,
  -- mesmo que o editor não respeite o begin/rollback)
  select count(*) filter (where not coalesce((x->>1)::boolean, false)),
         string_agg(case when coalesce((x->>1)::boolean, false) then 'OK    ' else 'FALHOU ' end
                    || (x->>0) || coalesce(' — ' || left(x->>2, 120), ''), E'\n' order by o)
    into v_falhas, v_texto
    from jsonb_array_elements(v_res) with ordinality as t(x, o);
  raise exception E'RESULTADO DO TESTE (tudo desfeito) — falhas: %\n%', v_falhas, v_texto;
end $teste$;
