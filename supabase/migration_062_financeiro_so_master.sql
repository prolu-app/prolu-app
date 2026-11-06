-- ════════════════════════════════════════════════════════════════
-- MIGRATION 062 — Dados financeiros só do master (Fase 0b, segurança)
-- Rodar no SQL Editor do Supabase DEPOIS da 061. Idempotente.
-- Testes: diagnosticos/testar_migration_062.sql.
-- Desfazer: diagnosticos/desfazer_migration_062.sql.
--
-- Problema: qualquer papel do escritório (inclusive comum) lia e gravava
-- CRM, precificações, modelos e indicadores pela API (só a tela escondia),
-- recebia o total vendido por fn_fechamentos, e as policies das
-- precificações tinham "OR auth_is_prolu_admin()" em ALL, deixando o
-- prolu_admin GRAVAR em qualquer escritório.
--
-- REGRA:
--   Ler   → master do escritório (o prolu_admin conta como master no
--           escritório dele) ou prolu_admin em qualquer escritório.
--   Gravar → só no próprio escritório, papel master ou prolu_admin.
--   Gestor e comum → nenhuma linha (nem leitura). Sem exceções: a Gestão de
--           Projetos COPIA para o projeto o que precisar do CRM.
--   Modelos da Prolu (is_prolu = true) → leem master e prolu_admin; só o
--           prolu_admin grava e só ele marca/desmarca is_prolu.
--   crm_fichas → só leitura; quem grava é a Edge Function (service role).
--   fn_fechamentos(_periodo) → linhas só para prolu_admin ou master do
--           escritório; gestor e comum recebem vazio, sem erro.
--
-- FICAM COMO ESTÃO: valor_hora_cenarios (já era só master desde a 053),
-- as policies RESTRICTIVE "plano libera …" dos indicadores, clientes.
--
-- As policies novas valem só para `authenticated` (anon não tem policy →
-- não vê nada). Os helpers são DEFINER: leem o pai sem depender da RLS dele.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Quem pode ler / gravar dados financeiros ─────────
create or replace function fin_pode_ler(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_is_prolu_admin(), false)
      or (p_empresa_id is not null
          and p_empresa_id = auth_empresa_id()
          and coalesce(auth_is_empresa_master(), false))
$$;

-- auth_empresa_id() só devolve o escritório com a conta ativa (045), e
-- auth_is_empresa_master() = master ou prolu_admin (001)
create or replace function fin_pode_gravar(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_empresa_id is not null
     and p_empresa_id = auth_empresa_id()
     and coalesce(auth_is_empresa_master(), false)
$$;

-- Modelos da Prolu: leem prolu_admin e master de escritório ativo
create or replace function fin_le_modelos_prolu()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_is_prolu_admin(), false)
      or (auth_empresa_id() is not null and coalesce(auth_is_empresa_master(), false))
$$;

-- ───────── 2. De qual escritório é o pai ─────────
create or replace function fin_empresa_da_precificacao(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.empresa_id from precificacoes p where p.id = p_id
$$;

create or replace function fin_empresa_da_prec_etapa(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.empresa_id
    from precificacao_etapas e
    join precificacoes p on p.id = e.precificacao_id
   where e.id = p_id
$$;

create or replace function fin_empresa_da_prec_tarefa(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.empresa_id
    from precificacao_tarefas t
    join precificacao_etapas e on e.id = t.etapa_id
    join precificacoes p on p.id = e.precificacao_id
   where t.id = p_id
$$;

create or replace function fin_empresa_da_linha(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select l.empresa_id from crm_linhas l where l.id = p_id
$$;

create or replace function fin_empresa_do_indicador(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select i.empresa_id from indicadores i where i.id = p_id
$$;

-- Modelos: a regra depende de is_prolu, então o helper decide direto
create or replace function fin_modelo_pode_ler(p_modelo_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when m.is_prolu then fin_le_modelos_prolu()
                else fin_pode_ler(m.empresa_id) end
      from modelos_precificacao m
     where m.id = p_modelo_id
  ), false)
$$;

create or replace function fin_modelo_pode_gravar(p_modelo_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when m.is_prolu then coalesce(auth_is_prolu_admin(), false)
                else fin_pode_gravar(m.empresa_id) end
      from modelos_precificacao m
     where m.id = p_modelo_id
  ), false)
$$;

create or replace function fin_modelo_da_etapa(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.modelo_id from modelo_etapas e where e.id = p_id
$$;

create or replace function fin_modelo_da_tarefa(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.modelo_id
    from modelo_tarefas t
    join modelo_etapas e on e.id = t.etapa_id
   where t.id = p_id
$$;

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'fin_pode_ler(uuid)', 'fin_pode_gravar(uuid)', 'fin_le_modelos_prolu()',
    'fin_empresa_da_precificacao(uuid)', 'fin_empresa_da_prec_etapa(uuid)',
    'fin_empresa_da_prec_tarefa(uuid)', 'fin_empresa_da_linha(uuid)',
    'fin_empresa_do_indicador(uuid)', 'fin_modelo_pode_ler(uuid)',
    'fin_modelo_pode_gravar(uuid)', 'fin_modelo_da_etapa(uuid)', 'fin_modelo_da_tarefa(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $grants$;

-- ───────── 3. Policies antigas (nomes reais do banco) ─────────
drop policy if exists "empresa gerencia suas colunas" on crm_colunas;
drop policy if exists "empresa vê suas colunas" on crm_colunas;
drop policy if exists "prolu_admin vê todas as colunas crm" on crm_colunas;

drop policy if exists "empresa gerencia suas linhas" on crm_linhas;
drop policy if exists "empresa vê suas linhas" on crm_linhas;
drop policy if exists "prolu_admin vê todas as linhas crm" on crm_linhas;

drop policy if exists "crm_fichas: le do proprio escritorio ou prolu_admin" on crm_fichas;

drop policy if exists "empresa vê comentários de suas oportunidades" on oportunidade_comentarios;

drop policy if exists "empresa ve precificacoes" on precificacoes;
drop policy if exists "empresa ve etapas" on precificacao_etapas;
drop policy if exists "empresa ve tarefas" on precificacao_tarefas;
drop policy if exists "empresa ve subtarefas" on precificacao_subtarefas;
drop policy if exists "empresa ve custos" on precificacao_custos_extras;
drop policy if exists "empresa gerencia etiquetas prec" on precificacao_etiquetas;
drop policy if exists "empresa ve etiquetas cadastro" on precificacao_etiquetas_cadastro;

drop policy if exists "empresa gerencia seus modelos ou prolu_admin gerencia tudo" on modelos_precificacao;
drop policy if exists "leitura de modelos prolu" on modelos_precificacao;
drop policy if exists "empresa gerencia etapas de seus modelos ou prolu_admin de tudo" on modelo_etapas;
drop policy if exists "leitura de etapas de modelos prolu" on modelo_etapas;
drop policy if exists "empresa gerencia tarefas de seus modelos ou prolu_admin de tudo" on modelo_tarefas;
drop policy if exists "leitura de tarefas de modelos prolu" on modelo_tarefas;
-- nome truncado em 63 caracteres pelo Postgres, como aparece em pg_policies
drop policy if exists "empresa gerencia subtarefas de seus modelos ou prolu_admin de t" on modelo_subtarefas;
drop policy if exists "leitura de subtarefas de modelos prolu" on modelo_subtarefas;

drop policy if exists "empresa gerencia seus indicadores" on indicadores;
drop policy if exists "empresa vê seus indicadores" on indicadores;
drop policy if exists "prolu_admin vê todos os indicadores" on indicadores;
drop policy if exists "empresa gerencia suas metas" on indicador_metas;
drop policy if exists "empresa vê suas metas" on indicador_metas;
drop policy if exists "prolu_admin vê todas as metas" on indicador_metas;
drop policy if exists "empresa gerencia seus resultados" on indicador_resultados;
drop policy if exists "empresa vê seus resultados" on indicador_resultados;
drop policy if exists "prolu_admin vê todos os resultados" on indicador_resultados;

-- ───────── 4. Policies novas: "financeiro: le" + "financeiro: grava" ─────────
-- Tabelas com empresa_id próprio
do $direto$
declare
  t text;
begin
  foreach t in array array['crm_colunas', 'crm_linhas', 'precificacoes',
                           'precificacao_etiquetas_cadastro', 'indicadores'] loop
    execute format('drop policy if exists "financeiro: le" on %I', t);
    execute format('drop policy if exists "financeiro: grava" on %I', t);
    execute format('create policy "financeiro: le" on %I for select to authenticated
                      using (fin_pode_ler(empresa_id))', t);
    execute format('create policy "financeiro: grava" on %I for all to authenticated
                      using (fin_pode_gravar(empresa_id)) with check (fin_pode_gravar(empresa_id))', t);
  end loop;
end $direto$;

-- crm_fichas: só leitura (a Edge Function grava com service role)
drop policy if exists "financeiro: le" on crm_fichas;
create policy "financeiro: le" on crm_fichas for select to authenticated
  using (fin_pode_ler(empresa_id));

-- Tabelas filhas: o escritório vem do pai
do $filhas$
declare
  r record;
begin
  for r in select * from (values
    ('oportunidade_comentarios',   'fin_empresa_da_linha(linha_id)'),
    ('precificacao_etapas',        'fin_empresa_da_precificacao(precificacao_id)'),
    ('precificacao_custos_extras', 'fin_empresa_da_precificacao(precificacao_id)'),
    ('precificacao_etiquetas',     'fin_empresa_da_precificacao(precificacao_id)'),
    ('precificacao_tarefas',       'fin_empresa_da_prec_etapa(etapa_id)'),
    ('precificacao_subtarefas',    'fin_empresa_da_prec_tarefa(tarefa_id)'),
    ('indicador_metas',            'fin_empresa_do_indicador(indicador_id)'),
    ('indicador_resultados',       'fin_empresa_do_indicador(indicador_id)')
  ) as v(tabela, empresa) loop
    execute format('drop policy if exists "financeiro: le" on %I', r.tabela);
    execute format('drop policy if exists "financeiro: grava" on %I', r.tabela);
    execute format('create policy "financeiro: le" on %I for select to authenticated
                      using (fin_pode_ler(%s))', r.tabela, r.empresa);
    execute format('create policy "financeiro: grava" on %I for all to authenticated
                      using (fin_pode_gravar(%s)) with check (fin_pode_gravar(%s))',
                   r.tabela, r.empresa, r.empresa);
  end loop;
end $filhas$;

-- Modelos de precificação. A trava de is_prolu está no with_check: quem
-- não é prolu_admin só grava linha com is_prolu = false.
drop policy if exists "financeiro: le" on modelos_precificacao;
drop policy if exists "financeiro: grava" on modelos_precificacao;
create policy "financeiro: le" on modelos_precificacao for select to authenticated
  using (case when is_prolu then fin_le_modelos_prolu() else fin_pode_ler(empresa_id) end);
create policy "financeiro: grava" on modelos_precificacao for all to authenticated
  using (
    (is_prolu and coalesce(auth_is_prolu_admin(), false))
    or (not is_prolu and fin_pode_gravar(empresa_id))
  )
  with check (
    (is_prolu and coalesce(auth_is_prolu_admin(), false))
    or (not is_prolu and fin_pode_gravar(empresa_id))
  );

do $modelos$
declare
  r record;
begin
  for r in select * from (values
    ('modelo_etapas',     'modelo_id'),
    ('modelo_tarefas',    'fin_modelo_da_etapa(etapa_id)'),
    ('modelo_subtarefas', 'fin_modelo_da_tarefa(tarefa_id)')
  ) as v(tabela, modelo) loop
    execute format('drop policy if exists "financeiro: le" on %I', r.tabela);
    execute format('drop policy if exists "financeiro: grava" on %I', r.tabela);
    execute format('create policy "financeiro: le" on %I for select to authenticated
                      using (fin_modelo_pode_ler(%s))', r.tabela, r.modelo);
    execute format('create policy "financeiro: grava" on %I for all to authenticated
                      using (fin_modelo_pode_gravar(%s)) with check (fin_modelo_pode_gravar(%s))',
                   r.tabela, r.modelo, r.modelo);
  end loop;
end $modelos$;

-- ───────── 5. Fechamentos: o controle de acesso é o WHERE do wrapper ─────────
-- _fechamentos_base não tem checagem e só a service_role/postgres executam;
-- fn_fechamentos é DEFINER e filtra. Mesma assinatura e search_path.
create or replace function public.fn_fechamentos(
  p_empresa_id  uuid default null,
  p_data_inicio date default null,
  p_data_fim    date default null
) returns table (linha_id uuid, empresa_id uuid, data_fechamento date, valor numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.*
    from _fechamentos_base(p_empresa_id, p_data_inicio, p_data_fim) f
   where coalesce(auth_is_prolu_admin(), false)
      or (f.empresa_id = auth_empresa_id() and coalesce(auth_is_empresa_master(), false))
$$;

create or replace function public.fn_fechamentos_periodo(
  p_empresa_id  uuid default null,
  p_data_inicio date default null,
  p_data_fim    date default null
) returns table (empresa_id uuid, qtd_fechados bigint, valor_fechado numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.empresa_id, count(*), coalesce(sum(f.valor), 0)
    from fn_fechamentos(p_empresa_id, p_data_inicio, p_data_fim) f
   group by f.empresa_id
$$;

revoke all on function public.fn_fechamentos(uuid, date, date)         from public, anon;
revoke all on function public.fn_fechamentos_periodo(uuid, date, date) from public, anon;
grant execute on function public.fn_fechamentos(uuid, date, date)         to authenticated, service_role;
grant execute on function public.fn_fechamentos_periodo(uuid, date, date) to authenticated, service_role;
revoke all on function public._fechamentos_base(uuid, date, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
