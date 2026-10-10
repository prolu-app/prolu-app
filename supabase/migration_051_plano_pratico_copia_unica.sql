-- ════════════════════════════════════════════════════════════════
-- MIGRATION 051 — Plano Prático: cópia do padrão uma única vez por escritório
-- Rodar no SQL Editor do Supabase. Idempotente (pode rodar de novo).
--
-- Causa da duplicação no escritório de teste (ver
-- supabase/diagnosticos/diagnostico_plano_pratico_duplicado.sql): o front
-- ANTERIOR ao 3A criava o padrão na primeira abertura da tela quando o
-- escritório não tinha ações; no modo dev (npm run dev) o React StrictMode
-- roda esse carregamento duas vezes em paralelo e as duas execuções gravaram
-- (mesmo mecanismo das colunas duplicadas do CRM, migration_047). O front
-- atual não cria mais nada; o único caminho é copiar_plano_modelo().
--
-- Esta migration deixa esse caminho à prova de repetição e de concorrência:
--   empresas.plano_pratico_inicializado_em — marcada NA MESMA TRANSAÇÃO da
--     cópia. A função só copia se conseguir marcar (update ... where null):
--     uma segunda execução concorrente espera o lock da linha e encontra a
--     marca preenchida. Com qualquer tag ou ação já gravada, também não copia.
--   escritórios que já têm conteúdo recebem a marca agora (nunca serão
--     preenchidos de novo, mesmo que apaguem tudo).
--   índice único de tag por escritório (nome, sem diferenciar maiúsculas) —
--     criado só se não houver repetição nos dados; senão, só um aviso.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Marca de inicialização ─────────
alter table empresas add column if not exists plano_pratico_inicializado_em timestamptz;

-- escritórios que já têm conteúdo: marca com a data do conteúdo mais antigo
update empresas e
   set plano_pratico_inicializado_em = coalesce(
         least((select min(created_at) from plano_tags t where t.empresa_id = e.id),
               (select min(created_at) from plano_acoes a where a.empresa_id = e.id)),
         now())
 where e.plano_pratico_inicializado_em is null
   and (exists (select 1 from plano_tags t where t.empresa_id = e.id)
        or exists (select 1 from plano_acoes a where a.empresa_id = e.id));

-- ───────── 2. Cópia idempotente e segura contra concorrência ─────────
create or replace function copiar_plano_modelo(p_empresa_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_mapa jsonb := '{}'::jsonb;
  v_nova uuid;
  v_base timestamptz := clock_timestamp();
  v_qtd int;
begin
  if p_empresa_id is null then return 0; end if;

  -- já tem conteúdo: só garante a marca e sai
  if exists (select 1 from plano_tags where empresa_id = p_empresa_id)
     or exists (select 1 from plano_acoes where empresa_id = p_empresa_id) then
    update empresas set plano_pratico_inicializado_em = coalesce(plano_pratico_inicializado_em, now())
     where id = p_empresa_id;
    return 0;
  end if;

  -- marca primeiro (trava a linha do escritório): quem não conseguir marcar
  -- é porque outra execução já copiou ou está copiando
  update empresas set plano_pratico_inicializado_em = now()
   where id = p_empresa_id and plano_pratico_inicializado_em is null;
  if not found then return 0; end if;

  for t in select id, nome, cor, ordem from plano_modelo_tags order by ordem, created_at, id loop
    insert into plano_tags (empresa_id, nome, cor, created_at)
    values (p_empresa_id, t.nome, t.cor, v_base + make_interval(secs => t.ordem / 1000.0))
    returning id into v_nova;
    v_mapa := v_mapa || jsonb_build_object(t.id::text, v_nova);
  end loop;

  insert into plano_acoes (empresa_id, tag_id, texto, status, ordem)
  select p_empresa_id, (v_mapa->>a.tag_id::text)::uuid, a.texto, a.status,
         row_number() over (order by a.ordem, a.created_at, a.id) - 1
    from plano_modelo_acoes a;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;
revoke all on function copiar_plano_modelo(uuid) from public, anon, authenticated;

-- ───────── 3. Backfill com a mesma regra (seguro para rodar de novo) ─────────
-- Só escritórios nunca inicializados e sem nenhum conteúdo. Como a 049 já
-- fez o backfill e o passo 1 marcou todos os que têm conteúdo, aqui
-- normalmente não sobra nenhum.
do $$
declare
  e record;
  v_qtd int := 0;
begin
  for e in
    select id from empresas
     where plano_pratico_inicializado_em is null
       and not exists (select 1 from plano_tags t where t.empresa_id = empresas.id)
       and not exists (select 1 from plano_acoes a where a.empresa_id = empresas.id)
  loop
    if copiar_plano_modelo(e.id) > 0 then v_qtd := v_qtd + 1; end if;
  end loop;
  raise notice 'Backfill 051: % escritórios receberam o Plano Prático padrão', v_qtd;
end $$;

-- ───────── 4. Tag única por escritório (se os dados permitirem) ─────────
-- A exclusão de tag não conflita (apagar libera o nome). Criar tag com nome
-- repetido passa a ser recusado (o front mostra "Já existe uma tag…").
do $$
declare
  v_rep int;
begin
  select count(*) into v_rep from (
    select 1 from plano_tags group by empresa_id, lower(trim(nome)) having count(*) > 1
  ) x;
  if v_rep > 0 then
    raise notice 'Índice único de tag NÃO criado: % nomes repetidos em algum escritório. Limpe (diagnostico_plano_pratico_duplicado.sql) e rode esta migration de novo.', v_rep;
  else
    execute 'create unique index if not exists plano_tags_nome_unico on plano_tags (empresa_id, lower(trim(nome)))';
    raise notice 'Índice único de tag por escritório criado (ou já existia).';
  end if;
end $$;

notify pgrst, 'reload schema';
