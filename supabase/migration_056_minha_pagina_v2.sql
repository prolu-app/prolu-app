-- ════════════════════════════════════════════════════════════════
-- MIGRATION 056 — Minha Página v2: documento versionado, rascunho e
-- publicado separados, validação no servidor com listas fechadas.
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
--
-- ADITIVA: não altera nem apaga empresas.pagina_config, pagina_links, o
-- bucket pagina-assets nem suas políticas. Sem linha em "paginas" (ou sem
-- publicado), pagina_publica devolve exatamente a resposta da migration_054.
--
-- • paginas: um documento v2 por escritório — rascunho (editor/prévia) e
--   publicado (página pública). Escrita só pelas funções pagina_* abaixo.
-- • pagina_v2_validar: listas fechadas espelhadas de src/utils/pagina/modelo.js
--   (o teste confere a paridade). Chave desconhecida = recusada; chave
--   ausente = padrão, aplicado na leitura pelo front.
-- • pagina_publica: publicado v2 quando existe; senão, o caminho antigo.
-- Desfazer: supabase/diagnosticos/desfazer_migration_056.sql
-- ════════════════════════════════════════════════════════════════

-- 1. tabela ───────────────────────────────────────────────────────────────
create table if not exists paginas (
  empresa_id    uuid primary key references empresas(id) on delete cascade,
  rascunho      jsonb,                      -- documento v2 em edição
  publicado     jsonb,                      -- documento v2 no ar; null = vale a página antiga
  no_ar         boolean not null default false,
  revisao       integer not null default 0, -- sobe a cada gravação do rascunho (trava entre abas)
  rascunho_em   timestamptz,
  publicado_em  timestamptz,
  publicado_por uuid,                       -- auth.uid() de quem publicou
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table paginas drop constraint if exists paginas_tamanho;
alter table paginas add constraint paginas_tamanho check (
  (rascunho  is null or pg_column_size(rascunho)  <= 200000) and
  (publicado is null or pg_column_size(publicado) <= 200000)
);

-- 2. validação do documento v2 ────────────────────────────────────────────
-- helpers: chave ausente = ok (o padrão vale na leitura, no front)
create or replace function _pv2_exige(ok boolean, motivo text) returns void
language plpgsql immutable as $$
begin
  if ok is not true then
    raise exception 'pagina_invalida: %', motivo using errcode = '22023';
  end if;
end $$;

create or replace function _pv2_so(o jsonb, permitidas text[]) returns boolean
language sql immutable as $$
  select case when jsonb_typeof(o) = 'object'
              then not exists (select 1 from jsonb_object_keys(o) k where k <> all (permitidas))
              else false end
$$;

create or replace function _pv2_txt(o jsonb, k text, maximo int) returns boolean
language sql immutable as $$
  select not (o ? k) or (jsonb_typeof(o->k) = 'string' and char_length(o->>k) <= maximo)
$$;

create or replace function _pv2_opc(o jsonb, k text, opcoes text[], nulo_ok boolean default false) returns boolean
language sql immutable as $$
  select not (o ? k)
      or (nulo_ok and jsonb_typeof(o->k) = 'null')
      or (jsonb_typeof(o->k) = 'string' and (o->>k) = any (opcoes))
$$;

create or replace function _pv2_cor(o jsonb, k text, vazio_ok boolean default false) returns boolean
language sql immutable as $$
  select not (o ? k)
      or (jsonb_typeof(o->k) = 'string' and ((o->>k) ~ '^#[0-9a-fA-F]{6}$' or (vazio_ok and o->>k = '')))
$$;

-- imagem: só https, sem espaço/aspas/parênteses/barra invertida (mesma regra do front)
create or replace function _pv2_img(o jsonb, k text) returns boolean
language sql immutable as $$
  select not (o ? k) or jsonb_typeof(o->k) = 'null'
      or (jsonb_typeof(o->k) = 'string' and char_length(o->>k) <= 2000
          and (o->>k) ~* '^https://[^[:space:]"''()\\]+$')
$$;

create or replace function _pv2_bool(o jsonb, k text) returns boolean
language sql immutable as $$
  select not (o ? k) or jsonb_typeof(o->k) = 'boolean'
$$;

create or replace function _pv2_num(o jsonb, k text, minimo numeric, maximo numeric) returns boolean
language sql immutable as $$
  select not (o ? k)
      or case when jsonb_typeof(o->k) = 'number' then (o->>k)::numeric between minimo and maximo else false end
$$;

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

-- listas espelhadas de src/utils/pagina/modelo.js — mudar nos dois lugares
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

-- 3. trigger: valida o que entra por qualquer caminho ─────────────────────
create or replace function paginas_antes_gravar() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rascunho  is not null then perform pagina_v2_validar(new.rascunho);  end if;
  if new.publicado is not null then perform pagina_v2_validar(new.publicado); end if;
  if new.no_ar and new.publicado is null then
    raise exception 'pagina_invalida: no ar sem publicação' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists paginas_antes_gravar on paginas;
create trigger paginas_antes_gravar before insert or update on paginas
  for each row execute function paginas_antes_gravar();

-- 4. RLS: leitura como pagina_links; escrita só pelas funções abaixo ─────
alter table paginas enable row level security;
drop policy if exists "paginas: le proprio escritorio ou prolu_admin" on paginas;
create policy "paginas: le proprio escritorio ou prolu_admin" on paginas
  for select using ((empresa_id = auth_empresa_id() and auth_is_empresa_master()) or auth_is_prolu_admin());
revoke insert, update, delete on paginas from anon, authenticated;

-- 5. funções do editor (só o master do próprio escritório) ───────────────
create or replace function _pagina_minha_empresa() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth_empresa_id();
begin
  if v is null or not auth_is_empresa_master() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function _pagina_estado(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('revisao', revisao, 'no_ar', no_ar,
           'rascunho_em', rascunho_em, 'publicado_em', publicado_em,
           'pendente', rascunho is distinct from publicado)
    from paginas where empresa_id = p_empresa
$$;

-- grava o rascunho inteiro de uma vez; p_revisao = a que o editor carregou
-- (0 na primeira vez). Outra aba salvou antes → 'conflito_revisao'.
create or replace function pagina_salvar_rascunho(p_doc jsonb, p_revisao integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := _pagina_minha_empresa();
begin
  if p_doc is null then
    raise exception 'pagina_invalida: documento vazio' using errcode = '22023';
  end if;
  insert into paginas (empresa_id) values (v_emp) on conflict (empresa_id) do nothing;
  update paginas set rascunho = p_doc, revisao = revisao + 1, rascunho_em = now()
   where empresa_id = v_emp and revisao = p_revisao;
  if not found then raise exception 'conflito_revisao'; end if;
  return _pagina_estado(v_emp);
end $$;

-- rascunho → publicado. A 1ª publicação põe no ar; as seguintes mantêm o
-- "Fora do ar" escolhido (o editor avisa e oferece "Colocar no ar").
-- Capa/Banner/Hero sem imagem bloqueia ('capa_sem_imagem').
create or replace function pagina_publicar(p_revisao integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := _pagina_minha_empresa(); r paginas%rowtype;
begin
  select * into r from paginas where empresa_id = v_emp for update;
  if not found or r.rascunho is null then raise exception 'sem_rascunho'; end if;
  if r.revisao <> p_revisao then raise exception 'conflito_revisao'; end if;
  if coalesce(r.rascunho #>> '{capa,estilo}', 'nenhuma') <> 'nenhuma'
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

-- volta o rascunho ao publicado (null se nunca publicou → o editor reconverte a página antiga)
create or replace function pagina_descartar_rascunho()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := _pagina_minha_empresa();
begin
  update paginas set rascunho = publicado, revisao = revisao + 1, rascunho_em = now()
   where empresa_id = v_emp;
  return _pagina_estado(v_emp);
end $$;

create or replace function pagina_definir_no_ar(p_no_ar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := _pagina_minha_empresa();
begin
  update paginas set no_ar = coalesce(p_no_ar, false)
   where empresa_id = v_emp and publicado is not null;
  if not found then raise exception 'nunca_publicada'; end if;
  return _pagina_estado(v_emp);
end $$;

-- validação só roda dentro do trigger: fora da API pública
revoke all on function pagina_v2_validar(jsonb) from public, anon, authenticated;
revoke all on function _pv2_exige(boolean, text), _pv2_so(jsonb, text[]), _pv2_txt(jsonb, text, int),
  _pv2_opc(jsonb, text, text[], boolean), _pv2_cor(jsonb, text, boolean), _pv2_img(jsonb, text),
  _pv2_bool(jsonb, text), _pv2_num(jsonb, text, numeric, numeric), _pv2_botao_ok(jsonb)
  from public, anon, authenticated;

revoke all on function _pagina_minha_empresa() from public, anon, authenticated;
revoke all on function _pagina_estado(uuid) from public, anon, authenticated;
revoke all on function pagina_salvar_rascunho(jsonb, integer) from public, anon;
revoke all on function pagina_publicar(integer) from public, anon;
revoke all on function pagina_descartar_rascunho() from public, anon;
revoke all on function pagina_definir_no_ar(boolean) from public, anon;
grant execute on function pagina_salvar_rascunho(jsonb, integer) to authenticated;
grant execute on function pagina_publicar(integer) to authenticated;
grant execute on function pagina_descartar_rascunho() to authenticated;
grant execute on function pagina_definir_no_ar(boolean) to authenticated;

-- 6. leitura pública ──────────────────────────────────────────────────────
-- v2: publicado pelo editor novo (no_ar decide se aparece), itens ativos com
-- título; 'link' só com URL; 'formulario' só com formulário ativo do próprio
-- escritório (vira slug_formulario; formulario_id e estilo.legado não saem).
-- 'config' repete no formato antigo só o que o middleware de OG lê.
-- Legado: sem publicado v2, resposta idêntica à da migration_054.
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
revoke all on function pagina_publica(text) from public;
grant execute on function pagina_publica(text) to anon, authenticated;

notify pgrst, 'reload schema';
