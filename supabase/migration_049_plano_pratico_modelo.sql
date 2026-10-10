-- ════════════════════════════════════════════════════════════════
-- MIGRATION 049 — Plano Prático padrão editável pelo prolu_admin (Passo 3A)
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
-- Idempotente (pode rodar de novo).
--
-- Antes: o conteúdo padrão (3 tags + 11 ações) era fixo no front
-- (PlanoPratico.jsx) e gravado na PRIMEIRA ABERTURA da tela.
-- Agora:
--   plano_modelo_tags / plano_modelo_acoes — o modelo (só prolu_admin)
--   plano_modelo_meta                       — quando/quem salvou; backfill
--   copiar_plano_modelo(empresa)            — copia o modelo para um escritório
--   trigger AFTER INSERT em empresas        — cópia na CRIAÇÃO do escritório,
--                                             na mesma transação (convidado não
--                                             cria escritório = não gera cópia)
--   admin_plano_modelo() / admin_salvar_plano_modelo() — tela do admin
--   backfill (uma vez só)                   — escritórios existentes sem
--                                             nenhuma tag nem ação recebem a
--                                             cópia do padrão de hoje
-- "Copiar, não linkar": editar o modelo nunca toca nas cópias existentes.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Tabelas do modelo ─────────
-- espelham plano_tags (nome, cor) e plano_acoes (texto, status, ordem, tag).
-- prazo e responsável são do escritório (datas/pessoas reais): fora do modelo.
create table if not exists plano_modelo_tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#CBE921',
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists plano_modelo_acoes (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid references plano_modelo_tags(id) on delete set null,
  texto text not null default '',
  status text not null default 'pend' check (status in ('pend', 'prog', 'done')),
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

-- uma linha só (id = 1)
create table if not exists plano_modelo_meta (
  id int primary key default 1 check (id = 1),
  salvo_em timestamptz,
  salvo_por uuid references usuarios(id) on delete set null,
  backfill_em timestamptz,
  backfill_qtd int
);
insert into plano_modelo_meta (id) values (1) on conflict (id) do nothing;

alter table plano_modelo_tags enable row level security;
alter table plano_modelo_acoes enable row level security;
alter table plano_modelo_meta enable row level security;

drop policy if exists "prolu_admin gerencia modelo" on plano_modelo_tags;
create policy "prolu_admin gerencia modelo" on plano_modelo_tags
  for all using (auth_is_prolu_admin()) with check (auth_is_prolu_admin());
drop policy if exists "prolu_admin gerencia modelo" on plano_modelo_acoes;
create policy "prolu_admin gerencia modelo" on plano_modelo_acoes
  for all using (auth_is_prolu_admin()) with check (auth_is_prolu_admin());
drop policy if exists "prolu_admin le meta" on plano_modelo_meta;
create policy "prolu_admin le meta" on plano_modelo_meta
  for select using (auth_is_prolu_admin());

-- ───────── 2. Semente: o padrão de hoje, só com o modelo vazio ─────────
do $$
declare
  v_estrutura uuid;
  v_posic uuid;
  v_metas uuid;
begin
  if exists (select 1 from plano_modelo_tags) or exists (select 1 from plano_modelo_acoes) then
    raise notice 'Modelo já tem conteúdo — semente não aplicada';
    return;
  end if;

  insert into plano_modelo_tags (nome, cor, ordem) values ('Estrutura comercial', '#3a6ea5', 0) returning id into v_estrutura;
  insert into plano_modelo_tags (nome, cor, ordem) values ('Posicionamento', '#8050a0', 1) returning id into v_posic;
  insert into plano_modelo_tags (nome, cor, ordem) values ('Metas e indicadores', '#4CAF82', 2) returning id into v_metas;

  insert into plano_modelo_acoes (tag_id, texto, status, ordem) values
    (v_estrutura, 'Começar a usar o CRM para registrar todo pedido de orçamento', 'pend', 0),
    (v_estrutura, 'Criar rotina de atualizar o CRM uma vez por semana', 'pend', 1),
    (v_estrutura, 'Definir o Processo de Atendimento, do primeiro contato à proposta', 'prog', 2),
    (v_estrutura, 'Elaborar apresentação para usar na primeira reunião com o cliente', 'pend', 3),
    (v_posic, 'Definir o Perfil de Cliente Ideal do escritório', 'pend', 4),
    (v_posic, 'Produzir conteúdos focados no Cliente Ideal definido', 'pend', 5),
    (v_posic, 'Criar formulário de qualificação para o Instagram', 'pend', 6),
    (v_metas, 'Definir metas de faturamento e número de projetos fechados', 'pend', 7),
    (v_metas, 'Revisar indicadores de desempenho a cada trimestre', 'pend', 8),
    (v_metas, 'Estudar precificação por horas e definir valor da hora', 'pend', 9),
    (v_estrutura, 'Elaborar proposta usando o Modelo Prolu', 'pend', 10);
end $$;

-- ───────── 3. Cópia do modelo para um escritório ─────────
-- Não faz nada se o escritório já tiver alguma tag ou ação (nunca duplica).
-- Modelo vazio = escritório sem conteúdo, sem erro. Grava como dono da função
-- (ignora RLS): o escritório recebe a cópia mesmo no Starter (vitrine).
-- Tags não têm coluna de ordem em plano_tags (a tela ordena por created_at):
-- a ordem do modelo vira created_at crescente (+1 ms por posição).
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
  if exists (select 1 from plano_tags where empresa_id = p_empresa_id)
     or exists (select 1 from plano_acoes where empresa_id = p_empresa_id) then
    return 0;
  end if;

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
-- só o trigger e o SQL Editor chamam: nenhum papel da API executa
revoke all on function copiar_plano_modelo(uuid) from public, anon, authenticated;

-- ───────── 4. Cópia na criação do escritório ─────────
-- Mesma transação do insert em empresas (cadastro pelo Onboarding). Qualquer
-- erro na cópia vira só um aviso: a criação do escritório nunca falha por ela.
create or replace function empresas_copia_plano_modelo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform copiar_plano_modelo(new.id);
  exception when others then
    raise warning 'copiar_plano_modelo(%) falhou: %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists empresas_copia_plano_modelo on empresas;
create trigger empresas_copia_plano_modelo after insert on empresas
  for each row execute function empresas_copia_plano_modelo();

-- ───────── 5. Backfill (roda uma vez só) ─────────
-- Escritórios existentes SEM nenhuma tag nem ação recebem a cópia do padrão de
-- hoje (o modelo acabou de ser semeado com ele). Marcado em plano_modelo_meta:
-- rodar a migration de novo não repete — senão um escritório que apagou tudo
-- de propósito seria preenchido de novo, e já com o modelo editado.
do $$
declare
  e record;
  v_qtd int := 0;
begin
  if (select backfill_em from plano_modelo_meta where id = 1) is not null then
    raise notice 'Backfill já feito em % (% escritórios) — nada a fazer',
      (select backfill_em from plano_modelo_meta where id = 1),
      (select backfill_qtd from plano_modelo_meta where id = 1);
    return;
  end if;

  for e in
    select emp.id from empresas emp
     where not exists (select 1 from plano_tags pt where pt.empresa_id = emp.id)
       and not exists (select 1 from plano_acoes pa where pa.empresa_id = emp.id)
  loop
    if copiar_plano_modelo(e.id) > 0 then v_qtd := v_qtd + 1; end if;
  end loop;

  update plano_modelo_meta set backfill_em = now(), backfill_qtd = v_qtd where id = 1;
  raise notice 'Backfill: % escritórios receberam o Plano Prático padrão', v_qtd;
end $$;

-- ───────── 6. RPCs da tela do admin ─────────
-- leitura: modelo + quando/quem salvou + quantos escritórios existem
create or replace function admin_plano_modelo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode ver o modelo.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'cor', cor) order by ordem, created_at, id)
                        from plano_modelo_tags), '[]'::jsonb),
    'acoes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'tag_id', tag_id, 'texto', texto, 'status', status) order by ordem, created_at, id)
                         from plano_modelo_acoes), '[]'::jsonb),
    'salvo_em', (select salvo_em from plano_modelo_meta where id = 1),
    'salvo_por', (select u.nome from plano_modelo_meta m join usuarios u on u.id = m.salvo_por where m.id = 1),
    -- sem contar o escritório "casa" da Prolu
    'escritorios', (select count(*) from empresas
                     where id is distinct from (select empresa_id from usuarios where auth_id = auth.uid()))
  );
end $$;
revoke all on function admin_plano_modelo() from public, anon;
grant execute on function admin_plano_modelo() to authenticated;

-- gravação: substitui o modelo inteiro numa transação (Salvar explícito).
-- p_tags:  [{ chave, nome, cor }]          na ordem desejada
-- p_acoes: [{ texto, status, tag_chave }]  na ordem desejada; tag_chave = chave
--          de uma tag de p_tags (ou null = sem tag)
create or replace function admin_salvar_plano_modelo(p_tags jsonb, p_acoes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_mapa jsonb := '{}'::jsonb;
  v_nova uuid;
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode alterar o modelo.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_tags, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_acoes, '[]'::jsonb)) <> 'array' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) x where trim(coalesce(x->>'nome', '')) = '') then
    raise exception 'Toda tag precisa de nome.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_acoes, '[]'::jsonb)) x
              where coalesce(x->>'status', 'pend') not in ('pend', 'prog', 'done')) then
    raise exception 'Status de ação inválido.' using errcode = '22023';
  end if;

  delete from plano_modelo_acoes;
  delete from plano_modelo_tags;

  for t in select x, ord from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) with ordinality as e(x, ord) loop
    insert into plano_modelo_tags (nome, cor, ordem)
    values (trim(t.x->>'nome'), coalesce(nullif(t.x->>'cor', ''), '#CBE921'), t.ord - 1)
    returning id into v_nova;
    v_mapa := v_mapa || jsonb_build_object(coalesce(t.x->>'chave', t.ord::text), v_nova);
  end loop;

  insert into plano_modelo_acoes (tag_id, texto, status, ordem)
  select (v_mapa->>(x->>'tag_chave'))::uuid, coalesce(x->>'texto', ''), coalesce(x->>'status', 'pend'), ord - 1
    from jsonb_array_elements(coalesce(p_acoes, '[]'::jsonb)) with ordinality as e(x, ord);

  update plano_modelo_meta
     set salvo_em = now(), salvo_por = (select id from usuarios where auth_id = auth.uid())
   where id = 1;
end $$;
revoke all on function admin_salvar_plano_modelo(jsonb, jsonb) from public, anon;
grant execute on function admin_salvar_plano_modelo(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
