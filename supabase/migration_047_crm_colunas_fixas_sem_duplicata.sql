-- ════════════════════════════════════════════════════════════════
-- MIGRATION 047 — CRM: colunas fixas sem duplicata
-- Rodar no SQL Editor do Supabase. Idempotente (pode rodar de novo).
--
-- Causa: ao abrir o CRM de um escritório novo, o app cria as colunas fixas
-- (FIXED_COLS_DEF em CRM.jsx). No modo dev (npm run dev) o React roda esse
-- carregamento duas vezes em paralelo e as duas execuções criavam as colunas
-- -> escritórios criados/abertos pela primeira vez no app local ficaram com
-- colunas fixas duplicadas (ex.: duas "Data de entrada"). O front já foi
-- corrigido; esta migration limpa o que ficou e trava no banco.
--
-- 1. Para cada escritório e slug de coluna fixa repetido, mantém a coluna
--    mais antiga e, para cada duplicata:
--      - valores dos registros (crm_linhas.valores) vão para a coluna mantida
--        onde ela estiver vazia, e a chave da duplicata sai do registro;
--      - campos de formulário que apontavam para a duplicata passam a apontar
--        para a mantida;
--      - a duplicata é excluída.
-- 2. Índice único (empresa_id, slug) nas colunas fixas: impede que se repita.
-- ════════════════════════════════════════════════════════════════

do $$
declare
  dup record;
  v_mantida uuid;
  v_total int := 0;
begin
  for dup in
    select c.id, c.empresa_id, c.opcoes->>'slug' as slug
      from crm_colunas c
     where c.opcoes->>'slug' is not null
       and exists (
         select 1 from crm_colunas o
          where o.empresa_id = c.empresa_id
            and o.opcoes->>'slug' = c.opcoes->>'slug'
            and (o.created_at, o.id) < (c.created_at, c.id)
       )
  loop
    select o.id into v_mantida
      from crm_colunas o
     where o.empresa_id = dup.empresa_id and o.opcoes->>'slug' = dup.slug
     order by o.created_at, o.id
     limit 1;

    -- valores: copia para a mantida onde ela está vazia e tira a chave duplicada
    update crm_linhas
       set valores = (valores - dup.id::text)
                     || case
                          when coalesce(valores->>v_mantida::text, '') = '' and coalesce(valores->>dup.id::text, '') <> ''
                          then jsonb_build_object(v_mantida::text, valores->dup.id::text)
                          else '{}'::jsonb
                        end
     where empresa_id = dup.empresa_id and valores ? dup.id::text;

    -- formulários: aponta para a mantida (sem repetir a coluna no mesmo formulário)
    update formulario_campos fc
       set crm_coluna_id = v_mantida
     where fc.crm_coluna_id = dup.id
       and not exists (select 1 from formulario_campos f2
                        where f2.formulario_id = fc.formulario_id and f2.crm_coluna_id = v_mantida);
    -- os que sobrarem apontando para a duplicata ficam sem coluna (on delete set null)

    delete from crm_colunas where id = dup.id;
    v_total := v_total + 1;
  end loop;
  raise notice 'Colunas fixas duplicadas removidas: %', v_total;
end $$;

-- 2. trava: um slug de coluna fixa por escritório
create unique index if not exists crm_colunas_slug_unico
  on crm_colunas (empresa_id, (opcoes->>'slug'))
  where opcoes->>'slug' is not null;

notify pgrst, 'reload schema';
