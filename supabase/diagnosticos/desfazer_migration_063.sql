-- ════════════════════════════════════════════════════════════════
-- Desfaz a REVISÃO de regra da migration_063 (Gestão de Projetos: Base) e
-- volta à 063 original:
--   projeto           → só o master grava (policy "projetos: master grava")
--   etapa (nível 1)   → criar/excluir/renomear/reordenar só o master; gestor
--                       e comum mudam só status, datas e responsável
--                       (gatilho projeto_itens_2_permissao)
-- NÃO apaga tabela nem dado. Lembre de voltar também o front
-- (src/utils/projetos.js e as telas de /projetos).
-- Projetos que o gestor criou continuam existindo; só param de ser editáveis
-- por ele. Idempotente.
--
-- Remoção TOTAL da 063 (apaga tabelas e dados): veja a Parte B no fim,
-- comentada de propósito.
-- ════════════════════════════════════════════════════════════════

-- 1. Projeto: de volta a só master
drop policy if exists "projetos: master e gestor gravam" on projetos;
drop policy if exists "projetos: master grava" on projetos;
create policy "projetos: master grava" on projetos for all to authenticated
  using (fin_pode_gravar(empresa_id)) with check (fin_pode_gravar(empresa_id));

drop trigger if exists projetos_permissao on projetos;
drop function if exists projetos_permissao();
drop function if exists proj_pode_gravar(uuid, text);

-- 2. Etapa: de volta à regra de gestor/comum só status, datas e responsável
create or replace function projeto_itens_permissao()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nivel smallint;
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- master (e prolu_admin no escritório dele) pode tudo; a RLS limita o escritório
  if coalesce(auth_is_empresa_master(), false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_nivel := case when tg_op = 'DELETE' then old.nivel else new.nivel end;
  if v_nivel <> 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Só o master cria etapas.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Só o master exclui etapas.' using errcode = '42501';
  end if;

  -- UPDATE de etapa: só status, datas e responsável (o resto que muda aqui
  -- é calculado pelo gatilho de integridade)
  if (to_jsonb(new) - array['status', 'data_inicio', 'prazo', 'responsavel_id',
                            'concluido_em', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['status', 'data_inicio', 'prazo', 'responsavel_id',
                            'concluido_em', 'updated_at']) then
    raise exception 'Na etapa, você só altera status, datas e responsável.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists projeto_itens_2_permissao on projeto_itens;
create trigger projeto_itens_2_permissao before insert or update or delete on projeto_itens
  for each row execute function projeto_itens_permissao();

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════
-- Parte B — remoção TOTAL da 063 (APAGA projetos, projeto_financeiro e
-- projeto_itens com TODOS os dados e volta empresa_libera() à 055).
-- Só se quiser tirar a Gestão de Projetos inteira: tire os "--" e rode.
-- Antes: select count(*) from projetos;  select count(*) from projeto_itens;
-- ════════════════════════════════════════════════════════════════
-- drop table if exists projeto_itens;
-- drop table if exists projeto_financeiro;
-- drop table if exists projetos;
-- drop function if exists projeto_itens_permissao();
-- drop function if exists projetos_permissao();
-- drop function if exists projeto_itens_integridade();
-- drop function if exists projeto_financeiro_antes_gravar();
-- drop function if exists projetos_antes_gravar();
-- drop function if exists proj_itens_pode_gravar(uuid);
-- drop function if exists proj_itens_pode_ver(uuid);
-- drop function if exists proj_pode_gravar(uuid, text);
-- drop function if exists proj_pode_ver(uuid, text);
-- drop function if exists proj_empresa(uuid);
-- create or replace function empresa_libera(p_empresa_id uuid, p_recurso text) returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select coalesce((
--     select e.status_conta = 'ativa'
--        and plano_nivel(e.plano) >= plano_nivel(case p_recurso
--              when 'painel_comercial'     then 'pro'
--              when 'indicadores'          then 'pro'
--              when 'selo_removivel'       then 'pro'
--              when 'equipe_convites'      then 'business'
--              when 'base_propria'         then 'business'
--              when 'kb_painel'            then 'business'
--              when 'ferramentas_mentoria' then 'mentoria'
--            end)
--       from empresas e
--      where e.id = p_empresa_id
--   ), false)
-- $$;
-- revoke all on function empresa_libera(uuid, text) from public, anon;
-- grant execute on function empresa_libera(uuid, text) to authenticated, service_role;
-- notify pgrst, 'reload schema';
