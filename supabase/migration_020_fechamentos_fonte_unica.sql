-- ════════════════════════════════════════════════════════════════
-- MIGRATION 020 — Fonte única de "fechamentos" (projetos fechados + valor)
-- Rodar no SQL Editor do Supabase.
--
-- Regra canônica:
--   fechado  = coluna de slug 'status' = 'Fechado'
--   período  = coluna de slug 'data_fechamento' entre data_inicio e data_fim (inclusive)
--   default  = 01/01 do ano corrente até hoje (fuso America/Sao_Paulo)
--   valor    = coluna de slug 'valor' (não numérico/vazio conta como 0)
--
-- O CRM guarda tudo em crm_linhas.valores (jsonb { coluna_id: valor }), e cada
-- empresa tem ids de coluna próprios — o mapeamento slug → id é feito aqui,
-- por empresa, a partir de crm_colunas.opcoes->>'slug'.
-- ════════════════════════════════════════════════════════════════

-- 1. Helpers de leitura tolerante (dado de jsonb pode estar sujo)
create or replace function crm_try_date(v jsonb) returns date
language plpgsql immutable as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' then return null; end if;
  return left(v #>> '{}', 10)::date;
exception when others then
  return null;
end $$;

create or replace function crm_try_numeric(v jsonb) returns numeric
language plpgsql immutable as $$
begin
  if v is null then return 0; end if;
  if jsonb_typeof(v) in ('number', 'string') and btrim(v #>> '{}') <> '' then
    return (v #>> '{}')::numeric;
  end if;
  return 0;
exception when others then
  return 0;
end $$;

-- 2. Base (sem checagem de acesso) — NÃO exposta ao app; usada pelo wrapper
--    e pelo SQL Editor (diagnóstico/testes).
create or replace function _fechamentos_base(
  p_empresa_id  uuid,
  p_data_inicio date,
  p_data_fim    date
) returns table (linha_id uuid, empresa_id uuid, data_fechamento date, valor numeric)
language sql stable as $$
  with periodo as (
    select coalesce(p_data_inicio, date_trunc('year', now() at time zone 'America/Sao_Paulo')::date) as ini,
           coalesce(p_data_fim,    (now() at time zone 'America/Sao_Paulo')::date)                  as fim
  ),
  cols as (
    select c.empresa_id,
           max(case when c.opcoes->>'slug' = 'status'          then c.id::text end) as status_id,
           max(case when c.opcoes->>'slug' = 'data_fechamento' then c.id::text end) as data_fech_id,
           max(case when c.opcoes->>'slug' = 'valor'           then c.id::text end) as valor_id
    from crm_colunas c
    where jsonb_typeof(c.opcoes) = 'object'
    group by c.empresa_id
  )
  select l.id,
         l.empresa_id,
         crm_try_date(l.valores -> k.data_fech_id),
         crm_try_numeric(l.valores -> k.valor_id)
  from crm_linhas l
  join cols k on k.empresa_id = l.empresa_id
  cross join periodo p
  where (p_empresa_id is null or l.empresa_id = p_empresa_id)
    and l.valores ->> k.status_id = 'Fechado'
    and crm_try_date(l.valores -> k.data_fech_id) between p.ini and p.fim
$$;

revoke all on function _fechamentos_base(uuid, date, date) from public, anon, authenticated;

-- 3. Linha a linha (para telas que agrupam/filtram: Dashboard, Indicadores por trimestre)
--    Acesso: prolu_admin vê qualquer empresa (inclusive p_empresa_id = null → todas);
--    demais usuários só a própria empresa.
create or replace function fn_fechamentos(
  p_empresa_id  uuid default null,
  p_data_inicio date default null,
  p_data_fim    date default null
) returns table (linha_id uuid, empresa_id uuid, data_fechamento date, valor numeric)
language sql stable security definer set search_path = public as $$
  select f.*
  from _fechamentos_base(p_empresa_id, p_data_inicio, p_data_fim) f
  where auth_is_prolu_admin() or f.empresa_id = auth_empresa_id()
$$;

-- 4. Agregado (para cards: CRM YTD, Início, Painel Admin)
--    Empresas sem fechamento no período não retornam linha (tratar como 0 no app).
create or replace function fn_fechamentos_periodo(
  p_empresa_id  uuid default null,
  p_data_inicio date default null,
  p_data_fim    date default null
) returns table (empresa_id uuid, qtd_fechados bigint, valor_fechado numeric)
language sql stable security definer set search_path = public as $$
  select f.empresa_id, count(*), coalesce(sum(f.valor), 0)
  from fn_fechamentos(p_empresa_id, p_data_inicio, p_data_fim) f
  group by f.empresa_id
$$;

revoke all on function fn_fechamentos(uuid, date, date)         from public, anon;
revoke all on function fn_fechamentos_periodo(uuid, date, date) from public, anon;
grant execute on function fn_fechamentos(uuid, date, date)         to authenticated;
grant execute on function fn_fechamentos_periodo(uuid, date, date) to authenticated;
