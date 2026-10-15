-- ════════════════════════════════════════════════════════════════
-- MIGRATION 060 — Minha Página v2: cor da sombra dos botões.
-- Rodar no SQL Editor do Supabase ANTES de publicar o front que grava
-- botao.cor_sombra.
--
-- ADITIVA: troca só _pv2_botao_ok (create or replace), que valida
-- aparencia.botao e o estilo próprio de cada item. Aceita a chave opcional
-- cor_sombra ('#rrggbb'); ausente = sombra preta, como antes. Nada mais muda
-- (pagina_v2_validar continua a da 059 e chama esta função).
-- Desfazer: supabase/diagnosticos/desfazer_migration_060.sql
-- Testes:   supabase/diagnosticos/testar_migration_060.sql
-- ════════════════════════════════════════════════════════════════

-- botão: aparencia.botao e estilo.botao de cada item (todas as chaves opcionais).
-- 057: preenchimento (cor ou 'nenhum'), contorno (0 = nenhum, 1-3 px) e texto.
-- 060: cor_sombra (ausente = preta, como antes).
create or replace function _pv2_botao_ok(b jsonb) returns boolean
language sql immutable as $$
  select _pv2_so(b, array['estilo','cor','cor_texto','cor_contorno','cor_texto_contorno',
                          'espessura_contorno','cantos','sombra',
                          'preenchimento','contorno','texto','cor_sombra'])
     and _pv2_opc(b, 'estilo', array['solido','contorno'])
     and _pv2_cor(b, 'cor') and _pv2_cor(b, 'cor_texto') and _pv2_cor(b, 'cor_contorno')
     and _pv2_cor(b, 'cor_texto_contorno', true)
     and (not (b ? 'espessura_contorno') or b->'espessura_contorno' in ('1'::jsonb, '2'::jsonb, '3'::jsonb))
     and _pv2_opc(b, 'cantos', array['none','sm','md','lg','full'])
     and _pv2_opc(b, 'sombra', array['none','soft','strong','hard'])
     and (_pv2_cor(b, 'preenchimento') or b->'preenchimento' = '"nenhum"'::jsonb)
     and (not (b ? 'contorno') or b->'contorno' in ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb))
     and _pv2_cor(b, 'texto')
     and _pv2_cor(b, 'cor_sombra')
$$;

revoke all on function _pv2_botao_ok(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
