-- ════════════════════════════════════════════════════════════════
-- DESFAZER a migration_060: volta _pv2_botao_ok à versão da 057.
-- ATENÇÃO: rascunhos com botao.cor_sombra passam a ser recusados na PRÓXIMA
-- gravação — antes, reverter o front e conferir o bloco 1.
-- Rodar o bloco 1 sozinho; depois o bloco 2 inteiro.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Quantos documentos usam cor_sombra (SOMENTE LEITURA) ──
select count(*) filter (where rascunho::text like '%"cor_sombra"%') as rascunhos,
       count(*) filter (where publicado::text like '%"cor_sombra"%') as publicados
  from paginas;


-- ── 2. Desfazer ──
begin;

-- botão: aparencia.botao e estilo.botao de cada item (todas as chaves opcionais).
-- 057: preenchimento (cor ou 'nenhum'), contorno (0 = nenhum, 1-3 px) e texto.
create or replace function _pv2_botao_ok(b jsonb) returns boolean
language sql immutable as $$
  select _pv2_so(b, array['estilo','cor','cor_texto','cor_contorno','cor_texto_contorno',
                          'espessura_contorno','cantos','sombra',
                          'preenchimento','contorno','texto'])
     and _pv2_opc(b, 'estilo', array['solido','contorno'])
     and _pv2_cor(b, 'cor') and _pv2_cor(b, 'cor_texto') and _pv2_cor(b, 'cor_contorno')
     and _pv2_cor(b, 'cor_texto_contorno', true)
     and (not (b ? 'espessura_contorno') or b->'espessura_contorno' in ('1'::jsonb, '2'::jsonb, '3'::jsonb))
     and _pv2_opc(b, 'cantos', array['none','sm','md','lg','full'])
     and _pv2_opc(b, 'sombra', array['none','soft','strong','hard'])
     and (_pv2_cor(b, 'preenchimento') or b->'preenchimento' = '"nenhum"'::jsonb)
     and (not (b ? 'contorno') or b->'contorno' in ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb))
     and _pv2_cor(b, 'texto')
$$;

revoke all on function _pv2_botao_ok(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
