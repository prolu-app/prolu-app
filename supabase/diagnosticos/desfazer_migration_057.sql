-- ════════════════════════════════════════════════════════════════
-- DESFAZER a migration_057: volta as duas funções de validação à versão da
-- migration_056. ATENÇÃO: depois disso, rascunho/publicado que já tenham as
-- chaves novas (fonte, fontes, tamanhos, preenchimento, contorno, texto)
-- passam a ser recusados na PRÓXIMA gravação (o que está gravado não muda e a
-- página pública continua saindo). Antes: reverter o front que grava as chaves
-- novas e conferir no bloco 1 quantos documentos já as usam.
-- Rodar o bloco 1 sozinho; depois o bloco 2 inteiro.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Quantos documentos já usam chaves da 057 (SOMENTE LEITURA) ──
select count(*) filter (where rascunho->'aparencia' ?| array['fonte','fontes','tamanhos']
                           or rascunho::text ~ '"(preenchimento|contorno|texto)":') as rascunhos,
       count(*) filter (where publicado->'aparencia' ?| array['fonte','fontes','tamanhos']
                           or publicado::text ~ '"(preenchimento|contorno|texto)":') as publicados
  from paginas;


-- ── 2. Desfazer ──
begin;

-- botão: aparencia.botao e estilo.botao de cada item (todas as chaves opcionais)
create or replace function _pv2_botao_ok(b jsonb) returns boolean
language sql immutable as $$
  select _pv2_so(b, array['estilo','cor','cor_texto','cor_contorno','cor_texto_contorno',
                          'espessura_contorno','cantos','sombra'])
     and _pv2_opc(b, 'estilo', array['solido','contorno'])
     and _pv2_cor(b, 'cor') and _pv2_cor(b, 'cor_texto') and _pv2_cor(b, 'cor_contorno')
     and _pv2_cor(b, 'cor_texto_contorno', true)
     and (not (b ? 'espessura_contorno') or b->'espessura_contorno' in ('1'::jsonb, '2'::jsonb, '3'::jsonb))
     and _pv2_opc(b, 'cantos', array['none','sm','md','lg','full'])
     and _pv2_opc(b, 'sombra', array['none','soft','strong','hard'])
$$;

create or replace function pagina_v2_validar(d jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare
  FONTES constant text[] := array['Inter','Rubik','Montserrat','Poppins','DM Sans','Lato','Raleway',
    'Josefin Sans','Playfair Display','Cormorant Garamond','Libre Baskerville','Abhaya Libre'];
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
  p jsonb; c jsonb; a jsonb; f jsonb; it jsonb; e jsonb;
  v_ids text[] := '{}';
  v_destaques int := 0;
begin
  perform _pv2_exige(_pv2_so(d, array['v','layout','tema','perfil','capa','aparencia','selo','itens']), 'chaves da raiz');
  perform _pv2_exige(d->'v' = '2'::jsonb, 'versão');
  perform _pv2_exige(_pv2_opc(d, 'layout', array['classico','editorial','quadrados','cartoes']), 'layout');
  perform _pv2_exige(coalesce(d->'tema', 'null'::jsonb) = 'null'::jsonb, 'tema');  -- temas: Fase 2
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
  perform _pv2_exige(_pv2_so(a, array['fonte_titulo','fonte_corpo','cor_texto','cor_texto_suave','cor_destaque','fundo','botao'])
                     and _pv2_opc(a, 'fonte_titulo', FONTES) and _pv2_opc(a, 'fonte_corpo', FONTES)
                     and _pv2_cor(a, 'cor_texto') and _pv2_cor(a, 'cor_texto_suave')
                     and (_pv2_cor(a, 'cor_destaque') or a->'cor_destaque' = 'null'::jsonb), 'aparência');
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
                       and _pv2_bool(e, 'destaque')
                       and _pv2_opc(e, 'icone', ICONES, true)
                       and (not (e ? 'botao') or _pv2_botao_ok(e->'botao'))
                       and (not (e ? 'legado') or jsonb_typeof(e->'legado') = 'object'), 'item: estilo');
    perform _pv2_exige(coalesce(e->'icone', 'null') = 'null' or coalesce(it->'imagem_url', 'null') = 'null',
                       'item: ícone e imagem juntos');
    if e->'destaque' = 'true'::jsonb then v_destaques := v_destaques + 1; end if;
  end loop;
  perform _pv2_exige(v_destaques <= 1, 'mais de um destaque');
end $$;

revoke all on function pagina_v2_validar(jsonb) from public, anon, authenticated;
revoke all on function _pv2_botao_ok(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
