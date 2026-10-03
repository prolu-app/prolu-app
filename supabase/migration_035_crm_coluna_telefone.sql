-- ════════════════════════════════════════════════════════════════
-- MIGRATION 035 — CRM: coluna fixa "Telefone" + excluir coluna limpando dados
-- Rodar no SQL Editor do Supabase. Idempotente (pode rodar de novo).
--
-- 1. crm_colunas aceita o tipo 'phone' (a constraint da migration_004 não
--    aceitava — por isso as colunas "Telefone" criadas à mão eram 'text').
-- 2. Cada escritório ganha a coluna fixa Telefone (slug 'telefone'), no mesmo
--    formato das outras fixas (fixo = true, opcoes { fixed, slug, ... }). O app
--    também a cria sozinho para escritórios novos (FIXED_COLS_DEF em CRM.jsx).
-- 3. Colunas personalizadas de telefone (tipo 'phone' ou nome com "telefone",
--    sem slug) são incorporadas à fixa: valores copiados para a fixa onde ela
--    está vazia, mapeamentos de formulário (formulario_campos.crm_coluna_id)
--    redirecionados para a fixa, e a coluna personalizada é excluída.
--    Atenção: o critério é o NOME — "Telefone do parceiro", por exemplo, também
--    entra. Se houver coluna assim que deva ficar separada, renomeie antes.
-- 4. Função crm_excluir_coluna(uuid): exclui uma coluna personalizada e tira os
--    dados dela de todos os registros, numa transação (a API não consegue
--    remover uma chave do JSON valores num update).
-- ════════════════════════════════════════════════════════════════

-- 1. tipo 'phone' ─────────────────────────────────────────────────────────
alter table crm_colunas drop constraint if exists crm_colunas_tipo_check;
alter table crm_colunas add constraint crm_colunas_tipo_check
  check (tipo in ('text', 'number', 'money', 'date', 'select', 'checkbox', 'client', 'tags', 'phone'));

-- 2 e 3. coluna fixa + incorporação das personalizadas ────────────────────
do $$
declare
  e record;
  antiga record;
  v_fixa uuid;
  v_movidos int;
begin
  for e in select id from empresas loop
    -- 2. cria a fixa só se ainda não existir
    select id into v_fixa
      from crm_colunas
     where empresa_id = e.id and jsonb_typeof(opcoes) = 'object' and opcoes->>'slug' = 'telefone'
     limit 1;
    if v_fixa is null then
      insert into crm_colunas (empresa_id, nome, tipo, fixo, ordem, opcoes)
      values (
        e.id, 'Telefone', 'phone', true,
        (select coalesce(max(ordem), 0) + 1 from crm_colunas where empresa_id = e.id),
        '{"fixed": true, "slug": "telefone", "editableOptions": true, "items": []}'::jsonb
      )
      returning id into v_fixa;
    else
      -- já existia (ex.: criada como texto): passa a ser do tipo telefone
      update crm_colunas set tipo = 'phone', fixo = true where id = v_fixa and (tipo <> 'phone' or fixo = false);
    end if;

    -- 3. personalizadas de telefone (na ordem da tabela: a primeira com valor vence)
    for antiga in
      select id, nome
        from crm_colunas
       where empresa_id = e.id
         and id <> v_fixa
         and (tipo = 'phone' or nome ilike '%telefone%')
         and not coalesce(jsonb_typeof(opcoes) = 'object' and opcoes ? 'slug', false)   -- nunca mexe em colunas fixas
         and fixo = false
       order by ordem, created_at
    loop
      -- valores: copia para a fixa onde ela está vazia, e tira a chave antiga
      update crm_linhas
         set valores = (valores - antiga.id::text)
                       || case
                            when coalesce(valores->>v_fixa::text, '') = '' and coalesce(valores->>antiga.id::text, '') <> ''
                            then jsonb_build_object(v_fixa::text, valores->antiga.id::text)
                            else '{}'::jsonb
                          end
       where empresa_id = e.id and valores ? antiga.id::text;
      get diagnostics v_movidos = row_count;

      -- formulários que mandavam o telefone para a coluna antiga passam a mandar
      -- para a fixa (sem duplicar: um campo por coluna em cada formulário)
      update formulario_campos fc
         set crm_coluna_id = v_fixa
       where fc.crm_coluna_id = antiga.id
         and not exists (select 1 from formulario_campos f2
                          where f2.formulario_id = fc.formulario_id and f2.crm_coluna_id = v_fixa);

      delete from crm_colunas where id = antiga.id;
      raise notice 'empresa %: coluna "%" incorporada à fixa Telefone (% registros com dado)', e.id, antiga.nome, v_movidos;
    end loop;
  end loop;
end $$;

-- 4. excluir coluna personalizada + dados ─────────────────────────────────
-- security invoker: roda com as permissões de quem chama — as policies de
-- crm_colunas/crm_linhas (escritório do usuário) continuam valendo.
create or replace function crm_excluir_coluna(p_coluna uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa uuid;
  v_fixa boolean;
begin
  select empresa_id,
         fixo or coalesce(jsonb_typeof(opcoes) = 'object' and (opcoes ? 'slug' or coalesce((opcoes->>'fixed')::boolean, false)), false)
    into v_empresa, v_fixa
    from crm_colunas
   where id = p_coluna;
  if v_empresa is null then raise exception 'Coluna não encontrada'; end if;
  if v_fixa then raise exception 'Colunas fixas não podem ser excluídas'; end if;

  update crm_linhas
     set valores = valores - p_coluna::text
   where empresa_id = v_empresa and valores ? p_coluna::text;
  delete from crm_colunas where id = p_coluna;
end $$;

grant execute on function crm_excluir_coluna(uuid) to authenticated;

-- a API (PostgREST) passa a enxergar a função e o tipo novo na hora (ver migration_031)
notify pgrst, 'reload schema';

-- conferência: uma coluna Telefone fixa por escritório
select e.nome as escritorio, count(c.id) as colunas_telefone_fixas
  from empresas e
  left join crm_colunas c on c.empresa_id = e.id and jsonb_typeof(c.opcoes) = 'object' and c.opcoes->>'slug' = 'telefone'
 group by e.nome
 order by e.nome;
