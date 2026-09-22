-- ════════════════════════════════════════════════════════════════
-- MIGRATION 019 — modelos de precificação: RLS correta (nomes reais
-- de tabela) + fecha brecha de escrita nos modelos Prolu globais
-- Rodar no SQL Editor do Supabase.
--
-- ATENÇÃO — nomes de tabela: apesar do que a migration_015 documenta
-- (precificacao_modelo_etapas / _tarefas / _subtarefas), o banco real
-- usa modelo_etapas / modelo_tarefas / modelo_subtarefas (sem o
-- prefixo "precificacao_"). Confirmado via information_schema em
-- 2026-09-22 — colunas batem exatamente com o documentado, só o nome
-- da tabela está sem o prefixo. O código do app (AdminModelosPrecificacao,
-- ModelosEtapas, PrecificacaoDetalhe, modeloPrecificacaoTree.js,
-- ImportarModeloTxtModal.jsx) já foi corrigido pra usar os nomes reais.
--
-- ATENÇÃO — policies reais: a migration_015 documenta 2 policies por
-- tabela (uma "for select" aberta pra is_prolu=true + uma "for all"
-- restrita). O banco real tinha só 1 policy por tabela, FOR ALL, com:
--   is_prolu = true OR empresa_id = auth_empresa_id() OR auth_is_prolu_admin()
-- Isso deixa a leitura correta (todo mundo vê modelos Prolu), mas como
-- é FOR ALL sem WITH CHECK explícito (cai no USING pra INSERT/UPDATE/
-- DELETE também), QUALQUER usuário autenticado — não só prolu_admin —
-- conseguia INSERT/UPDATE/DELETE em linhas com is_prolu = true, porque
-- essa condição sozinha já satisfaz o OR. A tela (ModelosEtapas.jsx)
-- esconde os botões de editar pra quem não é prolu_admin, mas isso é
-- só UI — a policy do banco não impedia acesso direto via API/SDK.
-- Não havia vazamento entre escritórios (empresa só via/mexia nas
-- próprias linhas is_prolu=false), só a brecha nos modelos globais.
--
-- Esta migration substitui a policy única de cada tabela por duas:
--  1) leitura aberta pra is_prolu = true (mantém "Modelos Padrão
--     Prolu" visível a todo mundo, sem mudança de comportamento);
--  2) gestão (insert/update/delete, e leitura do que é seu) restrita a
--     "não é prolu e é da minha empresa" OU "eu sou prolu_admin" — o
--     prolu_admin fica liberado pra qualquer linha (needed pro destino
--     "Escritório específico" da importação por .txt), e ninguém mais
--     consegue mexer em is_prolu = true.
-- ════════════════════════════════════════════════════════════════

-- ───────── modelos_precificacao ─────────
drop policy if exists "empresa ve modelos" on modelos_precificacao;
drop policy if exists "leitura de modelos prolu" on modelos_precificacao;
drop policy if exists "empresa gerencia seus modelos ou prolu_admin gerencia tudo" on modelos_precificacao;

create policy "leitura de modelos prolu" on modelos_precificacao
  for select using (is_prolu = true);

create policy "empresa gerencia seus modelos ou prolu_admin gerencia tudo" on modelos_precificacao
  for all using (
    (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
  ) with check (
    (not is_prolu and empresa_id = auth_empresa_id()) or auth_is_prolu_admin()
  );

-- ───────── modelo_etapas ─────────
drop policy if exists "empresa ve modelo etapas" on modelo_etapas;
drop policy if exists "leitura de etapas de modelos prolu" on modelo_etapas;
drop policy if exists "empresa gerencia etapas de seus modelos ou prolu_admin de tudo" on modelo_etapas;

create policy "leitura de etapas de modelos prolu" on modelo_etapas
  for select using (
    modelo_id in (select id from modelos_precificacao where is_prolu = true)
  );

create policy "empresa gerencia etapas de seus modelos ou prolu_admin de tudo" on modelo_etapas
  for all using (
    modelo_id in (
      select id from modelos_precificacao
      where (not is_prolu and empresa_id = auth_empresa_id())
    ) or auth_is_prolu_admin()
  ) with check (
    modelo_id in (
      select id from modelos_precificacao
      where (not is_prolu and empresa_id = auth_empresa_id())
    ) or auth_is_prolu_admin()
  );

-- ───────── modelo_tarefas ─────────
drop policy if exists "empresa ve modelo tarefas" on modelo_tarefas;
drop policy if exists "leitura de tarefas de modelos prolu" on modelo_tarefas;
drop policy if exists "empresa gerencia tarefas de seus modelos ou prolu_admin de tudo" on modelo_tarefas;

create policy "leitura de tarefas de modelos prolu" on modelo_tarefas
  for select using (
    etapa_id in (
      select id from modelo_etapas where modelo_id in (
        select id from modelos_precificacao where is_prolu = true
      )
    )
  );

create policy "empresa gerencia tarefas de seus modelos ou prolu_admin de tudo" on modelo_tarefas
  for all using (
    etapa_id in (
      select id from modelo_etapas where modelo_id in (
        select id from modelos_precificacao
        where (not is_prolu and empresa_id = auth_empresa_id())
      )
    ) or auth_is_prolu_admin()
  ) with check (
    etapa_id in (
      select id from modelo_etapas where modelo_id in (
        select id from modelos_precificacao
        where (not is_prolu and empresa_id = auth_empresa_id())
      )
    ) or auth_is_prolu_admin()
  );

-- ───────── modelo_subtarefas ─────────
drop policy if exists "empresa ve modelo subtarefas" on modelo_subtarefas;
drop policy if exists "leitura de subtarefas de modelos prolu" on modelo_subtarefas;
drop policy if exists "empresa gerencia subtarefas de seus modelos ou prolu_admin de tudo" on modelo_subtarefas;

create policy "leitura de subtarefas de modelos prolu" on modelo_subtarefas
  for select using (
    tarefa_id in (
      select id from modelo_tarefas where etapa_id in (
        select id from modelo_etapas where modelo_id in (
          select id from modelos_precificacao where is_prolu = true
        )
      )
    )
  );

create policy "empresa gerencia subtarefas de seus modelos ou prolu_admin de tudo" on modelo_subtarefas
  for all using (
    tarefa_id in (
      select id from modelo_tarefas where etapa_id in (
        select id from modelo_etapas where modelo_id in (
          select id from modelos_precificacao
          where (not is_prolu and empresa_id = auth_empresa_id())
        )
      )
    ) or auth_is_prolu_admin()
  ) with check (
    tarefa_id in (
      select id from modelo_tarefas where etapa_id in (
        select id from modelo_etapas where modelo_id in (
          select id from modelos_precificacao
          where (not is_prolu and empresa_id = auth_empresa_id())
        )
      )
    ) or auth_is_prolu_admin()
  );
