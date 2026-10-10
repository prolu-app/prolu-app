-- ════════════════════════════════════════════════════════════════
-- MIGRATION 048 — CRM: coluna Telefone logo depois de Cliente
-- Rodar no SQL Editor do Supabase DEPOIS da 047. Idempotente.
--
-- O padrão novo (FIXED_COLS_DEF em CRM.jsx) já cria Telefone depois de
-- Cliente nos escritórios novos. Nos escritórios existentes, a migration_035
-- tinha colocado Telefone no fim. Aqui, em cada escritório, Telefone passa a
-- ficar imediatamente depois de Cliente e as demais colunas mantêm a ordem
-- relativa entre si (ordem renumerada 0, 1, 2…).
--
-- ATENÇÃO: isso sobrescreve a posição do Telefone também em escritórios que
-- já tenham arrastado essa coluna para outro lugar. Só o Telefone muda de
-- lugar; as outras colunas continuam na mesma sequência.
-- ════════════════════════════════════════════════════════════════

do $$
declare
  e record;
  v_cliente uuid;
  v_telefone uuid;
  v_alteradas int := 0;
begin
  for e in select distinct empresa_id from crm_colunas where empresa_id is not null loop
    select id into v_cliente from crm_colunas
     where empresa_id = e.empresa_id and opcoes->>'slug' = 'cliente' limit 1;
    select id into v_telefone from crm_colunas
     where empresa_id = e.empresa_id and opcoes->>'slug' = 'telefone' limit 1;
    if v_cliente is null or v_telefone is null then continue; end if;

    with sem_telefone as (
      select id, row_number() over (order by ordem, created_at, id) as pos
        from crm_colunas
       where empresa_id = e.empresa_id and id <> v_telefone
    ),
    pos_cliente as (
      select pos from sem_telefone where id = v_cliente
    ),
    nova as (
      -- antes do cliente e o cliente: mesma posição; depois dele: +1; telefone logo após
      select s.id, case when s.pos <= pc.pos then s.pos - 1 else s.pos end as ordem
        from sem_telefone s, pos_cliente pc
      union all
      select v_telefone, pc.pos from pos_cliente pc
    )
    update crm_colunas c
       set ordem = n.ordem
      from nova n
     where c.id = n.id and c.ordem is distinct from n.ordem;

    v_alteradas := v_alteradas + 1;
  end loop;
  raise notice 'Escritórios com a ordem conferida: %', v_alteradas;
end $$;

notify pgrst, 'reload schema';
