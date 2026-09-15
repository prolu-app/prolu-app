-- ════════════════════════════════════════════════════════════════
-- MIGRATION 015 — Precificação (orçamentos e projetos fechados)
-- Rodar no SQL Editor do Supabase.
--
-- Módulo novo, só acessível a isEmpresaMaster (igual ao CRM — ver
-- src/contexts/AuthContext.jsx `acesso.precificacao`). O isolamento
-- por empresa é garantido aqui via RLS (empresa_id = auth_empresa_id());
-- a restrição de papel (só master) é feita no client, mesmo padrão do
-- CRM (crm_colunas/crm_linhas também não checam papel na RLS).
--
-- Não reaproveita as tabelas legadas da seção 9 do schema.sql
-- (projetos/orcamentos/modelos_etapas) — aquela estrutura foi desenhada
-- para uma futura migração de dados do FlutterFlow e não bate com o
-- modelo novo (status único, cliente + registro CRM como vínculos
-- independentes, 3 níveis de etapa/tarefa/subtarefa).
-- ════════════════════════════════════════════════════════════════

-- ───────── Precificações ─────────
create table precificacoes (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null default 'Nova precificação',
  status text not null default 'orcamento' check (status in ('orcamento', 'fechado')),
  cliente_id uuid references clientes(id) on delete set null,
  crm_linha_id uuid references crm_linhas(id) on delete set null,
  valor_hora numeric not null default 0,
  margem_lucro numeric not null default 30,
  nf_ativo boolean not null default false,
  nf_percentual numeric not null default 7,
  metragem numeric,
  complexidade text not null default 'normal' check (complexidade in ('baixa', 'normal', 'alta')),
  etiquetas jsonb not null default '[]',
  valor_fechamento numeric, -- preenchido ao fechar o projeto (valor real negociado, pode diferir do calculado)
  -- cache denormalizado do painel de resultado — recalculado no client a
  -- cada mudança e persistido aqui pra listagem não precisar somar etapas
  total_horas numeric not null default 0,
  valor_sem_margem numeric not null default 0,
  valor_projeto numeric not null default 0,
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
  horas numeric not null default 0,
  ordem int default 0,
  created_at timestamptz default now()
);

create table precificacao_subtarefas (
  id uuid primary key default uuid_generate_v4(),
  tarefa_id uuid references precificacao_tarefas(id) on delete cascade,
  nome text not null,
  horas numeric not null default 0,
  ordem int default 0,
  created_at timestamptz default now()
);

create table precificacao_custos_extras (
  id uuid primary key default uuid_generate_v4(),
  precificacao_id uuid references precificacoes(id) on delete cascade,
  nome text not null,
  valor numeric not null default 0,
  ordem int default 0,
  created_at timestamptz default now()
);

-- ───────── Modelos de etapas (Prolu globais + por empresa) ─────────
-- empresa_id null = modelo Prolu, visível a todas as empresas e só
-- editável por prolu_admin. empresa_id preenchido = modelo próprio da
-- empresa, só ela vê/edita.
create table precificacao_modelos (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  created_at timestamptz default now()
);

create table precificacao_modelo_etapas (
  id uuid primary key default uuid_generate_v4(),
  modelo_id uuid references precificacao_modelos(id) on delete cascade,
  nome text not null,
  ordem int default 0
);

create table precificacao_modelo_tarefas (
  id uuid primary key default uuid_generate_v4(),
  etapa_id uuid references precificacao_modelo_etapas(id) on delete cascade,
  nome text not null,
  horas numeric not null default 0,
  ordem int default 0
);

create table precificacao_modelo_subtarefas (
  id uuid primary key default uuid_generate_v4(),
  tarefa_id uuid references precificacao_modelo_tarefas(id) on delete cascade,
  nome text not null,
  horas numeric not null default 0,
  ordem int default 0
);

-- ───────── RLS ─────────
alter table precificacoes enable row level security;
alter table precificacao_etapas enable row level security;
alter table precificacao_tarefas enable row level security;
alter table precificacao_subtarefas enable row level security;
alter table precificacao_custos_extras enable row level security;
alter table precificacao_modelos enable row level security;
alter table precificacao_modelo_etapas enable row level security;
alter table precificacao_modelo_tarefas enable row level security;
alter table precificacao_modelo_subtarefas enable row level security;

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

-- Modelos: leitura liberada pra globais (todo mundo vê modelos Prolu);
-- escrita só pra quem é dono (empresa dona, ou prolu_admin nos globais).
create policy "todos leem modelos globais" on precificacao_modelos
  for select using (empresa_id is null);
create policy "empresa gerencia seus modelos ou prolu_admin gerencia globais" on precificacao_modelos
  for all using (
    empresa_id = auth_empresa_id() or (empresa_id is null and auth_is_prolu_admin())
  ) with check (
    empresa_id = auth_empresa_id() or (empresa_id is null and auth_is_prolu_admin())
  );

create policy "todos leem etapas de modelos globais" on precificacao_modelo_etapas
  for select using (
    modelo_id in (select id from precificacao_modelos where empresa_id is null)
  );
create policy "empresa gerencia etapas de seus modelos ou prolu_admin dos globais" on precificacao_modelo_etapas
  for all using (
    modelo_id in (
      select id from precificacao_modelos
      where empresa_id = auth_empresa_id() or (empresa_id is null and auth_is_prolu_admin())
    )
  );

create policy "todos leem tarefas de modelos globais" on precificacao_modelo_tarefas
  for select using (
    etapa_id in (
      select id from precificacao_modelo_etapas where modelo_id in (
        select id from precificacao_modelos where empresa_id is null
      )
    )
  );
create policy "empresa gerencia tarefas de seus modelos ou prolu_admin dos globais" on precificacao_modelo_tarefas
  for all using (
    etapa_id in (
      select id from precificacao_modelo_etapas where modelo_id in (
        select id from precificacao_modelos
        where empresa_id = auth_empresa_id() or (empresa_id is null and auth_is_prolu_admin())
      )
    )
  );

create policy "todos leem subtarefas de modelos globais" on precificacao_modelo_subtarefas
  for select using (
    tarefa_id in (
      select id from precificacao_modelo_tarefas where etapa_id in (
        select id from precificacao_modelo_etapas where modelo_id in (
          select id from precificacao_modelos where empresa_id is null
        )
      )
    )
  );
create policy "empresa gerencia subtarefas de seus modelos ou prolu_admin dos globais" on precificacao_modelo_subtarefas
  for all using (
    tarefa_id in (
      select id from precificacao_modelo_tarefas where etapa_id in (
        select id from precificacao_modelo_etapas where modelo_id in (
          select id from precificacao_modelos
          where empresa_id = auth_empresa_id() or (empresa_id is null and auth_is_prolu_admin())
        )
      )
    )
  );
