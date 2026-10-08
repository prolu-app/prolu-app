-- ════════════════════════════════════════════════════════════════
-- MIGRATION 045 — Planos e status da conta (Passo 1: fundação)
-- Rodar no SQL Editor do Supabase ANTES de publicar as Edge Functions
-- (invite-user, formulario-publico) e o front novo.
-- Idempotente: pode rodar de novo sem sobrescrever planos já alterados.
--
-- empresas.plano        — starter < pro < business < mentoria < consultoria
--                         (rótulos e matriz do front em src/utils/planos.js)
-- empresas.status_conta — ativa | suspensa | encerrando (separado do plano)
--
-- Regras no servidor:
--   auth_empresa_id()   → NULL quando a conta não está ativa: todas as
--                          policies "empresa_id = auth_empresa_id()" deixam
--                          de devolver/aceitar dados do escritório
--   conta_atual()       → plano/status da empresa do usuário logado (lido
--                          mesmo com a conta suspensa, para a tela de aviso)
--   empresa_libera()    → mesma matriz recurso → plano mínimo de planos.js;
--                          usada nas policies de escrita e no invite-user
--   pagina_publica()    → null quando o escritório não está ativo
--   trigger em empresas → só a Prolu (prolu_admin, service role ou SQL
--                          Editor) altera plano/status; cadastro novo nasce
--                          starter/ativa
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Colunas ─────────
-- plano: o backfill (todos os escritórios atuais = mentoria) só roda quando a
-- coluna é criada agora. Rodar de novo não toca nos planos já alterados.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'empresas' and column_name = 'plano'
  ) then
    alter table empresas add column plano text not null default 'starter';
    update empresas set plano = 'mentoria';
  end if;
end $$;

alter table empresas drop constraint if exists empresas_plano_check;
alter table empresas add constraint empresas_plano_check
  check (plano in ('starter', 'pro', 'business', 'mentoria', 'consultoria'));

alter table empresas add column if not exists status_conta text not null default 'ativa';
alter table empresas drop constraint if exists empresas_status_conta_check;
alter table empresas add constraint empresas_status_conta_check
  check (status_conta in ('ativa', 'suspensa', 'encerrando'));

alter table empresas add column if not exists suspensa_em timestamptz;
alter table empresas add column if not exists suspensao_motivo text;
alter table empresas add column if not exists exclusao_programada_em date;

-- ───────── 2. Só a Prolu altera plano e status ─────────
-- A policy "master atualiza a própria empresa" (migration_011) libera UPDATE
-- na linha inteira — sem isso o master trocaria o próprio plano pela API.
-- auth.uid() nulo = service role (futuro webhook Asaas) ou SQL Editor.
create or replace function empresas_protege_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(auth_is_prolu_admin(), false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- cadastro pelo app (Onboarding): sempre começa no grátis e ativa
    new.plano := 'starter';
    new.status_conta := 'ativa';
    new.suspensa_em := null;
    new.suspensao_motivo := null;
    new.exclusao_programada_em := null;
    return new;
  end if;

  if new.plano is distinct from old.plano
     or new.status_conta is distinct from old.status_conta
     or new.suspensa_em is distinct from old.suspensa_em
     or new.suspensao_motivo is distinct from old.suspensao_motivo
     or new.exclusao_programada_em is distinct from old.exclusao_programada_em then
    raise exception 'Plano e status da conta só podem ser alterados pela Prolu.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists empresas_protege_plano on empresas;
create trigger empresas_protege_plano before insert or update on empresas
  for each row execute function empresas_protege_plano();

-- ───────── 3. Empresa do usuário só vale com a conta ativa ─────────
-- Mesma função de schema.sql, agora exigindo status_conta = 'ativa'.
-- prolu_admin: a própria empresa (Prolu) segue ativa, e o acesso dele aos
-- outros escritórios passa pelas policies com auth_is_prolu_admin(), que
-- não dependem desta função.
create or replace function auth_empresa_id() returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.empresa_id
    from usuarios u
    join empresas e on e.id = u.empresa_id
   where u.auth_id = auth.uid()
     and e.status_conta = 'ativa'
$$;

-- Com a conta suspensa, "usuarios veem colegas da empresa" deixa de devolver
-- até o próprio registro — o app acharia que a pessoa não tem cadastro e
-- abriria o Onboarding (criar escritório novo). O próprio registro continua
-- visível para o app mostrar a tela de conta suspensa.
drop policy if exists "usuario vê o próprio registro" on usuarios;
create policy "usuario vê o próprio registro" on usuarios
  for select using (auth_id = auth.uid());

-- ───────── 4. conta_atual() ─────────
create or replace function conta_atual()
returns table (empresa_id uuid, nome text, plano text, status_conta text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.plano, e.status_conta
    from usuarios u
    join empresas e on e.id = u.empresa_id
   where u.auth_id = auth.uid()
$$;
revoke all on function conta_atual() from public, anon;
grant execute on function conta_atual() to authenticated;

-- ───────── 5. Matriz recurso → plano mínimo (espelho de src/utils/planos.js) ─────────
create or replace function plano_nivel(p_plano text) returns int
language sql
immutable
set search_path = public
as $$
  select array_position(array['starter', 'pro', 'business', 'mentoria', 'consultoria']::text[], p_plano)
$$;

-- true quando a empresa está ativa e o plano dela alcança o recurso.
-- Recurso desconhecido = false (fecha por padrão).
create or replace function empresa_libera(p_empresa_id uuid, p_recurso text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.status_conta = 'ativa'
       and plano_nivel(e.plano) >= plano_nivel(case p_recurso
             when 'painel_comercial'     then 'pro'
             when 'indicadores'          then 'pro'
             when 'equipe_convites'      then 'business'
             when 'ferramentas_mentoria' then 'mentoria'
           end)
      from empresas e
     where e.id = p_empresa_id
  ), false)
$$;
revoke all on function empresa_libera(uuid, text) from public, anon;
grant execute on function empresa_libera(uuid, text) to authenticated, service_role;

-- ───────── 6. Escrita só com o plano certo (vitrine = leitura) ─────────
-- Policies RESTRICTIVE: somam-se às existentes (AND) só para insert/update/
-- delete. A leitura continua igual — a tela bloqueada mostra os dados reais.

-- Indicadores (pro)
drop policy if exists "plano libera insert" on indicadores;
drop policy if exists "plano libera update" on indicadores;
drop policy if exists "plano libera delete" on indicadores;
create policy "plano libera insert" on indicadores as restrictive for insert
  with check (empresa_libera(empresa_id, 'indicadores'));
create policy "plano libera update" on indicadores as restrictive for update
  using (empresa_libera(empresa_id, 'indicadores')) with check (empresa_libera(empresa_id, 'indicadores'));
create policy "plano libera delete" on indicadores as restrictive for delete
  using (empresa_libera(empresa_id, 'indicadores'));

drop policy if exists "plano libera insert" on indicador_metas;
drop policy if exists "plano libera update" on indicador_metas;
drop policy if exists "plano libera delete" on indicador_metas;
create policy "plano libera insert" on indicador_metas as restrictive for insert
  with check (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'));
create policy "plano libera update" on indicador_metas as restrictive for update
  using (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'))
  with check (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'));
create policy "plano libera delete" on indicador_metas as restrictive for delete
  using (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'));

drop policy if exists "plano libera insert" on indicador_resultados;
drop policy if exists "plano libera update" on indicador_resultados;
drop policy if exists "plano libera delete" on indicador_resultados;
create policy "plano libera insert" on indicador_resultados as restrictive for insert
  with check (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'));
create policy "plano libera update" on indicador_resultados as restrictive for update
  using (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'))
  with check (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'));
create policy "plano libera delete" on indicador_resultados as restrictive for delete
  using (empresa_libera((select i.empresa_id from indicadores i where i.id = indicador_id), 'indicadores'));

-- Plano Prático e Cliente Ideal (mentoria)
drop policy if exists "plano libera insert" on plano_tags;
drop policy if exists "plano libera update" on plano_tags;
drop policy if exists "plano libera delete" on plano_tags;
create policy "plano libera insert" on plano_tags as restrictive for insert
  with check (empresa_libera(empresa_id, 'ferramentas_mentoria'));
create policy "plano libera update" on plano_tags as restrictive for update
  using (empresa_libera(empresa_id, 'ferramentas_mentoria')) with check (empresa_libera(empresa_id, 'ferramentas_mentoria'));
create policy "plano libera delete" on plano_tags as restrictive for delete
  using (empresa_libera(empresa_id, 'ferramentas_mentoria'));

drop policy if exists "plano libera insert" on plano_acoes;
drop policy if exists "plano libera update" on plano_acoes;
drop policy if exists "plano libera delete" on plano_acoes;
create policy "plano libera insert" on plano_acoes as restrictive for insert
  with check (empresa_libera(empresa_id, 'ferramentas_mentoria'));
create policy "plano libera update" on plano_acoes as restrictive for update
  using (empresa_libera(empresa_id, 'ferramentas_mentoria')) with check (empresa_libera(empresa_id, 'ferramentas_mentoria'));
create policy "plano libera delete" on plano_acoes as restrictive for delete
  using (empresa_libera(empresa_id, 'ferramentas_mentoria'));

drop policy if exists "plano libera insert" on icp_perfis;
drop policy if exists "plano libera update" on icp_perfis;
drop policy if exists "plano libera delete" on icp_perfis;
create policy "plano libera insert" on icp_perfis as restrictive for insert
  with check (empresa_libera(empresa_id, 'ferramentas_mentoria'));
create policy "plano libera update" on icp_perfis as restrictive for update
  using (empresa_libera(empresa_id, 'ferramentas_mentoria')) with check (empresa_libera(empresa_id, 'ferramentas_mentoria'));
create policy "plano libera delete" on icp_perfis as restrictive for delete
  using (empresa_libera(empresa_id, 'ferramentas_mentoria'));

-- Convites (business): a policy de convites permite insert direto pela API,
-- e um convite pendente basta para alguém entrar no escritório no cadastro.
-- Cancelar convite (delete) continua liberado.
drop policy if exists "plano libera insert" on convites;
create policy "plano libera insert" on convites as restrictive for insert
  with check (empresa_libera(empresa_id, 'equipe_convites'));

-- ───────── 7. Minha Página: escritório não ativo = indisponível ─────────
-- mesma função da migration_042, com e.status_conta = 'ativa' no where
create or replace function pagina_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'escritorio', e.nome,
    'slug', e.slug,
    'config', e.pagina_config,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'tipo', l.tipo,
               'titulo', l.titulo,
               'url', case when l.tipo = 'link' then l.url end,
               'slug_formulario', f.slug,
               'estilo', l.estilo,
               'imagem_url', l.imagem_url,
               'imagem_modo', case when l.imagem_url is not null then coalesce(l.imagem_modo, 'icone') end
             ) order by l.ordem, l.created_at)
        from pagina_links l
        left join formularios f
          on l.tipo = 'formulario' and f.id = l.formulario_id and f.empresa_id = l.empresa_id and f.ativo
       where l.empresa_id = e.id
         and l.ativo
         and l.titulo <> ''
         and ((l.tipo = 'link' and l.url is not null) or (l.tipo = 'formulario' and f.id is not null))
    ), '[]'::jsonb)
  )
  from empresas e
  where e.slug = lower(trim(coalesce(p_slug, '')))
    and e.pagina_config->>'publicada' = 'true'
    and e.status_conta = 'ativa'
$$;
revoke all on function pagina_publica(text) from public;
grant execute on function pagina_publica(text) to anon, authenticated;

notify pgrst, 'reload schema';
