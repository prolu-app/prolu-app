-- ════════════════════════════════════════════════════════════════
-- Desfaz a migration_061 (proteção de `usuarios`).
-- ATENÇÃO: volta ao estado inseguro de antes (comum muda o próprio role,
-- INSERT aceita qualquer empresa). Só use se a 061 quebrar um fluxo e
-- rode a 061 de novo assim que corrigir.
-- Remove também empresas.criado_por (o valor gravado desde a 061 se perde).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════

-- 1. Gatilhos
drop trigger if exists usuarios_protege on usuarios;
drop trigger if exists usuarios_marca_convite_aceito on usuarios;
drop trigger if exists empresas_registra_criador on empresas;

-- 2. Funções
drop function if exists usuarios_protege();
drop function if exists usuarios_marca_convite_aceito();
drop function if exists empresas_registra_criador();
drop function if exists usuarios_ator();
drop function if exists usuarios_empresa_existe(uuid);
drop function if exists usuarios_pode_fundar(uuid);
drop function if exists usuarios_convite_valido(uuid, text);
drop function if exists usuarios_masters_restantes(uuid, uuid);

-- 3. Coluna
alter table empresas drop column if exists criado_por;

-- 4. Policies como estavam (sem with_check)
drop policy if exists "usuario edita o próprio registro" on usuarios;
create policy "usuario edita o próprio registro" on usuarios
  for update using (auth_id = auth.uid());

drop policy if exists "master gerencia usuarios da empresa" on usuarios;
create policy "master gerencia usuarios da empresa" on usuarios
  for all using (empresa_id = auth_empresa_id() and auth_is_empresa_master());

-- 5. Grants como estavam (padrão do Supabase)
grant truncate, trigger, references on usuarios to anon, authenticated;
grant insert, update, delete on usuarios to anon;

notify pgrst, 'reload schema';
