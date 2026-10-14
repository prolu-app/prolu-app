-- ════════════════════════════════════════════════════════════════
-- Testes da migration_057 (fontes por elemento, tamanhos, botão novo).
-- Rodar DEPOIS da migration. UM BLOCO DE CADA VEZ.
-- Bloco 1 só lê. Blocos 2 e 3 SEMPRE terminam com um erro "RESULTADO …" de
-- propósito: o relatório vem na mensagem e o erro desfaz tudo (não gravam nada).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Funções trocadas (esperado: todas as linhas com ok = true) ──
select 'validador conhece fontes/tamanhos' as item,
       pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) ~ 'FONTES_LEGADAS' as ok
union all select 'botão conhece preenchimento/contorno/texto',
       pg_get_functiondef('public._pv2_botao_ok(jsonb)'::regprocedure) ~ 'preenchimento'
union all select 'validador fora da API', not has_function_privilege('authenticated', 'pagina_v2_validar(jsonb)', 'EXECUTE')
union all select 'trigger continua ligado', exists (select 1 from pg_trigger where tgname = 'paginas_antes_gravar');


-- ── 2. Validador: casos novos e de antes ──
--      Esperado: erro "RESULTADO DO VALIDADOR 057 — falhas: 0 de 30".
do $validador$
declare
  r record; v_res text; v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  for r in select * from (values
  -- de antes (056) continuam aceitos
  ('mínimo',                              'aceito',  '{"v":2}'),
  ('fonte_titulo/corpo antigos (Lato)',   'aceito',  '{"v":2,"aparencia":{"fonte_titulo":"Lato","fonte_corpo":"Rubik"}}'),
  ('botão sólido de antes',               'aceito',  '{"v":2,"aparencia":{"botao":{"estilo":"solido","cor":"#000000","cor_texto":"#ffffff"}}}'),
  ('botão contorno de antes',             'aceito',  '{"v":2,"aparencia":{"botao":{"estilo":"contorno","cor_contorno":"#000000","espessura_contorno":3}}}'),
  -- fontes
  ('fonte principal nova',                'aceito',  '{"v":2,"aparencia":{"fonte":"Space Grotesk"}}'),
  ('fonte principal DM Serif Display',    'aceito',  '{"v":2,"aparencia":{"fonte":"DM Serif Display"}}'),
  ('fonte principal fora da lista',       'recusa',  '{"v":2,"aparencia":{"fonte":"Lato"}}'),
  ('fonte por elemento',                  'aceito',  '{"v":2,"aparencia":{"fontes":{"titulo":"Oswald","subtitulo":null,"descricao":"Lora","botoes":"Inter"}}}'),
  ('fonte por elemento = principal',      'aceito',  '{"v":2,"aparencia":{"fontes":{"titulo":null}}}'),
  ('fonte por elemento fora da lista',    'recusa',  '{"v":2,"aparencia":{"fontes":{"titulo":"Comic Sans"}}}'),
  ('elemento desconhecido em fontes',     'recusa',  '{"v":2,"aparencia":{"fontes":{"rodape":"Inter"}}}'),
  ('fontes não é objeto',                 'recusa',  '{"v":2,"aparencia":{"fontes":"Inter"}}'),
  ('fonte_titulo inventada',              'recusa',  '{"v":2,"aparencia":{"fonte_titulo":"Comic Sans"}}'),
  -- tamanhos
  ('tamanhos P/M/G/GG',                   'aceito',  '{"v":2,"aparencia":{"tamanhos":{"titulo":"gg","subtitulo":"p","descricao":"g","botoes":"m"}}}'),
  ('tamanho fora da lista',               'recusa',  '{"v":2,"aparencia":{"tamanhos":{"titulo":"xg"}}}'),
  ('tamanho null',                        'recusa',  '{"v":2,"aparencia":{"tamanhos":{"titulo":null}}}'),
  ('tamanho numérico',                    'recusa',  '{"v":2,"aparencia":{"tamanhos":{"botoes":20}}}'),
  ('elemento desconhecido em tamanhos',   'recusa',  '{"v":2,"aparencia":{"tamanhos":{"rodape":"m"}}}'),
  -- botão novo
  ('preenchimento + contorno + texto',    'aceito',  '{"v":2,"aparencia":{"botao":{"preenchimento":"#ffffff","contorno":2,"cor_contorno":"#ff0000","texto":"#000000"}}}'),
  ('sem preenchimento',                   'aceito',  '{"v":2,"aparencia":{"botao":{"preenchimento":"nenhum","contorno":1}}}'),
  ('sem contorno (0)',                    'aceito',  '{"v":2,"aparencia":{"botao":{"preenchimento":"#000000","contorno":0}}}'),
  ('preenchimento inválido',              'recusa',  '{"v":2,"aparencia":{"botao":{"preenchimento":"transparent"}}}'),
  ('contorno 4',                          'recusa',  '{"v":2,"aparencia":{"botao":{"contorno":4}}}'),
  ('contorno como texto',                 'recusa',  '{"v":2,"aparencia":{"botao":{"contorno":"2"}}}'),
  ('texto inválido',                      'recusa',  '{"v":2,"aparencia":{"botao":{"texto":"white"}}}'),
  ('estilo próprio do item com o novo',   'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"v":1,"destaque":true,"botao":{"preenchimento":"nenhum","contorno":3,"cor_contorno":"#123456","texto":"#123456"}}}]}'),
  ('estilo próprio do item inválido',     'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"botao":{"contorno":9}}}]}'),
  -- o resto continua fechado
  ('chave desconhecida em aparência',     'recusa',  '{"v":2,"aparencia":{"fonte_rodape":"Inter"}}'),
  ('chave desconhecida no botão',         'recusa',  '{"v":2,"aparencia":{"botao":{"gradiente":true}}}'),
  ('dois destaques',                      'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":true}},{"id":"00000000-0000-4000-8000-000000000002","tipo":"link","estilo":{"destaque":true}}]}')
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
  raise exception E'RESULTADO DO VALIDADOR 057 — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $validador$;


-- ── 3. Tudo o que já está gravado em "paginas" continua válido ──
--      Esperado: erro "RESULTADO DOS DOCUMENTOS GRAVADOS — falhas: 0 de N".
do $gravados$
declare
  r record; v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  for r in
    select e.slug, 'rascunho' as qual, p.rascunho as doc from paginas p join empresas e on e.id = p.empresa_id where p.rascunho is not null
    union all
    select e.slug, 'publicado', p.publicado from paginas p join empresas e on e.id = p.empresa_id where p.publicado is not null
  loop
    v_total := v_total + 1;
    begin
      perform pagina_v2_validar(r.doc);
      v_texto := v_texto || 'OK     ' || r.slug || ' (' || r.qual || E')\n';
    exception when others then
      v_falhas := v_falhas + 1;
      v_texto := v_texto || 'FALHOU ' || r.slug || ' (' || r.qual || '): ' || sqlerrm || E'\n';
    end;
  end loop;
  raise exception E'RESULTADO DOS DOCUMENTOS GRAVADOS — falhas: % de %\n%', v_falhas, v_total, v_texto;
end $gravados$;
