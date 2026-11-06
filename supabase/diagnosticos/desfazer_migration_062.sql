-- ════════════════════════════════════════════════════════════════
-- Desfaz a migration_062 (dados financeiros só do master).
-- ATENÇÃO: volta ao estado inseguro de antes (comum lê e grava CRM e
-- precificações pela API; prolu_admin grava precificações de qualquer
-- escritório; fn_fechamentos devolve o total a qualquer papel). Só use se a
-- 062 quebrar um fluxo e rode a 062 de novo assim que corrigir.
-- Recria as policies com os nomes e expressões que estavam no banco
-- (pg_policies de 2026-11). Idempotente.
-- ════════════════════════════════════════════════════════════════

-- 1. Remove as policies da 062
do $remove$
declare
  t text;
begin
  foreach t in array array[
    'crm_colunas', 'crm_linhas', 'crm_fichas', 'oportunidade_comentarios',
    'precificacoes', 'precificacao_etapas', 'precificacao_tarefas', 'precificacao_subtarefas',
    'precificacao_custos_extras', 'precificacao_etiquetas', 'precificacao_etiquetas_cadastro',
    'modelos_precificacao', 'modelo_etapas', 'modelo_tarefas', 'modelo_subtarefas',
    'indicadores', 'indicador_metas', 'indicador_resultados'
  ] loop
    execute format('drop policy if exists "financeiro: le" on %I', t);
    execute format('drop policy if exists "financeiro: grava" on %I', t);
  end loop;
end $remove$;

-- 2. Policies antigas
drop policy if exists "empresa gerencia suas colunas" on crm_colunas;
create policy "empresa gerencia suas colunas" on crm_colunas
  for all using (empresa_id = auth_empresa_id());
drop policy if exists "empresa vê suas colunas" on crm_colunas;
create policy "empresa vê suas colunas" on crm_colunas
  for select using (empresa_id = auth_empresa_id());
drop policy if exists "prolu_admin vê todas as colunas crm" on crm_colunas;
create policy "prolu_admin vê todas as colunas crm" on crm_colunas
  for select using (auth_is_prolu_admin());

drop policy if exists "empresa gerencia suas linhas" on crm_linhas;
create policy "empresa gerencia suas linhas" on crm_linhas
  for all using (empresa_id = auth_empresa_id());
drop policy if exists "empresa vê suas linhas" on crm_linhas;
create policy "empresa vê suas linhas" on crm_linhas
  for select using (empresa_id = auth_empresa_id());
drop policy if exists "prolu_admin vê todas as linhas crm" on crm_linhas;
create policy "prolu_admin vê todas as linhas crm" on crm_linhas
  for select using (auth_is_prolu_admin());

drop policy if exists "crm_fichas: le do proprio escritorio ou prolu_admin" on crm_fichas;
create policy "crm_fichas: le do proprio escritorio ou prolu_admin" on crm_fichas
  for select using (empresa_id = auth_empresa_id() or auth_is_prolu_admin());

drop policy if exists "empresa vê comentários de suas oportunidades" on oportunidade_comentarios;
create policy "empresa vê comentários de suas oportunidades" on oportunidade_comentarios
  for all using (linha_id in (select crm_linhas.id from crm_linhas where crm_linhas.empresa_id = auth_empresa_id()));

drop policy if exists "empresa ve precificacoes" on precificacoes;
create policy "empresa ve precificacoes" on precificacoes
  for all using (empresa_id = auth_empresa_id() or auth_is_prolu_admin());
drop policy if exists "empresa ve etapas" on precificacao_etapas;
create policy "empresa ve etapas" on precificacao_etapas
  for all using (precificacao_id in (select precificacoes.id from precificacoes
                                      where precificacoes.empresa_id = auth_empresa_id())
                 or auth_is_prolu_admin());
drop policy if exists "empresa ve tarefas" on precificacao_tarefas;
create policy "empresa ve tarefas" on precificacao_tarefas
  for all using (etapa_id in (select pe.id from precificacao_etapas pe
                                join precificacoes p on p.id = pe.precificacao_id
                               where p.empresa_id = auth_empresa_id())
                 or auth_is_prolu_admin());
drop policy if exists "empresa ve subtarefas" on precificacao_subtarefas;
create policy "empresa ve subtarefas" on precificacao_subtarefas
  for all using (tarefa_id in (select pt.id from precificacao_tarefas pt
                                 join precificacao_etapas pe on pe.id = pt.etapa_id
                                 join precificacoes p on p.id = pe.precificacao_id
                                where p.empresa_id = auth_empresa_id())
                 or auth_is_prolu_admin());
drop policy if exists "empresa ve custos" on precificacao_custos_extras;
create policy "empresa ve custos" on precificacao_custos_extras
  for all using (precificacao_id in (select precificacoes.id from precificacoes
                                      where precificacoes.empresa_id = auth_empresa_id())
                 or auth_is_prolu_admin());
drop policy if exists "empresa gerencia etiquetas prec" on precificacao_etiquetas;
create policy "empresa gerencia etiquetas prec" on precificacao_etiquetas
  for all
  using (precificacao_id in (select precificacoes.id from precificacoes
                              where precificacoes.empresa_id = auth_empresa_id())
         or auth_is_prolu_admin())
  with check (precificacao_id in (select precificacoes.id from precificacoes
                                   where precificacoes.empresa_id = auth_empresa_id())
              or auth_is_prolu_admin());
drop policy if exists "empresa ve etiquetas cadastro" on precificacao_etiquetas_cadastro;
create policy "empresa ve etiquetas cadastro" on precificacao_etiquetas_cadastro
  for all using (empresa_id = auth_empresa_id() or auth_is_prolu_admin());

drop policy if exists "leitura de modelos prolu" on modelos_precificacao;
create policy "leitura de modelos prolu" on modelos_precificacao
  for select using (is_prolu = true);
drop policy if exists "empresa gerencia seus modelos ou prolu_admin gerencia tudo" on modelos_precificacao;
create policy "empresa gerencia seus modelos ou prolu_admin gerencia tudo" on modelos_precificacao
  for all
  using (((not is_prolu) and empresa_id = auth_empresa_id()) or auth_is_prolu_admin())
  with check (((not is_prolu) and empresa_id = auth_empresa_id()) or auth_is_prolu_admin());

drop policy if exists "leitura de etapas de modelos prolu" on modelo_etapas;
create policy "leitura de etapas de modelos prolu" on modelo_etapas
  for select using (modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                   where modelos_precificacao.is_prolu = true));
drop policy if exists "empresa gerencia etapas de seus modelos ou prolu_admin de tudo" on modelo_etapas;
create policy "empresa gerencia etapas de seus modelos ou prolu_admin de tudo" on modelo_etapas
  for all
  using (modelo_id in (select modelos_precificacao.id from modelos_precificacao
                        where (not modelos_precificacao.is_prolu)
                          and modelos_precificacao.empresa_id = auth_empresa_id())
         or auth_is_prolu_admin())
  with check (modelo_id in (select modelos_precificacao.id from modelos_precificacao
                             where (not modelos_precificacao.is_prolu)
                               and modelos_precificacao.empresa_id = auth_empresa_id())
              or auth_is_prolu_admin());

drop policy if exists "leitura de tarefas de modelos prolu" on modelo_tarefas;
create policy "leitura de tarefas de modelos prolu" on modelo_tarefas
  for select using (etapa_id in (select modelo_etapas.id from modelo_etapas
                                  where modelo_etapas.modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                                                     where modelos_precificacao.is_prolu = true)));
drop policy if exists "empresa gerencia tarefas de seus modelos ou prolu_admin de tudo" on modelo_tarefas;
create policy "empresa gerencia tarefas de seus modelos ou prolu_admin de tudo" on modelo_tarefas
  for all
  using (etapa_id in (select modelo_etapas.id from modelo_etapas
                       where modelo_etapas.modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                                          where (not modelos_precificacao.is_prolu)
                                                            and modelos_precificacao.empresa_id = auth_empresa_id()))
         or auth_is_prolu_admin())
  with check (etapa_id in (select modelo_etapas.id from modelo_etapas
                            where modelo_etapas.modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                                               where (not modelos_precificacao.is_prolu)
                                                                 and modelos_precificacao.empresa_id = auth_empresa_id()))
              or auth_is_prolu_admin());

drop policy if exists "leitura de subtarefas de modelos prolu" on modelo_subtarefas;
create policy "leitura de subtarefas de modelos prolu" on modelo_subtarefas
  for select using (tarefa_id in (select modelo_tarefas.id from modelo_tarefas
                                   where modelo_tarefas.etapa_id in (select modelo_etapas.id from modelo_etapas
                                                                      where modelo_etapas.modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                                                                                         where modelos_precificacao.is_prolu = true))));
drop policy if exists "empresa gerencia subtarefas de seus modelos ou prolu_admin de t" on modelo_subtarefas;
create policy "empresa gerencia subtarefas de seus modelos ou prolu_admin de t" on modelo_subtarefas
  for all
  using (tarefa_id in (select modelo_tarefas.id from modelo_tarefas
                        where modelo_tarefas.etapa_id in (select modelo_etapas.id from modelo_etapas
                                                           where modelo_etapas.modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                                                                              where (not modelos_precificacao.is_prolu)
                                                                                                and modelos_precificacao.empresa_id = auth_empresa_id())))
         or auth_is_prolu_admin())
  with check (tarefa_id in (select modelo_tarefas.id from modelo_tarefas
                             where modelo_tarefas.etapa_id in (select modelo_etapas.id from modelo_etapas
                                                                where modelo_etapas.modelo_id in (select modelos_precificacao.id from modelos_precificacao
                                                                                                   where (not modelos_precificacao.is_prolu)
                                                                                                     and modelos_precificacao.empresa_id = auth_empresa_id())))
              or auth_is_prolu_admin());

drop policy if exists "empresa gerencia seus indicadores" on indicadores;
create policy "empresa gerencia seus indicadores" on indicadores
  for all using (empresa_id = auth_empresa_id());
drop policy if exists "empresa vê seus indicadores" on indicadores;
create policy "empresa vê seus indicadores" on indicadores
  for select using (empresa_id = auth_empresa_id());
drop policy if exists "prolu_admin vê todos os indicadores" on indicadores;
create policy "prolu_admin vê todos os indicadores" on indicadores
  for select using (auth_is_prolu_admin());

drop policy if exists "empresa gerencia suas metas" on indicador_metas;
create policy "empresa gerencia suas metas" on indicador_metas
  for all using (indicador_id in (select indicadores.id from indicadores where indicadores.empresa_id = auth_empresa_id()));
drop policy if exists "empresa vê suas metas" on indicador_metas;
create policy "empresa vê suas metas" on indicador_metas
  for select using (indicador_id in (select indicadores.id from indicadores where indicadores.empresa_id = auth_empresa_id()));
drop policy if exists "prolu_admin vê todas as metas" on indicador_metas;
create policy "prolu_admin vê todas as metas" on indicador_metas
  for select using (auth_is_prolu_admin());

drop policy if exists "empresa gerencia seus resultados" on indicador_resultados;
create policy "empresa gerencia seus resultados" on indicador_resultados
  for all using (indicador_id in (select indicadores.id from indicadores where indicadores.empresa_id = auth_empresa_id()));
drop policy if exists "empresa vê seus resultados" on indicador_resultados;
create policy "empresa vê seus resultados" on indicador_resultados
  for select using (indicador_id in (select indicadores.id from indicadores where indicadores.empresa_id = auth_empresa_id()));
drop policy if exists "prolu_admin vê todos os resultados" on indicador_resultados;
create policy "prolu_admin vê todos os resultados" on indicador_resultados
  for select using (auth_is_prolu_admin());

-- 3. fn_fechamentos como estava (o periodo não muda: só lê fn_fechamentos)
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
  where auth_is_prolu_admin() or f.empresa_id = auth_empresa_id()
$$;

-- 4. Helpers da 062 (depois das policies, que dependiam deles)
drop function if exists fin_modelo_da_tarefa(uuid);
drop function if exists fin_modelo_da_etapa(uuid);
drop function if exists fin_modelo_pode_gravar(uuid);
drop function if exists fin_modelo_pode_ler(uuid);
drop function if exists fin_empresa_do_indicador(uuid);
drop function if exists fin_empresa_da_linha(uuid);
drop function if exists fin_empresa_da_prec_tarefa(uuid);
drop function if exists fin_empresa_da_prec_etapa(uuid);
drop function if exists fin_empresa_da_precificacao(uuid);
drop function if exists fin_le_modelos_prolu();
drop function if exists fin_pode_gravar(uuid);
drop function if exists fin_pode_ler(uuid);

notify pgrst, 'reload schema';
