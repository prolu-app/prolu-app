-- ════════════════════════════════════════════════════════════════
-- PROLU APP — SCHEMA SUPABASE (PostgreSQL)
-- Rodar no SQL Editor do Supabase, na ordem em que aparece.
-- ════════════════════════════════════════════════════════════════

-- ───────── EXTENSÕES ─────────
create extension if not exists "uuid-ossp";

-- ════════════════════════════════════════════════════════════════
-- 1. EMPRESAS E USUÁRIOS
-- ════════════════════════════════════════════════════════════════

create table empresas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  created_at timestamptz default now()
);

create table usuarios (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  nome text not null,
  email text,
  role text not null default 'comum' check (role in ('master', 'comum')),
  created_at timestamptz default now()
);

-- Função auxiliar: empresa do usuário autenticado (evita repetir subquery no RLS)
create or replace function auth_empresa_id() returns uuid as $$
  select empresa_id from usuarios where auth_id = auth.uid()
$$ language sql stable security definer;

create or replace function auth_is_master() returns boolean as $$
  select role = 'master' from usuarios where auth_id = auth.uid()
$$ language sql stable security definer;

alter table empresas enable row level security;
alter table usuarios enable row level security;

create policy "usuarios veem a própria empresa" on empresas
  for select using (id = auth_empresa_id());

create policy "usuarios veem colegas da empresa" on usuarios
  for select using (empresa_id = auth_empresa_id());

create policy "usuario edita o próprio registro" on usuarios
  for update using (auth_id = auth.uid());

-- ════════════════════════════════════════════════════════════════
-- 2. AVISOS (banner no Início)
-- ════════════════════════════════════════════════════════════════

create table avisos (
  id uuid primary key default uuid_generate_v4(),
  texto text not null,
  cor text not null default 'green' check (cor in ('green', 'orange', 'violet', 'blue')),
  link text,
  link_texto text,
  link_externo boolean default false,
  ativo_de date default current_date,
  ativo_ate date,
  created_at timestamptz default now()
);

alter table avisos enable row level security;
create policy "todos veem avisos ativos" on avisos for select using (true);
create policy "master gerencia avisos" on avisos for all using (auth_is_master());

-- Avisos descartados manualmente por usuário (botão "fechar")
create table avisos_descartados (
  usuario_id uuid references usuarios(id) on delete cascade,
  aviso_id uuid references avisos(id) on delete cascade,
  descartado_em timestamptz default now(),
  primary key (usuario_id, aviso_id)
);
alter table avisos_descartados enable row level security;
create policy "usuario gerencia seus descartes" on avisos_descartados
  for all using (usuario_id = (select id from usuarios where auth_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════
-- 3. CITAÇÕES (frase do dia no Início)
-- ════════════════════════════════════════════════════════════════

create table citacoes (
  id uuid primary key default uuid_generate_v4(),
  texto text not null,
  autor text not null default 'Agente Prolu',
  created_at timestamptz default now()
);
alter table citacoes enable row level security;
create policy "todos leem citações" on citacoes for select using (true);
create policy "master gerencia citações" on citacoes for all using (auth_is_master());

-- ════════════════════════════════════════════════════════════════
-- 4. BASE DE CONHECIMENTO — Pasta/Curso → Módulo → Aula
-- ════════════════════════════════════════════════════════════════

create table kb_pastas (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  subtitulo text,
  cor_capa text default 'green' check (cor_capa in ('green', 'blue', 'orange')),
  ordem int default 0,
  created_at timestamptz default now()
);

create table kb_modulos (
  id uuid primary key default uuid_generate_v4(),
  pasta_id uuid references kb_pastas(id) on delete cascade,
  titulo text not null,
  ordem int default 0,
  created_at timestamptz default now()
);

create table kb_aulas (
  id uuid primary key default uuid_generate_v4(),
  modulo_id uuid references kb_modulos(id) on delete cascade,
  titulo text not null,
  descricao text,
  youtube_url text,
  ordem int default 0,
  created_at timestamptz default now()
);

create table kb_aula_pdfs (
  id uuid primary key default uuid_generate_v4(),
  aula_id uuid references kb_aulas(id) on delete cascade,
  nome text not null,
  arquivo_url text not null
);

-- Progresso por usuário
create table kb_progresso (
  usuario_id uuid references usuarios(id) on delete cascade,
  aula_id uuid references kb_aulas(id) on delete cascade,
  concluida boolean default false,
  concluida_em timestamptz,
  primary key (usuario_id, aula_id)
);

alter table kb_pastas enable row level security;
alter table kb_modulos enable row level security;
alter table kb_aulas enable row level security;
alter table kb_aula_pdfs enable row level security;
alter table kb_progresso enable row level security;

create policy "todos leem pastas" on kb_pastas for select using (true);
create policy "master gerencia pastas" on kb_pastas for all using (auth_is_master());
create policy "todos leem modulos" on kb_modulos for select using (true);
create policy "master gerencia modulos" on kb_modulos for all using (auth_is_master());
create policy "todos leem aulas" on kb_aulas for select using (true);
create policy "master gerencia aulas" on kb_aulas for all using (auth_is_master());
create policy "todos leem pdfs" on kb_aula_pdfs for select using (true);
create policy "master gerencia pdfs" on kb_aula_pdfs for all using (auth_is_master());
create policy "usuario gerencia seu progresso" on kb_progresso
  for all using (usuario_id = (select id from usuarios where auth_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════
-- 5. CRM — colunas dinâmicas tipo Notion
-- ════════════════════════════════════════════════════════════════

create table crm_colunas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('text', 'number', 'money', 'date', 'select', 'checkbox', 'client', 'tags')),
  fixo boolean not null default false,
  ordem int default 0,
  opcoes jsonb default '[]', -- [{ value, color }] para tipo "select"
  created_at timestamptz default now()
);

create table crm_linhas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  valores jsonb not null default '{}', -- { coluna_id: valor }
  created_by uuid references usuarios(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table crm_colunas enable row level security;
alter table crm_linhas enable row level security;

create policy "empresa vê suas colunas" on crm_colunas for select using (empresa_id = auth_empresa_id());
create policy "empresa gerencia suas colunas" on crm_colunas for all using (empresa_id = auth_empresa_id());
create policy "empresa vê suas linhas" on crm_linhas for select using (empresa_id = auth_empresa_id());
create policy "empresa gerencia suas linhas" on crm_linhas for all using (empresa_id = auth_empresa_id());

-- ════════════════════════════════════════════════════════════════
-- 6. PLANO PRÁTICO — tags + ações
-- ════════════════════════════════════════════════════════════════

create table plano_tags (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  cor text not null default '#CBE921',
  created_at timestamptz default now()
);

create table plano_acoes (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  tag_id uuid references plano_tags(id) on delete set null,
  texto text not null default '',
  status text not null default 'pend' check (status in ('pend', 'prog', 'done')),
  responsavel_id uuid references usuarios(id),
  ordem int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table plano_tags enable row level security;
alter table plano_acoes enable row level security;

create policy "empresa vê suas tags" on plano_tags for select using (empresa_id = auth_empresa_id());
create policy "empresa gerencia suas tags" on plano_tags for all using (empresa_id = auth_empresa_id());
create policy "empresa vê suas ações" on plano_acoes for select using (empresa_id = auth_empresa_id());
create policy "empresa gerencia suas ações" on plano_acoes for all using (empresa_id = auth_empresa_id());

-- ════════════════════════════════════════════════════════════════
-- 7. CLIENTE IDEAL — perfis de ICP
-- ════════════════════════════════════════════════════════════════

create table icp_perfis (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  cor text default '#3a6ea5',
  idade_min int default 25,
  idade_max int default 45,
  demografico text,
  psicografico text,
  gatilhos text,
  dores text,
  desejos text,
  canais jsonb default '[]', -- array de strings
  onde_encontrar text,
  pagamento jsonb default '[]', -- array de strings: "Parcelado" | "À vista c/ desconto"
  orcamento text,
  gap text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table icp_perfis enable row level security;
create policy "empresa vê seus perfis" on icp_perfis for select using (empresa_id = auth_empresa_id());
create policy "empresa gerencia seus perfis" on icp_perfis for all using (empresa_id = auth_empresa_id());

-- ════════════════════════════════════════════════════════════════
-- 8. INDICADORES — meta anual + resultado trimestral
-- ════════════════════════════════════════════════════════════════

create table indicadores (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  unidade text not null default 'R$' check (unidade in ('R$', '#', '%')),
  grupo text default 'Geral',
  created_at timestamptz default now()
);

create table indicador_metas (
  id uuid primary key default uuid_generate_v4(),
  indicador_id uuid references indicadores(id) on delete cascade,
  ano int not null,
  meta numeric not null,
  unique (indicador_id, ano)
);

create table indicador_resultados (
  id uuid primary key default uuid_generate_v4(),
  indicador_id uuid references indicadores(id) on delete cascade,
  ano int not null,
  trimestre int not null check (trimestre between 1 and 4),
  valor numeric,
  updated_at timestamptz default now(),
  unique (indicador_id, ano, trimestre)
);

alter table indicadores enable row level security;
alter table indicador_metas enable row level security;
alter table indicador_resultados enable row level security;

create policy "empresa vê seus indicadores" on indicadores for select using (empresa_id = auth_empresa_id());
create policy "empresa gerencia seus indicadores" on indicadores for all using (empresa_id = auth_empresa_id());
create policy "empresa vê suas metas" on indicador_metas for select using (
  indicador_id in (select id from indicadores where empresa_id = auth_empresa_id())
);
create policy "empresa gerencia suas metas" on indicador_metas for all using (
  indicador_id in (select id from indicadores where empresa_id = auth_empresa_id())
);
create policy "empresa vê seus resultados" on indicador_resultados for select using (
  indicador_id in (select id from indicadores where empresa_id = auth_empresa_id())
);
create policy "empresa gerencia seus resultados" on indicador_resultados for all using (
  indicador_id in (select id from indicadores where empresa_id = auth_empresa_id())
);

-- ════════════════════════════════════════════════════════════════
-- 9. LEGADO — Precificação (migração futura do Firestore)
-- Estrutura projetada para receber os dados do app FlutterFlow atual.
-- Não usada pelas telas hoje; criada para já existir quando o módulo
-- Precificação for ligado ao CRM ("Precificar projeto").
-- ════════════════════════════════════════════════════════════════

create table etiquetas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  cor text,
  created_at timestamptz default now()
);

create table valorhora_cenarios (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  valor_hora numeric not null,
  created_at timestamptz default now()
);

create table modelos_etapas (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  created_at timestamptz default now()
);

create table modelo_etapa_grupos (
  id uuid primary key default uuid_generate_v4(),
  modelo_id uuid references modelos_etapas(id) on delete cascade,
  nome text not null,
  ordem int default 0
);

create table modelo_etapa_itens (
  id uuid primary key default uuid_generate_v4(),
  grupo_id uuid references modelo_etapa_grupos(id) on delete cascade,
  nome text not null,
  horas_estimadas numeric default 0,
  ordem int default 0
);

create table projetos (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  crm_linha_id uuid references crm_linhas(id) on delete set null, -- vincula ao CRM
  nome_projeto text not null,
  metro_quadrado numeric,
  complexidade text,
  emissao_nf boolean default false,
  emissao_nf_valor numeric,
  created_at timestamptz default now()
);

create table projeto_etapas (
  id uuid primary key default uuid_generate_v4(),
  projeto_id uuid references projetos(id) on delete cascade,
  nome text not null,
  ordem int default 0
);

create table projeto_etapa_itens (
  id uuid primary key default uuid_generate_v4(),
  etapa_id uuid references projeto_etapas(id) on delete cascade,
  nome text not null,
  horas numeric default 0,
  ordem int default 0
);

create table projeto_custos_extras (
  id uuid primary key default uuid_generate_v4(),
  projeto_id uuid references projetos(id) on delete cascade,
  descricao text not null,
  valor numeric not null default 0
);

create table orcamentos (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid references empresas(id) on delete cascade,
  projeto_id uuid references projetos(id) on delete set null,
  nome_projeto text not null,
  complexidade text,
  margem_lucro numeric default 0,
  metro_quadrado numeric,
  valor_hora_orcamento numeric,
  valor_margem numeric,
  valor_sem_margem numeric,
  valor_projeto numeric,
  total_horas numeric,
  total_custos_extras numeric,
  emissao_nf boolean default false,
  emissao_nf_valor numeric,
  timestamp_orcamento timestamptz default now()
);

create table orcamento_etapas (
  id uuid primary key default uuid_generate_v4(),
  orcamento_id uuid references orcamentos(id) on delete cascade,
  nome text not null,
  ordem int default 0
);

create table orcamento_etapa_itens (
  id uuid primary key default uuid_generate_v4(),
  etapa_id uuid references orcamento_etapas(id) on delete cascade,
  nome text not null,
  horas numeric default 0,
  ordem int default 0
);

create table orcamento_custos_extras (
  id uuid primary key default uuid_generate_v4(),
  orcamento_id uuid references orcamentos(id) on delete cascade,
  descricao text not null,
  valor numeric not null default 0
);

-- RLS legado (mesmo padrão: isolado por empresa)
alter table etiquetas enable row level security;
alter table valorhora_cenarios enable row level security;
alter table modelos_etapas enable row level security;
alter table modelo_etapa_grupos enable row level security;
alter table modelo_etapa_itens enable row level security;
alter table projetos enable row level security;
alter table projeto_etapas enable row level security;
alter table projeto_etapa_itens enable row level security;
alter table projeto_custos_extras enable row level security;
alter table orcamentos enable row level security;
alter table orcamento_etapas enable row level security;
alter table orcamento_etapa_itens enable row level security;
alter table orcamento_custos_extras enable row level security;

create policy "empresa vê suas etiquetas" on etiquetas for all using (empresa_id = auth_empresa_id());
create policy "empresa vê seus cenários" on valorhora_cenarios for all using (empresa_id = auth_empresa_id());
create policy "empresa vê seus modelos" on modelos_etapas for all using (empresa_id = auth_empresa_id());
create policy "empresa vê grupos de seus modelos" on modelo_etapa_grupos for all using (
  modelo_id in (select id from modelos_etapas where empresa_id = auth_empresa_id())
);
create policy "empresa vê itens de seus modelos" on modelo_etapa_itens for all using (
  grupo_id in (select id from modelo_etapa_grupos where modelo_id in (select id from modelos_etapas where empresa_id = auth_empresa_id()))
);
create policy "empresa vê seus projetos" on projetos for all using (empresa_id = auth_empresa_id());
create policy "empresa vê etapas de seus projetos" on projeto_etapas for all using (
  projeto_id in (select id from projetos where empresa_id = auth_empresa_id())
);
create policy "empresa vê itens de etapas de projetos" on projeto_etapa_itens for all using (
  etapa_id in (select id from projeto_etapas where projeto_id in (select id from projetos where empresa_id = auth_empresa_id()))
);
create policy "empresa vê custos extras de projetos" on projeto_custos_extras for all using (
  projeto_id in (select id from projetos where empresa_id = auth_empresa_id())
);
create policy "empresa vê seus orçamentos" on orcamentos for all using (empresa_id = auth_empresa_id());
create policy "empresa vê etapas de seus orçamentos" on orcamento_etapas for all using (
  orcamento_id in (select id from orcamentos where empresa_id = auth_empresa_id())
);
create policy "empresa vê itens de etapas de orçamentos" on orcamento_etapa_itens for all using (
  etapa_id in (select id from orcamento_etapas where orcamento_id in (select id from orcamentos where empresa_id = auth_empresa_id()))
);
create policy "empresa vê custos extras de orçamentos" on orcamento_custos_extras for all using (
  orcamento_id in (select id from orcamentos where empresa_id = auth_empresa_id())
);

-- ════════════════════════════════════════════════════════════════
-- FIM
-- Próximo passo manual: criar o primeiro registro em "empresas" e
-- o usuário master em "usuarios" apontando para o auth_id do André
-- (depois de ele se cadastrar via Supabase Auth).
-- ════════════════════════════════════════════════════════════════
