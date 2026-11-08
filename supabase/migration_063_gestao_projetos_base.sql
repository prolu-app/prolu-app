-- ════════════════════════════════════════════════════════════════
-- MIGRATION 063 — Gestão de Projetos: Base (Fase 1)
-- Rodar no SQL Editor do Supabase DEPOIS da 061 e da 062 (reusa os helpers
-- fin_pode_ler / fin_pode_gravar). Idempotente.
-- Testes: diagnosticos/testar_migration_063.sql.
-- Desfazer: diagnosticos/desfazer_migration_063.sql.
--
-- TABELAS
--   projetos            — cabeçalho do projeto (sem R$)
--   projeto_financeiro  — 1:1 com o projeto; R$ só do master (regra da 062).
--                         Fica FORA de fn_fechamentos (o fechamento comercial
--                         continua vindo só do CRM).
--   projeto_itens       — árvore Etapa (1) > Tarefa (2) > Subtarefa (3)
--
-- QUEM VÊ
--   master            → tudo do escritório
--   gestor e comum    → projetos e itens do escritório, menos 'arquivado';
--                       nunca projeto_financeiro
--   prolu_admin       → lê qualquer escritório; grava só no dele
-- QUEM GRAVA (regra revisada; rodar este arquivo de novo aplica a regra)
--   projeto_financeiro → só master
--   projeto            → master e gestor criam, editam e excluem; nome_oficial,
--                        arquivar e vínculo com CRM/precificação (origem,
--                        crm_linha_id, precificacao_id) só o master (gatilho
--                        projetos_permissao). Comum não grava projeto.
--   etapa, tarefa e subtarefa → qualquer papel do escritório cria, renomeia,
--                        reordena, edita e exclui (fora de projeto arquivado,
--                        que é só do master)
-- PLANO
--   recurso gestao_projetos (Business+) em empresa_libera(): policies
--   RESTRICTIVE só na escrita; a leitura segue liberada (vitrine).
-- "Atrasado" NÃO é gravado: o app calcula (prazo < hoje em
--   America/Sao_Paulo e status <> 'concluido').
-- Dados do CRM mostrados no projeto são COPIADOS para cá (fase 2); a tela de
--   projeto nunca lê crm_linhas. crm_linha_id/precificacao_id ficam sem uso.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Plano: recurso gestao_projetos (Business) ─────────
-- mesma função da migration_055, com o recurso novo
create or replace function empresa_libera(p_empresa_id uuid, p_recurso text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.status_conta = 'ativa'
       and plano_nivel(e.plano) >= plano_nivel(case p_recurso
             when 'painel_comercial'     then 'pro'
             when 'indicadores'          then 'pro'
             when 'selo_removivel'       then 'pro'
             when 'equipe_convites'      then 'business'
             when 'base_propria'         then 'business'
             when 'kb_painel'            then 'business'
             when 'gestao_projetos'      then 'business'
             when 'ferramentas_mentoria' then 'mentoria'
           end)
      from empresas e
     where e.id = p_empresa_id
  ), false)
$$;
revoke all on function empresa_libera(uuid, text) from public, anon;
grant execute on function empresa_libera(uuid, text) to authenticated, service_role;

-- ───────── 2. Tabelas ─────────
create table if not exists projetos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  nome_oficial text,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text,
  cidade text,
  tags text[] not null default '{}',
  origem text not null default 'avulso',
  crm_linha_id uuid references crm_linhas(id) on delete set null,
  precificacao_id uuid references precificacoes(id) on delete set null,
  situacao text not null default 'ativo',
  data_inicio date,
  prazo_final date,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projetos drop constraint if exists projetos_nome_valido;
alter table projetos add constraint projetos_nome_valido
  check (btrim(nome) <> '' and char_length(nome) <= 200);
alter table projetos drop constraint if exists projetos_textos_tamanho;
alter table projetos add constraint projetos_textos_tamanho check (
  coalesce(char_length(nome_oficial), 0) <= 200
  and coalesce(char_length(cliente_nome), 0) <= 200
  and coalesce(char_length(cidade), 0) <= 120
  and coalesce(array_length(tags, 1), 0) <= 20
);
alter table projetos drop constraint if exists projetos_origem_check;
alter table projetos add constraint projetos_origem_check check (origem in ('crm', 'avulso'));
alter table projetos drop constraint if exists projetos_situacao_check;
alter table projetos add constraint projetos_situacao_check
  check (situacao in ('ativo', 'pausado', 'concluido', 'arquivado'));
alter table projetos drop constraint if exists projetos_datas_validas;
alter table projetos add constraint projetos_datas_validas
  check (prazo_final is null or data_inicio is null or prazo_final >= data_inicio);

-- nome oficial: único por escritório quando preenchido (sem diferenciar maiúsculas)
create unique index if not exists projetos_nome_oficial_unico
  on projetos (empresa_id, lower(nome_oficial)) where nome_oficial is not null;
-- um projeto por negócio do CRM (fase 2)
create unique index if not exists projetos_crm_linha_unico
  on projetos (crm_linha_id) where crm_linha_id is not null;
create index if not exists projetos_empresa_situacao_idx on projetos (empresa_id, situacao);

create table if not exists projeto_financeiro (
  projeto_id uuid primary key references projetos(id) on delete cascade,
  valor_fechado numeric(14, 2),
  data_fechamento date,
  valor_hora_ref numeric(12, 2),
  margem_pct numeric(6, 2),
  nf_pct numeric(6, 2),
  nf_ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table projeto_financeiro drop constraint if exists projeto_financeiro_valores_validos;
alter table projeto_financeiro add constraint projeto_financeiro_valores_validos check (
  coalesce(valor_fechado, 0) >= 0
  and coalesce(valor_hora_ref, 0) >= 0
  and coalesce(margem_pct, 0) between 0 and 1000
  and coalesce(nf_pct, 0) between 0 and 100
);

create table if not exists projeto_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  projeto_id uuid not null references projetos(id) on delete cascade,
  parent_id uuid references projeto_itens(id) on delete cascade,
  nivel smallint not null default 1,
  nome text not null,
  ordem integer not null default 0,
  data_inicio date,
  prazo date,
  responsavel_id uuid references usuarios(id) on delete set null,
  status text not null default 'a_fazer',
  concluido_em timestamptz,
  horas_estimadas numeric(8, 2),
  origem_item_id uuid,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projeto_itens drop constraint if exists projeto_itens_nome_valido;
alter table projeto_itens add constraint projeto_itens_nome_valido
  check (btrim(nome) <> '' and char_length(nome) <= 300);
alter table projeto_itens drop constraint if exists projeto_itens_nivel_check;
alter table projeto_itens add constraint projeto_itens_nivel_check check (
  nivel between 1 and 3 and (nivel = 1) = (parent_id is null)
);
alter table projeto_itens drop constraint if exists projeto_itens_status_check;
alter table projeto_itens add constraint projeto_itens_status_check
  check (status in ('a_fazer', 'fazendo', 'concluido'));
alter table projeto_itens drop constraint if exists projeto_itens_horas_validas;
alter table projeto_itens add constraint projeto_itens_horas_validas
  check (horas_estimadas is null or horas_estimadas between 0 and 100000);
alter table projeto_itens drop constraint if exists projeto_itens_datas_validas;
alter table projeto_itens add constraint projeto_itens_datas_validas
  check (prazo is null or data_inicio is null or prazo >= data_inicio);

create index if not exists projeto_itens_arvore_idx on projeto_itens (projeto_id, parent_id, ordem);
create index if not exists projeto_itens_prazo_aberto_idx on projeto_itens (empresa_id, prazo)
  where status <> 'concluido';
create index if not exists projeto_itens_responsavel_aberto_idx on projeto_itens (empresa_id, responsavel_id)
  where status <> 'concluido';

-- ───────── 3. Helpers (DEFINER: leem o projeto sem depender da RLS) ─────────
create or replace function proj_empresa(p_projeto_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.empresa_id from projetos p where p.id = p_projeto_id
$$;

-- Ver um projeto: prolu_admin em qualquer escritório; no próprio escritório,
-- o master vê tudo e gestor/comum veem o que não está arquivado.
create or replace function proj_pode_ver(p_empresa_id uuid, p_situacao text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth_is_prolu_admin(), false)
      or (p_empresa_id is not null
          and p_empresa_id = auth_empresa_id()
          and (coalesce(auth_is_empresa_master(), false) or p_situacao is distinct from 'arquivado'))
$$;

-- Itens: mesma regra de leitura do projeto
create or replace function proj_itens_pode_ver(p_projeto_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select proj_pode_ver(p.empresa_id, p.situacao) from projetos p where p.id = p_projeto_id), false)
$$;

-- Gravar projeto: master e gestor do próprio escritório; o gestor não mexe em
-- arquivado nem arquiva (na linha nova, 'arquivado' reprova). O que só o
-- master altera dentro do projeto fica no gatilho projetos_permissao.
create or replace function proj_pode_gravar(p_empresa_id uuid, p_situacao text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_empresa_id is not null
     and p_empresa_id = auth_empresa_id()
     and (coalesce(auth_is_empresa_master(), false)
          or (coalesce(auth_is_gestor_ou_superior(), false) and p_situacao is distinct from 'arquivado'))
$$;

-- Gravar itens: qualquer papel do próprio escritório (etapa inclusive);
-- gestor/comum não mexem em projeto arquivado.
create or replace function proj_itens_pode_gravar(p_projeto_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.empresa_id = auth_empresa_id()
       and (coalesce(auth_is_empresa_master(), false) or p.situacao <> 'arquivado')
      from projetos p
     where p.id = p_projeto_id
  ), false)
$$;

do $grants$
declare
  f text;
begin
  foreach f in array array['proj_empresa(uuid)', 'proj_pode_ver(uuid, text)', 'proj_pode_gravar(uuid, text)',
                           'proj_itens_pode_ver(uuid)', 'proj_itens_pode_gravar(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $grants$;

-- ───────── 4. Gatilhos de projetos e projeto_financeiro ─────────
-- Normaliza textos, força created_by e confere que cliente, negócio do CRM e
-- precificação vinculados são do mesmo escritório (DEFINER: vê tudo).
create or replace function projetos_antes_gravar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ator uuid;
begin
  new.nome := btrim(new.nome);
  new.nome_oficial := nullif(btrim(coalesce(new.nome_oficial, '')), '');
  new.cliente_nome := nullif(btrim(coalesce(new.cliente_nome, '')), '');
  new.cidade := nullif(btrim(coalesce(new.cidade, '')), '');
  new.tags := coalesce((
    select array_agg(t order by primeira)
      from (select btrim(x) as t, min(ord) as primeira
              from unnest(coalesce(new.tags, '{}')) with ordinality as u(x, ord)
             where btrim(x) <> ''
             group by btrim(x)) s
  ), '{}');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      select u.id into v_ator from usuarios u where u.auth_id = auth.uid();
      new.created_by := v_ator;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.cliente_id is not null
     and not exists (select 1 from clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id) then
    raise exception 'Cliente de outro escritório.' using errcode = '42501';
  end if;
  if new.crm_linha_id is not null
     and not exists (select 1 from crm_linhas l where l.id = new.crm_linha_id and l.empresa_id = new.empresa_id) then
    raise exception 'Negócio do CRM de outro escritório.' using errcode = '42501';
  end if;
  if new.precificacao_id is not null
     and not exists (select 1 from precificacoes p where p.id = new.precificacao_id and p.empresa_id = new.empresa_id) then
    raise exception 'Precificação de outro escritório.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists projetos_antes_gravar on projetos;
create trigger projetos_antes_gravar before insert or update on projetos
  for each row execute function projetos_antes_gravar();

-- O que só o master grava no projeto (só requisições da API). INVOKER de
-- propósito: current_user diz quem chama (mesmo critério da 061); service_role
-- e SQL Editor passam. Roda depois de projetos_antes_gravar (ordem alfabética),
-- então compara os textos já normalizados. Comum nem chega aqui: a RLS barra.
create or replace function projetos_permissao()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or coalesce(auth_is_empresa_master(), false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.nome_oficial is not null then
      raise exception 'Só o master define o nome oficial.' using errcode = '42501';
    end if;
    if new.origem <> 'avulso' or new.crm_linha_id is not null or new.precificacao_id is not null then
      raise exception 'Só o master cria projeto a partir do CRM ou da precificação.' using errcode = '42501';
    end if;
  else
    if new.nome_oficial is distinct from old.nome_oficial then
      raise exception 'Só o master altera o nome oficial.' using errcode = '42501';
    end if;
    if new.origem is distinct from old.origem
       or new.crm_linha_id is distinct from old.crm_linha_id
       or new.precificacao_id is distinct from old.precificacao_id then
      raise exception 'Só o master altera o vínculo com o CRM ou a precificação.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists projetos_permissao on projetos;
create trigger projetos_permissao before insert or update on projetos
  for each row execute function projetos_permissao();

create or replace function projeto_financeiro_antes_gravar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    if new.projeto_id is distinct from old.projeto_id then
      raise exception 'O financeiro não muda de projeto.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists projeto_financeiro_antes_gravar on projeto_financeiro;
create trigger projeto_financeiro_antes_gravar before insert or update on projeto_financeiro
  for each row execute function projeto_financeiro_antes_gravar();

-- ───────── 5. Gatilhos de projeto_itens ─────────
-- 5.1 Integridade (vale para todos, inclusive service role e SQL Editor).
--     Roda antes da permissão (gatilhos BEFORE disparam em ordem alfabética).
create or replace function projeto_itens_integridade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_pai record;
  v_ator uuid;
begin
  if tg_op = 'UPDATE' then
    if new.projeto_id is distinct from old.projeto_id or new.parent_id is distinct from old.parent_id then
      raise exception 'Um item não muda de projeto nem de etapa/tarefa.' using errcode = '42501';
    end if;
  end if;

  -- escritório: sempre o do projeto (ignora o enviado)
  select p.empresa_id into v_empresa from projetos p where p.id = new.projeto_id;
  if v_empresa is null then
    raise exception 'Projeto não encontrado.' using errcode = '23503';
  end if;
  new.empresa_id := v_empresa;

  -- nível: 1 sem pai; senão nível do pai + 1, no mesmo projeto, até 3
  if new.parent_id is null then
    new.nivel := 1;
  else
    select i.projeto_id, i.nivel into v_pai from projeto_itens i where i.id = new.parent_id;
    if v_pai.projeto_id is null then
      raise exception 'Item pai não encontrado.' using errcode = '23503';
    end if;
    if v_pai.projeto_id <> new.projeto_id then
      raise exception 'O item pai é de outro projeto.' using errcode = '23514';
    end if;
    if v_pai.nivel >= 3 then
      raise exception 'Subtarefa não tem itens abaixo dela (máximo de 3 níveis).' using errcode = '23514';
    end if;
    new.nivel := v_pai.nivel + 1;
  end if;

  -- responsável: pessoa do mesmo escritório
  if new.responsavel_id is not null
     and not exists (select 1 from usuarios u where u.id = new.responsavel_id and u.empresa_id = v_empresa) then
    raise exception 'O responsável precisa ser da equipe do escritório.' using errcode = '23514';
  end if;

  -- conclusão: data automática
  if new.status = 'concluido' then
    if tg_op = 'UPDATE' and old.status = 'concluido' then
      new.concluido_em := old.concluido_em;
    else
      new.concluido_em := now();
    end if;
  else
    new.concluido_em := null;
  end if;

  new.nome := btrim(new.nome);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      select u.id into v_ator from usuarios u where u.auth_id = auth.uid();
      new.created_by := v_ator;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- 5.2 Sem regra extra por nível: etapa, tarefa e subtarefa seguem a mesma
--     RLS. A versão anterior desta migration limitava a etapa para gestor e
--     comum (gatilho projeto_itens_2_permissao); ao rodar de novo, sai.
drop trigger if exists projeto_itens_2_permissao on projeto_itens;
drop function if exists projeto_itens_permissao();

drop trigger if exists projeto_itens_1_integridade on projeto_itens;
create trigger projeto_itens_1_integridade before insert or update on projeto_itens
  for each row execute function projeto_itens_integridade();

-- ───────── 6. RLS ─────────
alter table projetos enable row level security;
alter table projeto_financeiro enable row level security;
alter table projeto_itens enable row level security;

-- projetos: ver (regra do arquivado) / gravar master e gestor do próprio
-- escritório (o que só o master altera: gatilho projetos_permissao)
drop policy if exists "projetos: le" on projetos;
create policy "projetos: le" on projetos for select to authenticated
  using (proj_pode_ver(empresa_id, situacao));
drop policy if exists "projetos: master grava" on projetos;        -- versão anterior
drop policy if exists "projetos: master e gestor gravam" on projetos;
create policy "projetos: master e gestor gravam" on projetos for all to authenticated
  using (proj_pode_gravar(empresa_id, situacao)) with check (proj_pode_gravar(empresa_id, situacao));

-- projeto_financeiro: regra da 062 (master lê/grava no próprio; prolu_admin lê todos)
drop policy if exists "financeiro: le" on projeto_financeiro;
create policy "financeiro: le" on projeto_financeiro for select to authenticated
  using (fin_pode_ler(proj_empresa(projeto_id)));
drop policy if exists "financeiro: grava" on projeto_financeiro;
create policy "financeiro: grava" on projeto_financeiro for all to authenticated
  using (fin_pode_gravar(proj_empresa(projeto_id))) with check (fin_pode_gravar(proj_empresa(projeto_id)));

-- projeto_itens: ver como o projeto / gravar qualquer papel do escritório
-- (etapa inclusive)
drop policy if exists "projeto_itens: le" on projeto_itens;
create policy "projeto_itens: le" on projeto_itens for select to authenticated
  using (proj_itens_pode_ver(projeto_id));
drop policy if exists "projeto_itens: equipe grava" on projeto_itens;
create policy "projeto_itens: equipe grava" on projeto_itens for all to authenticated
  using (proj_itens_pode_gravar(projeto_id)) with check (proj_itens_pode_gravar(projeto_id));

-- Plano: escrita só com gestao_projetos (Business+); leitura segue (vitrine)
do $plano$
declare
  r record;
begin
  for r in select * from (values
    ('projetos',           'empresa_id'),
    ('projeto_financeiro', 'proj_empresa(projeto_id)'),
    ('projeto_itens',      'proj_empresa(projeto_id)')
  ) as v(tabela, empresa) loop
    execute format('drop policy if exists "plano libera insert" on %I', r.tabela);
    execute format('drop policy if exists "plano libera update" on %I', r.tabela);
    execute format('drop policy if exists "plano libera delete" on %I', r.tabela);
    execute format('create policy "plano libera insert" on %I as restrictive for insert to authenticated
                      with check (empresa_libera(%s, %L))', r.tabela, r.empresa, 'gestao_projetos');
    execute format('create policy "plano libera update" on %I as restrictive for update to authenticated
                      using (empresa_libera(%s, %L)) with check (empresa_libera(%s, %L))',
                   r.tabela, r.empresa, 'gestao_projetos', r.empresa, 'gestao_projetos');
    execute format('create policy "plano libera delete" on %I as restrictive for delete to authenticated
                      using (empresa_libera(%s, %L))', r.tabela, r.empresa, 'gestao_projetos');
  end loop;
end $plano$;

-- ───────── 7. Grants ─────────
-- anon não usa nada disto; TRUNCATE ignora RLS
revoke all on projetos, projeto_financeiro, projeto_itens from anon;
revoke truncate, trigger, references on projetos, projeto_financeiro, projeto_itens from authenticated;
grant select, insert, update, delete on projetos, projeto_financeiro, projeto_itens to authenticated;

notify pgrst, 'reload schema';
