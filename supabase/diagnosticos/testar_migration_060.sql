-- ════════════════════════════════════════════════════════════════
-- Testes da migration_060 (cor da sombra dos botões). Rodar DEPOIS dela.
-- UM BLOCO DE CADA VEZ. Bloco 1 só lê. Blocos 2 e 3 SEMPRE terminam com um
-- erro "RESULTADO …" de propósito: o relatório vem na mensagem e o erro
-- desfaz tudo (não gravam nada).
-- ════════════════════════════════════════════════════════════════


-- ── 1. Função trocada (esperado: todas as linhas com ok = true) ──
select 'botão conhece cor_sombra' as item,
       pg_get_functiondef('public._pv2_botao_ok(jsonb)'::regprocedure) ~ 'cor_sombra' as ok
union all select 'botão mantém preenchimento/contorno/texto (057)',
       pg_get_functiondef('public._pv2_botao_ok(jsonb)'::regprocedure) ~ 'preenchimento'
union all select 'validador continua o da 059', pg_get_functiondef('public.pagina_v2_validar(jsonb)'::regprocedure) ~ 'layout_opcoes'
union all select 'fora da API', not has_function_privilege('authenticated', '_pv2_botao_ok(jsonb)', 'EXECUTE');


-- ── 2. Validador ──
--      Esperado: erro "RESULTADO DO VALIDADOR 060 — falhas: 0 de 8".
do $validador$
declare
  r record; v_res text; v_falhas int := 0; v_total int := 0; v_texto text := '';
begin
  for r in select * from (values
  ('sem cor_sombra',                    'aceito',  '{"v":2,"aparencia":{"botao":{"sombra":"soft"}}}'),
  ('cor_sombra na página',              'aceito',  '{"v":2,"aparencia":{"botao":{"sombra":"hard","cor_sombra":"#c0392b"}}}'),
  ('cor_sombra no estilo próprio',      'aceito',  '{"v":2,"itens":[{"id":"00000000-0000-4000-8000-000000000001","tipo":"link","estilo":{"v":1,"botao":{"cor_sombra":"#123456"}}}]}'),
  ('cor_sombra inválida (nome)',        'recusa',  '{"v":2,"aparencia":{"botao":{"cor_sombra":"red"}}}'),
  ('cor_sombra com transparência',      'recusa',  '{"v":2,"aparencia":{"botao":{"cor_sombra":"rgba(0,0,0,.5)"}}}'),
  ('cor_sombra nula',                   'recusa',  '{"v":2,"aparencia":{"botao":{"cor_sombra":null}}}'),
  ('regras de antes (contorno 4)',      'recusa',  '{"v":2,"aparencia":{"botao":{"contorno":4}}}'),
  ('chave desconhecida no botão',       'recusa',  '{"v":2,"aparencia":{"botao":{"brilho":true}}}')
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
  raise exception E'RESULTADO DO VALIDADOR 060 — falhas: % de %\n%', v_falhas, v_total, v_texto;
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
