-- ════════════════════════════════════════════════════════════════
-- MIGRATION 061 — Proteção de `usuarios` (Fase 0a, segurança)
-- Rodar no SQL Editor do Supabase DEPOIS de publicar a Edge Function
-- invite-user nova (ela não depende desta migration; a ordem evita uma
-- janela em que o banco aceita convite forjado como caminho de entrada).
-- Idempotente. Testes: diagnosticos/testar_migration_061.sql.
-- Desfazer: diagnosticos/desfazer_migration_061.sql.
--
-- Problema: as policies de UPDATE em `usuarios` não tinham with_check
-- próprio e protegiam só o auth_id. Pela API, um comum mudava o próprio
-- role/empresa_id, o master gravava prolu_admin, e o INSERT aceitava
-- qualquer role/empresa_id.
--
-- QUEM É RESTRINGIDO (gatilho usuarios_protege, SECURITY INVOKER):
--   current_user = 'anon'          → recusa qualquer escrita
--   current_user = 'authenticated' → regras abaixo
--   qualquer outro (service_role, postgres no SQL Editor, supabase_admin,
--   ações de FK em cascata, que rodam como dono da tabela) → passa
--   O PostgREST faz SET ROLE pelo JWT assinado: só vira service_role quem
--   tem a chave de serviço. Não usamos "auth.uid() is null" porque chamada
--   anônima também tem auth.uid() nulo.
--   ATENÇÃO: dentro de função SECURITY DEFINER o current_user vira o dono
--   da função. Por isso o gatilho é INVOKER e as consultas de papel ficam em
--   helpers DEFINER. Uma RPC DEFINER futura que grave em `usuarios` passa
--   direto por este gatilho e precisa validar por conta própria.
--
-- REGRAS (usuário logado, pela API):
--   INSERT → só o próprio registro, nunca prolu_admin, e só por um caminho:
--            (a) master de empresa criada pela própria pessoa
--                (empresas.criado_por) e ainda sem nenhum usuário; ou
--            (b) convite pendente com mesma empresa e role, para o e-mail
--                confirmado da pessoa em auth.users.
--   UPDATE → auth_id nunca muda; empresa_id só por prolu_admin; ninguém muda
--            o próprio role (exceto prolu_admin); comum não mexe em ninguém;
--            gestor só alterna gestor ⇄ comum de não-master do próprio
--            escritório e não mexe em outras colunas; master alterna
--            master/gestor/comum no próprio escritório, nunca toca em
--            prolu_admin e não rebaixa o último master.
--   DELETE → ninguém remove prolu_admin nem o último master do escritório.
--   prolu_admin pode tudo (exceto o INSERT, que é sempre só o próprio).
--   Escritório sendo apagado (a empresa não existe mais): a cascata
--   (empresa_id → null) e a remoção dos usuários passam sem "último master".
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. empresas.criado_por ─────────
-- Preenchido à força com auth.uid() no INSERT feito pela API. Empresas
-- antigas ficam com null: nenhum escritório órfão pode ser "fundado" de novo.
alter table empresas add column if not exists criado_por uuid
  references auth.users(id) on delete set null;

create or replace function empresas_registra_criador()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    return new;
  end if;

  if new.criado_por is distinct from old.criado_por then
    raise exception 'O criador do escritório não pode ser alterado.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists empresas_registra_criador on empresas;
create trigger empresas_registra_criador before insert or update on empresas
  for each row execute function empresas_registra_criador();

-- ───────── 2. Helpers (DEFINER: leem além do que a RLS mostra) ─────────
-- Quem está chamando: o próprio registro em usuarios, sem exigir conta ativa.
create or replace function usuarios_ator()
returns table (id uuid, role text, empresa_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.role, u.empresa_id from usuarios u where u.auth_id = auth.uid()
$$;

-- A empresa ainda existe? (a RLS esconde empresas alheias do authenticated)
create or replace function usuarios_empresa_existe(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from empresas e where e.id = p_empresa_id)
$$;

-- Caminho (a): empresa criada por mim e ainda sem nenhum usuário.
create or replace function usuarios_pode_fundar(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from empresas e where e.id = p_empresa_id and e.criado_por = auth.uid())
     and not exists (select 1 from usuarios u where u.empresa_id = p_empresa_id)
$$;

-- Caminho (b): convite pendente para o meu e-mail confirmado.
create or replace function usuarios_convite_valido(p_empresa_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from convites c
      join auth.users au on au.id = auth.uid()
     where c.empresa_id = p_empresa_id
       and c.role = p_role
       and c.status = 'pendente'
       and au.email_confirmed_at is not null
       and lower(c.email) = lower(au.email)
  )
$$;

-- Quantos masters sobram no escritório sem contar p_excluir. Trava as linhas
-- (FOR UPDATE) para dois masters não se rebaixarem ao mesmo tempo — no pior
-- caso o Postgres detecta o deadlock e aborta uma das duas transações.
-- VOLATILE de propósito: FOR UPDATE não é permitido em função STABLE.
create or replace function usuarios_masters_restantes(p_empresa_id uuid, p_excluir uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  perform 1 from usuarios
   where empresa_id = p_empresa_id and role = 'master'
   order by id
   for update;
  select count(*) into v_total from usuarios
   where empresa_id = p_empresa_id and role = 'master' and id <> p_excluir;
  return v_total;
end $$;

revoke all on function usuarios_ator() from public, anon;
revoke all on function usuarios_empresa_existe(uuid) from public, anon;
revoke all on function usuarios_pode_fundar(uuid) from public, anon;
revoke all on function usuarios_convite_valido(uuid, text) from public, anon;
revoke all on function usuarios_masters_restantes(uuid, uuid) from public, anon;
grant execute on function usuarios_ator() to authenticated;
grant execute on function usuarios_empresa_existe(uuid) to authenticated;
grant execute on function usuarios_pode_fundar(uuid) to authenticated;
grant execute on function usuarios_convite_valido(uuid, text) to authenticated;
grant execute on function usuarios_masters_restantes(uuid, uuid) to authenticated;

-- ───────── 3. Gatilho principal ─────────
create or replace function usuarios_protege()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ator record;
begin
  -- 3.1 service_role, SQL Editor, cascatas de FK: sem restrição
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if current_user = 'anon' or v_uid is null then
    raise exception 'Sem permissão para alterar usuários.' using errcode = '42501';
  end if;

  -- 3.2 INSERT: sempre só o próprio cadastro, nunca prolu_admin
  if tg_op = 'INSERT' then
    if new.auth_id is distinct from v_uid then
      raise exception 'Só é possível criar o próprio cadastro.' using errcode = '42501';
    end if;
    if new.role is null or new.role not in ('master', 'gestor', 'comum') then
      raise exception 'Papel não permitido no cadastro.' using errcode = '42501';
    end if;
    if new.empresa_id is null then
      raise exception 'Cadastro sem escritório.' using errcode = '42501';
    end if;
    if new.role = 'master' and usuarios_pode_fundar(new.empresa_id) then
      return new;
    end if;
    if usuarios_convite_valido(new.empresa_id, new.role) then
      return new;
    end if;
    raise exception 'Cadastro sem convite válido para este escritório.' using errcode = '42501';
  end if;

  -- 3.3 Escritório sendo apagado: a empresa já não existe
  if tg_op = 'DELETE' and old.empresa_id is not null
     and not usuarios_empresa_existe(old.empresa_id) then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.empresa_id is not null and new.empresa_id is null
     and not usuarios_empresa_existe(old.empresa_id)
     and (to_jsonb(new) - 'empresa_id') = (to_jsonb(old) - 'empresa_id') then
    return new;
  end if;

  select a.id, a.role, a.empresa_id into v_ator from usuarios_ator() a;

  -- 3.4 DELETE
  if tg_op = 'DELETE' then
    if v_ator.role = 'prolu_admin' then
      return old;
    end if;
    if old.role = 'prolu_admin' then
      raise exception 'O cadastro da Prolu não pode ser removido.' using errcode = '42501';
    end if;
    if old.role = 'master' and usuarios_masters_restantes(old.empresa_id, old.id) = 0 then
      raise exception 'O escritório precisa de pelo menos um master.' using errcode = '42501';
    end if;
    return old; -- quem pode apagar continua decidido pela RLS (só master)
  end if;

  -- 3.5 UPDATE
  if new.auth_id is distinct from old.auth_id then
    raise exception 'O vínculo de login não pode ser alterado.' using errcode = '42501';
  end if;

  if v_ator.role = 'prolu_admin' then
    return new;
  end if;

  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Só a Prolu muda o escritório de um usuário.' using errcode = '42501';
  end if;

  -- o próprio registro: nome/e-mail sim, papel não
  if old.auth_id = v_uid then
    if new.role is distinct from old.role then
      raise exception 'Você não pode alterar o próprio papel.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- outra pessoa
  if v_ator.role = 'master' then
    if old.empresa_id is distinct from v_ator.empresa_id then
      raise exception 'Usuário de outro escritório.' using errcode = '42501';
    end if;
    if coalesce(old.role, '') not in ('master', 'gestor', 'comum')
       or coalesce(new.role, '') not in ('master', 'gestor', 'comum') then
      raise exception 'O papel prolu_admin só é alterado pela Prolu.' using errcode = '42501';
    end if;
    if old.role = 'master' and new.role is distinct from 'master'
       and usuarios_masters_restantes(old.empresa_id, old.id) = 0 then
      raise exception 'O escritório precisa de pelo menos um master.' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_ator.role = 'gestor' then
    if old.empresa_id is distinct from v_ator.empresa_id then
      raise exception 'Usuário de outro escritório.' using errcode = '42501';
    end if;
    if coalesce(old.role, '') not in ('gestor', 'comum')
       or coalesce(new.role, '') not in ('gestor', 'comum') then
      raise exception 'Gestor só alterna entre gestor e colaborador.' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'role') <> (to_jsonb(old) - 'role') then
      raise exception 'Gestor só altera o papel de outras pessoas.' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Sem permissão para alterar outra pessoa.' using errcode = '42501';
end $$;

drop trigger if exists usuarios_protege on usuarios;
create trigger usuarios_protege before insert or update or delete on usuarios
  for each row execute function usuarios_protege();

-- ───────── 4. Convite vira "aceito" quando a pessoa entra ─────────
-- Antes era o navegador quem marcava, e a RLS de `convites` recusava em
-- silêncio quando o convidado era comum (o convite ficava pendente).
create or replace function usuarios_marca_convite_aceito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_id is null or new.empresa_id is null then
    return null;
  end if;
  update convites c
     set status = 'aceito'
   where c.empresa_id = new.empresa_id
     and c.status = 'pendente'
     and lower(c.email) = lower((select au.email from auth.users au where au.id = new.auth_id));
  return null;
end $$;

revoke all on function usuarios_marca_convite_aceito() from public, anon, authenticated;

drop trigger if exists usuarios_marca_convite_aceito on usuarios;
create trigger usuarios_marca_convite_aceito after insert on usuarios
  for each row execute function usuarios_marca_convite_aceito();

-- ───────── 5. Policies com with_check explícito (defesa extra) ─────────
drop policy if exists "usuario edita o próprio registro" on usuarios;
create policy "usuario edita o próprio registro" on usuarios
  for update
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

drop policy if exists "master gerencia usuarios da empresa" on usuarios;
create policy "master gerencia usuarios da empresa" on usuarios
  for all
  using (empresa_id = auth_empresa_id() and auth_is_empresa_master())
  with check (empresa_id = auth_empresa_id() and auth_is_empresa_master());

-- ───────── 6. Grants ─────────
-- TRUNCATE ignora RLS e gatilhos de linha; anon não grava em usuarios em
-- nenhum fluxo.
revoke truncate, trigger, references on usuarios from anon, authenticated;
revoke insert, update, delete on usuarios from anon;

notify pgrst, 'reload schema';
