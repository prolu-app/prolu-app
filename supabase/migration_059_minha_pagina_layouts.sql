-- ════════════════════════════════════════════════════════════════
-- MIGRATION 059 — Minha Página v2: layouts Editorial, Quadrados e Cartões.
-- Rodar no SQL Editor do Supabase ANTES de publicar o front que grava
-- layout_opcoes.
--
-- ADITIVA: troca três funções (create or replace), sem tabela/dado/política.
-- • pagina_v2_validar: aceita a chave opcional layout_opcoes
--     { editorial_links: 'linhas' | 'botoes', cartoes_seta: boolean }.
--   Os ids de layout (classico, editorial, quadrados, cartoes) já eram aceitos.
-- • pagina_publicar: "capa sem imagem" só bloqueia no layout Clássico (nos
--   outros a capa não é desenhada; imagem e chaves da capa ficam guardadas).
-- • pagina_publica: a imagem da capa só vai para o OG (banner_url) no
--   Clássico. Fora isso, idêntica à 056 — e a resposta das páginas antigas
--   (sem publicação v2) não muda.
-- Desfazer: supabase/diagnosticos/desfazer_migration_059.sql
-- Testes:   supabase/diagnosticos/testar_migration_059.sql
-- ════════════════════════════════════════════════════════════════

create or replace function pagina_v2_validar(d jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare
  -- 057: 12 fontes curadas (fonte principal e por elemento)
  FONTES constant text[] := array['Montserrat','Inter','Poppins','DM Sans','Josefin Sans','Work Sans',
    'Space Grotesk','Playfair Display','Cormorant Garamond','Lora','DM Serif Display','Oswald'];
  -- fonte_titulo/fonte_corpo de rascunhos anteriores à 057 (lista antiga + nova)
  FONTES_LEGADAS constant text[] := array['Inter','Rubik','Montserrat','Poppins','DM Sans','Lato','Raleway',
    'Josefin Sans','Playfair Display','Cormorant Garamond','Libre Baskerville','Abhaya Libre',
    'Work Sans','Space Grotesk','Lora','DM Serif Display','Oswald'];
  ELEMENTOS constant text[] := array['titulo','subtitulo','descricao','botoes'];
  TAMANHOS constant text[] := array['p','m','g','gg'];
  PADROES constant text[] := array['pontilhado-fino','pontilhado-medio','confete','linhas-horizontais',
    'linhas-verticais','diagonal-suave','diagonal-dupla','grade','grade-larga','xadrez','tijolo',
    'hexagono','onda','escama','topografia','arco','petala'];
  IMAGENS_FUNDO constant text[] := array['madeira-fina','madeira-larga','madeira-escura','marmore-branco',
    'marmore-escuro','granito','travertino','concreto-liso','concreto-bruto','linho','canvas',
    'sombra-monstera','sombra-palmeira','sombra-veneziana','sombra-janela','sombra-bambu',
    'sombra-geometrica','sombra-pampas','sombra-samambaia','sombra-janela-folha'];
  ICONES constant text[] := array['instagram','whatsapp','youtube','tiktok','facebook','pinterest',
    'behance','spotify','telegram','x','google-maps',
    'link','telefone','email','localizacao','calendario','documento','download','sacola','estrela',
    'casa','regua','camera','imagem','play','musica','mensagem','globo','maleta'];
  UUID_RE constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  p jsonb; c jsonb; a jsonb; f jsonb; it jsonb; e jsonb; x jsonb; el text;
  v_ids text[] := '{}';
begin
  perform _pv2_exige(_pv2_so(d, array['v','layout','layout_opcoes','tema','perfil','capa','aparencia','selo','itens']), 'chaves da raiz');
  perform _pv2_exige(d->'v' = '2'::jsonb, 'versão');
  perform _pv2_exige(_pv2_opc(d, 'layout', array['classico','editorial','quadrados','cartoes']), 'layout');
  perform _pv2_exige(coalesce(d->'tema', 'null'::jsonb) = 'null'::jsonb, 'tema');  -- temas: Fase 2
  -- 059: opções por layout (Editorial: estilo dos links; Cartões: seta)
  x := coalesce(d->'layout_opcoes', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(x, array['editorial_links','cartoes_seta'])
                     and _pv2_opc(x, 'editorial_links', array['linhas','botoes'])
                     and _pv2_bool(x, 'cartoes_seta'), 'opções do layout');
  perform _pv2_exige(_pv2_bool(d, 'selo'), 'selo');

  p := coalesce(d->'perfil', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(p, array['nome','subtitulo','bio','foto','foto_formato','foto_oculta']), 'perfil');
  perform _pv2_exige(_pv2_txt(p, 'nome', 80) and _pv2_txt(p, 'subtitulo', 40) and _pv2_txt(p, 'bio', 300), 'perfil: textos');
  perform _pv2_exige(_pv2_img(p, 'foto') and _pv2_bool(p, 'foto_oculta')
                     and _pv2_opc(p, 'foto_formato', array['quadrado','arredondado','redondo']), 'perfil: foto');

  c := coalesce(d->'capa', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(c, array['estilo','imagem','foco'])
                     and _pv2_opc(c, 'estilo', array['nenhuma','banner','capa','hero'])
                     and _pv2_img(c, 'imagem')
                     and _pv2_opc(c, 'foco', array['topo','centro','base']), 'capa');

  a := coalesce(d->'aparencia', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(a, array['fonte','fontes','tamanhos','fonte_titulo','fonte_corpo',
                                       'cor_texto','cor_texto_suave','cor_destaque','fundo','botao'])
                     and _pv2_opc(a, 'fonte', FONTES)
                     and _pv2_opc(a, 'fonte_titulo', FONTES_LEGADAS) and _pv2_opc(a, 'fonte_corpo', FONTES_LEGADAS)
                     and _pv2_cor(a, 'cor_texto') and _pv2_cor(a, 'cor_texto_suave')
                     and (_pv2_cor(a, 'cor_destaque') or a->'cor_destaque' = 'null'::jsonb), 'aparência');
  -- fontes por elemento (null = igual à principal) e tamanhos P/M/G/GG
  x := coalesce(a->'fontes', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(x, ELEMENTOS), 'aparência: fontes');
  foreach el in array ELEMENTOS loop
    perform _pv2_exige(_pv2_opc(x, el, FONTES, true), 'aparência: fonte de ' || el);
  end loop;
  x := coalesce(a->'tamanhos', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(x, ELEMENTOS), 'aparência: tamanhos');
  foreach el in array ELEMENTOS loop
    perform _pv2_exige(_pv2_opc(x, el, TAMANHOS), 'aparência: tamanho de ' || el);
  end loop;

  f := coalesce(a->'fundo', '{}'::jsonb);
  perform _pv2_exige(_pv2_so(f, array['tipo','cor','pattern','pattern_cor','pattern_opacidade','imagem','imagem_opacidade'])
                     and _pv2_opc(f, 'tipo', array['cor','pattern','textura','sombra'])
                     and _pv2_cor(f, 'cor') and _pv2_cor(f, 'pattern_cor')
                     and _pv2_opc(f, 'pattern', PADROES, true) and _pv2_opc(f, 'imagem', IMAGENS_FUNDO, true)
                     and _pv2_num(f, 'pattern_opacidade', 0.05, 0.4)
                     and _pv2_num(f, 'imagem_opacidade', 0.05, 0.4), 'aparência: fundo');
  perform _pv2_exige(not (a ? 'botao') or _pv2_botao_ok(a->'botao'), 'aparência: botão');

  perform _pv2_exige(not (d ? 'itens') or jsonb_typeof(d->'itens') = 'array', 'itens');
  perform _pv2_exige(jsonb_array_length(coalesce(d->'itens', '[]'::jsonb)) <= 100, 'itens: máximo 100');

  for it in select value from jsonb_array_elements(coalesce(d->'itens', '[]'::jsonb)) loop
    perform _pv2_exige(jsonb_typeof(it) = 'object' and (it->>'id') ~* UUID_RE, 'item: id');
    perform _pv2_exige(not ((it->>'id') = any (v_ids)), 'item: id repetido');
    v_ids := v_ids || (it->>'id');
    perform _pv2_exige(it ? 'tipo' and _pv2_opc(it, 'tipo', array['link','formulario','secao']), 'item: tipo');
    perform _pv2_exige(_pv2_bool(it, 'ativo') and _pv2_txt(it, 'titulo', 100), 'item: título');

    -- seção: só título e ativo (sem ícone, imagem, destaque ou estilo)
    if it->>'tipo' = 'secao' then
      perform _pv2_exige(_pv2_so(it, array['id','tipo','ativo','titulo']), 'seção: campos');
      continue;
    end if;

    perform _pv2_exige(_pv2_so(it, array['id','tipo','ativo','titulo','descricao','url','formulario_id',
                                         'imagem_url','imagem_modo','estilo']), 'item: campos');
    perform _pv2_exige(_pv2_txt(it, 'descricao', 80), 'item: descrição');
    if it->>'tipo' = 'link' then
      -- mesma regra da constraint pagina_links_valida (migration_041)
      perform _pv2_exige(coalesce(it->'formulario_id', 'null') = 'null'
        and (coalesce(it->'url', 'null') = 'null'
             or (jsonb_typeof(it->'url') = 'string' and char_length(it->>'url') <= 2000
                 and (it->>'url') ~* '^(https?://[^[:space:]]+|mailto:[^[:space:]]+|tel:[+0-9() -]+)$')), 'link: url');
    else
      perform _pv2_exige(coalesce(it->'url', 'null') = 'null'
        and (coalesce(it->'formulario_id', 'null') = 'null'
             or (jsonb_typeof(it->'formulario_id') = 'string' and (it->>'formulario_id') ~* UUID_RE)), 'formulário: id');
    end if;
    perform _pv2_exige(_pv2_img(it, 'imagem_url')
                       and _pv2_opc(it, 'imagem_modo', array['icone','banner'], true), 'item: imagem');

    e := coalesce(it->'estilo', '{}'::jsonb);
    perform _pv2_exige(_pv2_so(e, array['v','destaque','icone','botao','legado'])
                       and (not (e ? 'v') or e->'v' = '1'::jsonb)
                       and _pv2_bool(e, 'destaque')  -- 058: chave antiga, aceita e ignorada
                       and _pv2_opc(e, 'icone', ICONES, true)
                       and (not (e ? 'botao') or _pv2_botao_ok(e->'botao'))
                       and (not (e ? 'legado') or jsonb_typeof(e->'legado') = 'object'), 'item: estilo');
    perform _pv2_exige(coalesce(e->'icone', 'null') = 'null' or coalesce(it->'imagem_url', 'null') = 'null',
                       'item: ícone e imagem juntos');
  end loop;
end $$;

-- rascunho → publicado. A 1ª publicação põe no ar; as seguintes mantêm o
-- "Fora do ar" escolhido (o editor avisa e oferece "Colocar no ar").
-- Capa/Banner/Hero sem imagem bloqueia ('capa_sem_imagem') — só no layout Clássico (059).
create or replace function pagina_publicar(p_revisao integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := _pagina_minha_empresa(); r paginas%rowtype;
begin
  select * into r from paginas where empresa_id = v_emp for update;
  if not found or r.rascunho is null then raise exception 'sem_rascunho'; end if;
  if r.revisao <> p_revisao then raise exception 'conflito_revisao'; end if;
  if coalesce(r.rascunho->>'layout', 'classico') = 'classico'
     and coalesce(r.rascunho #>> '{capa,estilo}', 'nenhuma') <> 'nenhuma'
     and r.rascunho #>> '{capa,imagem}' is null then
    raise exception 'capa_sem_imagem';
  end if;
  update paginas
     set publicado = rascunho,
         no_ar = case when publicado is null then true else no_ar end,
         publicado_em = now(),
         publicado_por = auth.uid()
   where empresa_id = v_emp;
  return _pagina_estado(v_emp);
end $$;

create or replace function pagina_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when pg.publicado is not null then
      case when pg.no_ar then jsonb_build_object(
        'v', 2,
        'escritorio', e.nome,
        'slug', e.slug,
        -- selo: Starter sempre; demais planos seguem o "selo" publicado (ausente = ligado)
        'selo', not empresa_libera(e.id, 'selo_removivel')
                or coalesce(pg.publicado->>'selo', 'true') <> 'false',
        'pagina', (pg.publicado - 'itens') || jsonb_build_object('itens', coalesce((
            select jsonb_agg(
                     ((i.item - 'formulario_id') #- '{estilo,legado}')
                     || case when i.item->>'tipo' = 'formulario'
                             then jsonb_build_object('slug_formulario', f.slug) else '{}'::jsonb end
                     order by i.pos)
              from jsonb_array_elements(coalesce(pg.publicado->'itens', '[]'::jsonb)) with ordinality as i(item, pos)
              left join formularios f
                on i.item->>'tipo' = 'formulario'
               and f.id = (i.item->>'formulario_id')::uuid
               and f.empresa_id = e.id and f.ativo
             where coalesce(i.item->>'ativo', 'true') = 'true'
               and coalesce(i.item->>'titulo', '') <> ''
               and (i.item->>'tipo' = 'secao'
                    or (i.item->>'tipo' = 'link' and i.item->>'url' is not null)
                    or (i.item->>'tipo' = 'formulario' and f.id is not null))
          ), '[]'::jsonb)),
        'config', jsonb_build_object(
          'nome_exibicao', pg.publicado #>> '{perfil,nome}',
          'bio',           pg.publicado #>> '{perfil,bio}',
          'foto_perfil',   pg.publicado #>> '{perfil,foto}',
          'banner_url',    case when coalesce(pg.publicado #>> '{capa,estilo}', 'nenhuma') <> 'nenhuma'
                                 and coalesce(pg.publicado->>'layout', 'classico') = 'classico'
                                then pg.publicado #>> '{capa,imagem}' end)
      ) end
    when e.pagina_config->>'publicada' = 'true' then jsonb_build_object(
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
      ), '[]'::jsonb))
  end
  from empresas e
  left join paginas pg on pg.empresa_id = e.id
  where e.slug = lower(trim(coalesce(p_slug, '')))
    and e.status_conta = 'ativa'
$$;
revoke all on function pagina_v2_validar(jsonb) from public, anon, authenticated;
revoke all on function pagina_publicar(integer) from public, anon;
grant execute on function pagina_publicar(integer) to authenticated;
revoke all on function pagina_publica(text) from public;
grant execute on function pagina_publica(text) to anon, authenticated;

notify pgrst, 'reload schema';
