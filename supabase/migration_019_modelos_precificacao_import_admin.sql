-- ════════════════════════════════════════════════════════════════
-- MIGRATION 019 — modelos_precificacao: prolu_admin gerencia modelos
-- de qualquer escritório específico
-- Rodar no SQL Editor do Supabase.
--
-- Contexto: a importação de modelo via arquivo .txt em
-- /admin/modelos-precificacao (ver src/components/ImportarModeloTxtModal.jsx)
-- permite ao prolu_admin escolher como destino "Modelo Prolu"
-- (is_prolu = true, empresa_id = null) OU "Escritório específico"
-- (is_prolu = false, empresa_id = <empresa escolhida>).
--
-- A policy de escrita anterior (migration_015) só deixava prolu_admin
-- mexer em modelos globais (is_prolu = true); pra criar/substituir um
-- modelo "Escritório específico" de uma empresa que não é a dele, o
-- prolu_admin caía fora de `empresa_id = auth_empresa_id()` e da
-- condição `is_prolu`. As policies abaixo liberam geral pra
-- auth_is_prolu_admin(), independente de is_prolu/empresa_id — cada
-- empresa continua só enxergando/editando os próprios modelos
-- (is_prolu = false e empresa_id = auth_empresa_id()), sem mudança de
-- isolamento entre escritórios.
-- ════════════════════════════════════════════════════════════════

drop policy if exists "empresa gerencia seus modelos ou prolu_admin gerencia globais" on modelos_precificacao;
create policy "empresa gerencia seus modelos ou prolu_admin gerencia tudo" on modelos_precificacao
  for all using (
    (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
  ) with check (
    (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
  );

drop policy if exists "empresa gerencia etapas de seus modelos ou prolu_admin dos globais" on precificacao_modelo_etapas;
create policy "empresa gerencia etapas de seus modelos ou prolu_admin de tudo" on precificacao_modelo_etapas
  for all using (
    modelo_id in (
      select id from modelos_precificacao
      where (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
    )
  ) with check (
    modelo_id in (
      select id from modelos_precificacao
      where (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
    )
  );

drop policy if exists "empresa gerencia tarefas de seus modelos ou prolu_admin dos globais" on precificacao_modelo_tarefas;
create policy "empresa gerencia tarefas de seus modelos ou prolu_admin de tudo" on precificacao_modelo_tarefas
  for all using (
    etapa_id in (
      select id from precificacao_modelo_etapas where modelo_id in (
        select id from modelos_precificacao
        where (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
      )
    )
  ) with check (
    etapa_id in (
      select id from precificacao_modelo_etapas where modelo_id in (
        select id from modelos_precificacao
        where (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
      )
    )
  );

drop policy if exists "empresa gerencia subtarefas de seus modelos ou prolu_admin dos globais" on precificacao_modelo_subtarefas;
create policy "empresa gerencia subtarefas de seus modelos ou prolu_admin de tudo" on precificacao_modelo_subtarefas
  for all using (
    tarefa_id in (
      select id from precificacao_modelo_tarefas where etapa_id in (
        select id from precificacao_modelo_etapas where modelo_id in (
          select id from modelos_precificacao
          where (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
        )
      )
    )
  ) with check (
    tarefa_id in (
      select id from precificacao_modelo_tarefas where etapa_id in (
        select id from precificacao_modelo_etapas where modelo_id in (
          select id from modelos_precificacao
          where (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
        )
      )
    )
  );
