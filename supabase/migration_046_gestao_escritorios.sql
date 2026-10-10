-- ════════════════════════════════════════════════════════════════
-- MIGRATION 046 — Gestão de escritórios no prolu_admin (Passo 2)
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
-- Idempotente. Depende da migration_045 (plano/status_conta).
--
-- empresa_historico            — toda mudança de plano/status, com origem
-- trigger em empresas (AFTER)  — grava o histórico em QUALQUER caminho
--                                (tela do admin, SQL Editor, service role)
-- admin_alterar_plano()        — RPCs da tela de gestão: conferem
-- admin_alterar_status()         auth_is_prolu_admin() e marcam origem 'manual'
-- admin_escritorio_equipe()    — equipe + último login + avanço na Base de
--                                Conhecimento de um escritório (só admin)
--
-- ORIGEM do histórico: lida de duas configurações locais da transação,
--   prolu.origem ('manual' | 'asaas' | 'sistema') e prolu.motivo.
--   Sem prolu.origem = 'sistema' (SQL Editor, service role).
--   Webhook do Asaas (Passo 4): na mesma transação do UPDATE, rodar
--     select set_config('prolu.origem', 'asaas', true),
--            set_config('prolu.motivo', '<evento/cobrança>', true);
--   de preferência numa função própria chamada pela service role.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Histórico ─────────
create table if not exists empresa_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('plano', 'status')),
  valor_anterior text,
  valor_novo text,
  -- só para status 'encerrando': a data programada naquele momento
  exclusao_programada_em date,
  motivo text,
  origem text not null default 'sistema' check (origem in ('manual', 'asaas', 'sistema')),
  feito_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists empresa_historico_empresa_idx on empresa_historico (empresa_id, criado_em desc);

alter table empresa_historico enable row level security;
-- só leitura, só prolu_admin; escrita apenas pelo trigger (security definer)
drop policy if exists "prolu_admin le historico" on empresa_historico;
create policy "prolu_admin le historico" on empresa_historico
  for select using (auth_is_prolu_admin());
revoke insert, update, delete on empresa_historico from anon, authenticated;

-- ───────── 2. Trigger que registra toda mudança ─────────
create or replace function empresas_registra_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem text := coalesce(nullif(current_setting('prolu.origem', true), ''), 'sistema');
  v_motivo text := nullif(trim(coalesce(current_setting('prolu.motivo', true), '')), '');
  v_feito_por uuid;
begin
  if v_origem not in ('manual', 'asaas', 'sistema') then v_origem := 'sistema'; end if;
  if auth.uid() is not null then
    select id into v_feito_por from usuarios where auth_id = auth.uid();
  end if;

  if new.plano is distinct from old.plano then
    insert into empresa_historico (empresa_id, tipo, valor_anterior, valor_novo, motivo, origem, feito_por)
    values (new.id, 'plano', old.plano, new.plano, v_motivo, v_origem, v_feito_por);
  end if;

  if new.status_conta is distinct from old.status_conta
     or new.exclusao_programada_em is distinct from old.exclusao_programada_em then
    insert into empresa_historico (empresa_id, tipo, valor_anterior, valor_novo, exclusao_programada_em, motivo, origem, feito_por)
    values (new.id, 'status', old.status_conta, new.status_conta, new.exclusao_programada_em,
            coalesce(v_motivo, case when new.status_conta <> 'ativa' then new.suspensao_motivo end),
            v_origem, v_feito_por);
  end if;

  return null;
end $$;

drop trigger if exists empresas_registra_historico on empresas;
create trigger empresas_registra_historico
  after update of plano, status_conta, exclusao_programada_em on empresas
  for each row execute function empresas_registra_historico();

-- ───────── 3. RPCs de gestão (só prolu_admin) ─────────
-- UPDATE direto do front também passaria pelo trigger de proteção (045), mas
-- a RPC valida os dados, impede mexer na própria Prolu e marca a origem
-- 'manual' com o motivo, na mesma transação do UPDATE.
create or replace function admin_alterar_plano(p_empresa_id uuid, p_plano text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode alterar planos.' using errcode = '42501';
  end if;
  if plano_nivel(p_plano) is null then
    raise exception 'Plano inválido.' using errcode = '22023';
  end if;
  if p_empresa_id = (select empresa_id from usuarios where auth_id = auth.uid()) then
    raise exception 'A conta da própria Prolu não pode ser alterada por aqui.' using errcode = '42501';
  end if;
  if not exists (select 1 from empresas where id = p_empresa_id) then
    raise exception 'Escritório não encontrado.' using errcode = 'P0002';
  end if;

  perform set_config('prolu.origem', 'manual', true);
  perform set_config('prolu.motivo', coalesce(p_motivo, ''), true);
  update empresas set plano = p_plano where id = p_empresa_id and plano is distinct from p_plano;
end $$;
revoke all on function admin_alterar_plano(uuid, text, text) from public, anon;
grant execute on function admin_alterar_plano(uuid, text, text) to authenticated;

-- p_status: 'ativa' (reativar / cancelar encerramento), 'suspensa' (exige
-- motivo) ou 'encerrando' (exige data de exclusão >= hoje). Nenhum dado é
-- excluído aqui: exclusao_programada_em é só registro.
create or replace function admin_alterar_status(
  p_empresa_id uuid,
  p_status text,
  p_motivo text default null,
  p_exclusao_programada_em date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode alterar o status da conta.' using errcode = '42501';
  end if;
  if p_empresa_id = (select empresa_id from usuarios where auth_id = auth.uid()) then
    raise exception 'A conta da própria Prolu não pode ser alterada por aqui.' using errcode = '42501';
  end if;
  if not exists (select 1 from empresas where id = p_empresa_id) then
    raise exception 'Escritório não encontrado.' using errcode = 'P0002';
  end if;

  perform set_config('prolu.origem', 'manual', true);
  perform set_config('prolu.motivo', coalesce(v_motivo, ''), true);

  if p_status = 'ativa' then
    update empresas
       set status_conta = 'ativa', suspensa_em = null, suspensao_motivo = null, exclusao_programada_em = null
     where id = p_empresa_id;

  elsif p_status = 'suspensa' then
    if v_motivo is null then
      raise exception 'Informe o motivo da suspensão.' using errcode = '22023';
    end if;
    update empresas
       set status_conta = 'suspensa', suspensa_em = now(), suspensao_motivo = v_motivo, exclusao_programada_em = null
     where id = p_empresa_id;

  elsif p_status = 'encerrando' then
    if p_exclusao_programada_em is null or p_exclusao_programada_em < current_date then
      raise exception 'Informe uma data de exclusão a partir de hoje.' using errcode = '22023';
    end if;
    update empresas
       set status_conta = 'encerrando',
           suspensa_em = coalesce(suspensa_em, now()),
           suspensao_motivo = v_motivo,
           exclusao_programada_em = p_exclusao_programada_em
     where id = p_empresa_id;

  else
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
end $$;
revoke all on function admin_alterar_status(uuid, text, text, date) from public, anon;
grant execute on function admin_alterar_status(uuid, text, text, date) to authenticated;

-- ───────── 4. Equipe do escritório (detalhe) ─────────
-- ultimo_login: auth.users.last_sign_in_at (registrado pelo Supabase Auth a
-- cada login; não muda quando a sessão só é renovada).
-- Base de Conhecimento: mesma regra da aba "Painel" (BaseConhecimento.jsx →
-- PainelEquipe): aulas das pastas Prolu + do próprio escritório, filtradas
-- pelo nivel_acesso da pasta conforme o perfil de cada pessoa.
create or replace function admin_escritorio_equipe(p_empresa_id uuid)
returns table (
  usuario_id uuid,
  nome text,
  email text,
  role text,
  ultimo_login timestamptz,
  kb_total int,
  kb_concluidas int,
  kb_ultima_conclusao timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode ver estes dados.' using errcode = '42501';
  end if;

  return query
  with aulas as (
    select a.id, coalesce(p.nivel_acesso, 'todos') as nivel
      from kb_aulas a
      join kb_modulos m on m.id = a.modulo_id
      join kb_pastas p on p.id = m.pasta_id
     where p.empresa_id is null or p.empresa_id = p_empresa_id
  ),
  visiveis as (
    select u.id as uid, a.id as aula_id
      from usuarios u
      join aulas a on case a.nivel
                        when 'gestor' then u.role in ('gestor', 'master')
                        when 'master' then u.role = 'master'
                        else true
                      end
     where u.empresa_id = p_empresa_id
  )
  select u.id, u.nome, u.email, u.role, au.last_sign_in_at,
         (select count(*) from visiveis v where v.uid = u.id)::int,
         (select count(*) from visiveis v
            join kb_progresso kp on kp.aula_id = v.aula_id and kp.usuario_id = u.id and kp.concluida
           where v.uid = u.id)::int,
         (select max(kp.concluida_em) from visiveis v
            join kb_progresso kp on kp.aula_id = v.aula_id and kp.usuario_id = u.id and kp.concluida
           where v.uid = u.id)
    from usuarios u
    left join auth.users au on au.id = u.auth_id
   where u.empresa_id = p_empresa_id
   order by case u.role when 'master' then 0 when 'gestor' then 1 else 2 end, u.nome;
end $$;
revoke all on function admin_escritorio_equipe(uuid) from public, anon;
grant execute on function admin_escritorio_equipe(uuid) to authenticated;

notify pgrst, 'reload schema';
