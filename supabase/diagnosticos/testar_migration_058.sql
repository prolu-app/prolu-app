-- ════════════════════════════════════════════════════════════════
-- Testes da migration_058 (fim do botão de destaque). Rodar DEPOIS dela.
-- UM BLOCO DE CADA VEZ. Bloco 1 só lê. Blocos 2 e 3 SEMPRE terminam com um
-- erro "RESULTADO …" de propósito: o relatório vem na mensagem e o erro
-- desfaz tudo (não gravam nada).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Função trocada (esperado: todas as linhas com ok = true) ──
select 'sem a regra de 1 destaque' as item,
       pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) !~ 'mais de um destaque' as ok
union all select 'continua com as regras da 057 (fontes)',
       pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) ~ 'FONTES_LEGADAS'
union all select 'validador fora da API', not has_function_privilege('authenticated', 'pagina_v2_validar(jsonb)', 'EXECUTE')
union all select 'trigger continua ligado', exists (select 1 from pg_trigger where tgname = 'paginas_antes_gravar');


-- ── 2. Validador ──
--      Esperado: erro "RESULTADO DO VALIDADOR 058 — falhas: 0 de 10".
do $validador$
declare
  r record; v_res text; v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  for r in select * from (values
  ('sem destaque',                        'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"v":1,"icone":null}}]}'),
  ('destaque antigo (1) aceito',          'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":true}}]}'),
  ('destaque antigo (2) agora aceito',    'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":true}},{"id":"00000000-0000-4000-8000-000000000002","tipo":"link","estilo":{"destaque":true}}]}'),
  ('destaque não booleano',               'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"destaque":"sim"}}]}'),
  ('estilo próprio continua',             'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"v":1,"botao":{"preenchimento":"nenhum","contorno":2,"cor_contorno":"#123456","texto":"#123456","cantos":"full"}}}]}'),
  ('estilo próprio inválido',             'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"botao":{"contorno":9}}}]}'),
  ('fontes e tamanhos (057)',             'aceito',  '{"v":2,"aparencia":{"fonte":"Lora","fontes":{"titulo":"Oswald"},"tamanhos":{"botoes":"gg"}}}'),
  ('fonte fora da lista (057)',           'recusa',  '{"v":2,"aparencia":{"fonte":"Comic Sans"}}'),
  ('chave desconhecida no item',          'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","fixo":true}]}'),
  ('id repetido',                         'recusa',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link"},{"id":"00000000-0000-4000-8000-000000000001","tipo":"link"}]}')
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
  raise exception E'RESULTADO DO VALIDADOR 058 — falhas: % de %\n%', v_falhas, v_total, v_texto;
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
