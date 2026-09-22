-- ════════════════════════════════════════════════════════════════
-- MIGRATION 015 — Precificação (orçamentos)
--
-- ATENÇÃO: este arquivo documenta o schema realmente em produção, não
-- o que foi originalmente escrito aqui. O banco real foi montado à mão
-- (ou por outro processo) com nomes de tabela/coluna diferentes da
-- primeira versão deste arquivo, e o app em src/screens/Precificacao*
-- e src/hooks/usePrecificacaoCalculo.js foi corrigido pra bater com
-- essa realidade. Trate como referência de leitura, não como script
-- pronto pra rodar do zero sem conferir contra o banco atual.
--
-- Acesso: só isEmpresaMaster (ver src/contexts/AuthContext.jsx
-- `acesso.precificacao`), restrição feita no client — RLS aqui só
-- garante isolamento por empresa (mesmo padrão do CRM).
-- ════════════════════════════════════════════════════════════════

-- ───────── Precificações ─────────
-- Colunas confirmadas: nome, cliente_id, crm_linha_id, valor_hora,
-- margem_pct, nf_pct, nf_ativo, metragem, complexidade, status,
-- valor_fechamento, updated_at. NÃO existem (removidas do app):
-- etiquetas, total_horas, valor_sem_margem, valor_projeto — total de
-- horas e valor final são sempre calculados na hora via
-- src/hooks/usePrecificacaoCalculo.js, nunca persistidos.
create table precificacoes (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null default 'Nova precificação',
  status text not null default 'orcamento' check (status in ('orcamento', 'fechado')),
  cliente_id uuid references clientes(id) on delete set null,
  crm_linha_id uuid references crm_linhas(id) on delete set null,
  valor_hora numeric not null default 0,
  margem_pct numeric not null default 30,
  nf_ativo boolean not null default false,
  nf_pct numeric not null default 7,
  metragem numeric,
  complexidade text not null default 'normal' check (complexidade in ('baixa', 'normal', 'alta')),
  valor_fechamento numeric, -- preenchido ao fechar o projeto (valor real negociado, pode diferir do calculado)
  created_by uuid references usuarios(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table precificacao_etapas (
  id uuid primary key default uuid_generate_v4(),
  precificacao_id uuid references precificacoes(id) on delete cascade,
  nome text not null,
  ordem int default 0,
  created_at timestamptz default now()
);

create table precificacao_tarefas (
  id uuid primary key default uuid_generate_v4(),
  etapa_id uuid references precificacao_etapas(id) on delete cascade,
  nome text not null,
  horas_estimadas_soltas numeric not null default 0,
  ordem int default 0,
  created_at timestamptz default now()
);

create table precificacao_subtarefas (
  id uuid primary key default uuid_generate_v4(),
  tarefa_id uuid references precificacao_tarefas(id) on delete cascade,
  nome text not null,
  horas_estimadas numeric not null default 0,
  ordem int default 0,
  created_at timestamptz default now()
);

create table precificacao_custos_extras (
  id uuid primary key default uuid_generate_v4(),
  precificacao_id uuid references precificacoes(id) on delete cascade,
  nome text not null,
  valor_estimado numeric not null default 0,
  ordem int default 0,
  created_at timestamptz default now()
);

-- Etiquetas aplicadas a uma precificação — uma linha por etiqueta
-- vinculada (não é array/jsonb). O catálogo de sugestões pro
-- autocomplete fica em precificacao_etiquetas_cadastro (migration 016).
create table precificacao_etiquetas (
  id uuid primary key default uuid_generate_v4(),
  precificacao_id uuid references precificacoes(id) on delete cascade,
  nome text not null,
  created_at timestamptz default now()
);

-- ───────── Modelos de etapas (Prolu globais + por empresa) ─────────
-- is_prolu = true e empresa_id = null → modelo Prolu, visível a todas
-- as empresas e só editável por prolu_admin (ver
-- src/screens/admin/AdminModelosPrecificacao.jsx). is_prolu = false e
-- empresa_id preenchido → modelo próprio da empresa, só ela vê/edita
-- (ver src/screens/ModelosEtapas.jsx).
--
-- NOME REAL DAS TABELAS FILHAS — confirmado via information_schema em
-- 2026-09-22, depois que a migration_019 falhou com "relation
-- precificacao_modelo_etapas does not exist": o banco real usa
-- modelo_etapas / modelo_tarefas / modelo_subtarefas, SEM o prefixo
-- "precificacao_" que este arquivo documentava até então (era um erro
-- de documentação, não só de nome de coluna como o resto do arquivo
-- avisa). Colunas batem certinho com o que está abaixo, só o nome da
-- tabela mudou. Corrigido aqui e em todo o código do app que apontava
-- pro nome errado (AdminModelosPrecificacao.jsx, ModelosEtapas.jsx,
-- PrecificacaoDetalhe.jsx, src/utils/modeloPrecificacaoTree.js,
-- src/components/ImportarModeloTxtModal.jsx).
create table modelos_precificacao (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  is_prolu boolean not null default false,
  nome text not null,
  created_at timestamptz default now()
);

create table modelo_etapas (
  id uuid primary key default uuid_generate_v4(),
  modelo_id uuid references modelos_precificacao(id) on delete cascade,
  nome text not null,
  ordem int default 0
);

create table modelo_tarefas (
  id uuid primary key default uuid_generate_v4(),
  etapa_id uuid references modelo_etapas(id) on delete cascade,
  nome text not null,
  horas_estimadas_soltas numeric not null default 0,
  ordem int default 0
);

create table modelo_subtarefas (
  id uuid primary key default uuid_generate_v4(),
  tarefa_id uuid references modelo_tarefas(id) on delete cascade,
  nome text not null,
  horas_estimadas numeric not null default 0,
  ordem int default 0
);

-- ───────── RLS ─────────
alter table precificacoes enable row level security;
alter table precificacao_etapas enable row level security;
alter table precificacao_tarefas enable row level security;
alter table precificacao_subtarefas enable row level security;
alter table precificacao_custos_extras enable row level security;
alter table precificacao_etiquetas enable row level security;
alter table modelos_precificacao enable row level security;
alter table modelo_etapas enable row level security;
alter table modelo_tarefas enable row level security;
alter table modelo_subtarefas enable row level security;

create policy "empresa gerencia suas precificacoes" on precificacoes
  for all using (empresa_id = auth_empresa_id());

create policy "empresa gerencia etapas de suas precificacoes" on precificacao_etapas
  for all using (
    precificacao_id in (select id from precificacoes where empresa_id = auth_empresa_id())
  );

create policy "empresa gerencia tarefas de suas precificacoes" on precificacao_tarefas
  for all using (
    etapa_id in (
      select id from precificacao_etapas where precificacao_id in (
        select id from precificacoes where empresa_id = auth_empresa_id()
      )
    )
  );

create policy "empresa gerencia subtarefas de suas precificacoes" on precificacao_subtarefas
  for all using (
    tarefa_id in (
      select id from precificacao_tarefas where etapa_id in (
        select id from precificacao_etapas where precificacao_id in (
          select id from precificacoes where empresa_id = auth_empresa_id()
        )
      )
    )
  );

create policy "empresa gerencia custos extras de suas precificacoes" on precificacao_custos_extras
  for all using (
    precificacao_id in (select id from precificacoes where empresa_id = auth_empresa_id())
  );

create policy "empresa gerencia etiquetas de suas precificacoes" on precificacao_etiquetas
  for all using (
    precificacao_id in (select id from precificacoes where empresa_id = auth_empresa_id())
  );

-- Modelos: leitura liberada pra globais (todo mundo vê modelos Prolu);
-- escrita só pra quem é dono (empresa dona, ou prolu_admin nos globais).
--
-- IMPORTANTE — isto documenta a INTENÇÃO original, não o que o banco
-- real tinha antes da migration_019. Na prática, alguém montou à mão
-- só UMA policy FOR ALL por tabela (ex: "empresa ve modelos" em
-- modelos_precificacao), com a condição
-- `is_prolu = true or empresa_id = auth_empresa_id() or auth_is_prolu_admin()`.
-- Isso deixava a leitura certa, mas como é FOR ALL sem WITH CHECK
-- explícito (cai no USING pra insert/update/delete também), qualquer
-- usuário autenticado — não só prolu_admin — conseguia escrever em
-- linhas com is_prolu = true (a tela escondia o botão de editar, mas
-- a policy do banco não bloqueava). A migration_019 substitui essa
-- policy única pelas duas abaixo (split leitura/escrita), que é o que
-- realmente vale a partir dela.
create policy "todos leem modelos globais" on modelos_precificacao
  for select using (is_prolu);
create policy "empresa gerencia seus modelos ou prolu_admin gerencia globais" on modelos_precificacao
  for all using (
    (not is_prolu and empresa_id = auth_empresa_id()) or (is_prolu and auth_is_prolu_admin())
  ) with check (
    (not is_prolu and empresa_id = auth_empresa_id()) or (is_prolu and auth_is_prolu_admin())
  );

create policy "todos leem etapas de modelos globais" on modelo_etapas
  for select using (
    modelo_id in (select id from modelos_precificacao where is_prolu)
  );
create policy "empresa gerencia etapas de seus modelos ou prolu_admin dos globais" on modelo_etapas
  for all using (
    modelo_id in (
      select id from modelos_precificacao
      where (not is_prolu and empresa_id = auth_empresa_id()) or (is_prolu and auth_is_prolu_admin())
    )
  );

create policy "todos leem tarefas de modelos globais" on modelo_tarefas
  for select using (
    etapa_id in (
      select id from modelo_etapas where modelo_id in (
        select id from modelos_precificacao where is_prolu
      )
    )
  );
create policy "empresa gerencia tarefas de seus modelos ou prolu_admin dos globais" on modelo_tarefas
  for all using (
    etapa_id in (
      select id from modelo_etapas where modelo_id in (
        select id from modelos_precificacao
        where (not is_prolu and empresa_id = auth_empresa_id()) or (is_prolu and auth_is_prolu_admin())
      )
    )
  );

create policy "todos leem subtarefas de modelos globais" on modelo_subtarefas
  for select using (
    tarefa_id in (
      select id from modelo_tarefas where etapa_id in (
        select id from modelo_etapas where modelo_id in (
          select id from modelos_precificacao where is_prolu
        )
      )
    )
  );
create policy "empresa gerencia subtarefas de seus modelos ou prolu_admin dos globais" on modelo_subtarefas
  for all using (
    tarefa_id in (
      select id from modelo_tarefas where etapa_id in (
        select id from modelo_etapas where modelo_id in (
          select id from modelos_precificacao
          where (not is_prolu and empresa_id = auth_empresa_id()) or (is_prolu and auth_is_prolu_admin())
        )
      )
    )
  );
