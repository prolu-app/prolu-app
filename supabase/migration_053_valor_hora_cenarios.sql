-- ════════════════════════════════════════════════════════════════
-- migration_053 — Valor-hora: cenários de custo-hora do escritório
--
-- Ferramenta de REFERÊNCIA (tela /precificacao/valor-hora), independente da
-- Precificação: nada aqui é lido pelas precificações.
--
-- `dados` guarda só as ENTRADAS do cenário (custos da estrutura, equipe,
-- horas, ocupação…). Os resultados são calculados no front
-- (src/utils/valorHora.js), para as fórmulas evoluírem sem migration. O front
-- normaliza o jsonb com lista fechada de campos (normalizarDados).
--
-- A tabela legada `valorhora_cenarios` (schema.sql, nunca usada) fica como
-- está: guarda um único valor_hora obrigatório e a policy dela não exige
-- master. Esta tabela a substitui.
--
-- Acesso (mesma regra da Precificação, AuthContext.acesso.precificacao):
--   lê:      master/prolu_admin do próprio escritório, ou prolu_admin em qualquer um
--   escreve: master/prolu_admin só no próprio escritório
--   conta inativa: auth_empresa_id() devolve NULL → sem acesso
--
-- Idempotente: pode rodar de novo sem efeito colateral.
-- ════════════════════════════════════════════════════════════════

-- 1. Tabela ──────────────────────────────────────────────────────────────
create table if not exists valor_hora_cenarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null default 'Novo cenário',
  dados jsonb not null default '{}'::jsonb,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table valor_hora_cenarios drop constraint if exists valor_hora_cenarios_valida;
alter table valor_hora_cenarios add constraint valor_hora_cenarios_valida check (
  char_length(nome) between 1 and 120
  and jsonb_typeof(dados) = 'object'
  and pg_column_size(dados) <= 200000
);

create index if not exists valor_hora_cenarios_empresa_idx
  on valor_hora_cenarios (empresa_id, updated_at desc);

-- 2. updated_at (mesmo padrão de pagina_links_touch, migration_041) ───────
create or replace function valor_hora_cenarios_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists valor_hora_cenarios_touch on valor_hora_cenarios;
create trigger valor_hora_cenarios_touch before update on valor_hora_cenarios
  for each row execute function valor_hora_cenarios_touch();

-- 3. RLS ─────────────────────────────────────────────────────────────────
alter table valor_hora_cenarios enable row level security;

drop policy if exists "valor_hora_cenarios: le proprio escritorio ou prolu_admin" on valor_hora_cenarios;
create policy "valor_hora_cenarios: le proprio escritorio ou prolu_admin" on valor_hora_cenarios
  for select using (
    (empresa_id = auth_empresa_id() and auth_is_empresa_master())
    or auth_is_prolu_admin()
  );

drop policy if exists "valor_hora_cenarios: master escreve no proprio escritorio" on valor_hora_cenarios;
create policy "valor_hora_cenarios: master escreve no proprio escritorio" on valor_hora_cenarios
  for all using (empresa_id = auth_empresa_id() and auth_is_empresa_master())
  with check (empresa_id = auth_empresa_id() and auth_is_empresa_master());

notify pgrst, 'reload schema';
