-- ════════════════════════════════════════════════════════════════
-- MIGRATION 010 — nivel_acesso em kb_pastas
-- Rodar no SQL Editor do Supabase.
--
-- Permite restringir a visibilidade de uma pasta da Base de
-- Conhecimento a 'todos' (padrão), 'gestor' (gestor e acima) ou
-- 'master' (só master/prolu_admin da empresa).
-- ════════════════════════════════════════════════════════════════

-- 1. Campo novo, com default e constraint.
alter table kb_pastas
  add column if not exists nivel_acesso text default 'todos'
  check (nivel_acesso in ('todos', 'gestor', 'master'));

-- 2. Garante que linhas existentes (criadas antes da coluna existir)
-- ficam abertas pra todo mundo, e não escondidas por acidente.
update kb_pastas set nivel_acesso = 'todos' where nivel_acesso is null;

-- 3. Policy de leitura respeitando nivel_acesso.
--
-- IMPORTANTE: usa auth_is_empresa_master() — não auth_is_master().
-- Desde a migration_001, auth_is_master() foi realocada para apontar
-- pra auth_is_prolu_admin() (mantida só por compatibilidade com as
-- policies de conteúdo Prolu). Usar auth_is_master() aqui faria uma
-- pasta 'master' só aparecer pra prolu_admin — excluindo o master da
-- própria empresa, que é exatamente quem essa opção deveria liberar.
drop policy if exists "usuario ve pastas" on kb_pastas;
create policy "usuario ve pastas" on kb_pastas
  for select using (
    auth_is_prolu_admin()
    or (
      (empresa_id is null or empresa_id = auth_empresa_id())
      and (
        nivel_acesso = 'todos'
        or (nivel_acesso = 'gestor' and auth_is_gestor_ou_superior())
        or (nivel_acesso = 'master' and auth_is_empresa_master())
      )
    )
  );
