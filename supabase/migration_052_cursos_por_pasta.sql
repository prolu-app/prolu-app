-- ════════════════════════════════════════════════════════════════
-- MIGRATION 052 — Cursos = pastas (correção do 3B / migration_050)
-- Rodar no SQL Editor do Supabase e publicar o front logo em seguida (o front
-- antigo usa kb_cursos/curso_id/nivel_acesso, que mudam aqui).
-- Idempotente (pode rodar de novo; a conversão de dados só roda uma vez).
--
-- Modelo correto:
--   CURSO = PASTA Prolu da Base de Conhecimento. Acesso na própria pasta:
--     planos         — lista explícita (starter…consultoria)
--     tipos_usuario  — master/gestor/comum (substitui nivel_acesso; master sempre)
--     venda_avulsa   — "Venda avulsa disponível" (Sim/Não)
--     checkout_url   — link de compra (só com venda avulsa = Sim)
--     ativo
--   Liberação avulsa por escritório: kb_pasta_liberacoes (curso INTEIRO; só em
--     pasta com venda avulsa = Sim; histórico com revogado_em).
--   Regra por aula: kb_aulas.planos (vazio = herda o curso). Só restringe, e só
--     em curso com venda avulsa = Não.
--   Acesso ao curso = pasta ativa E conta ativa E tipo de usuário permitido E
--     (plano na lista OU liberação avulsa ativa).
--   Acesso à aula = acesso ao curso E (lista da aula vazia OU plano nela).
--   Pastas de ESCRITÓRIO: só tipo de usuário (plano/venda/link não se aplicam).
--
-- Servidor: kb_pastas e kb_aulas filtram por essas regras (RLS); módulos,
-- anexos (kb_aula_pdfs) e a URL assinada do PDF (storage, migration_050) já
-- dependem da aula visível. Títulos de cursos/aulas sem acesso só saem pelas
-- funções de vitrine, sem vídeo, PDF ou texto.
--
-- Sai a camada da 050: cursos, curso_planos, curso_liberacoes (convertidas
-- para kb_pasta_liberacoes antes), kb_pastas.curso_id e o curso "Método Prolu".
-- Sai também kb_pastas.nivel_acesso (convertida em tipos_usuario).
--
-- WEBHOOK DE CHECKOUT (futuro) — com a service role, por PASTA:
--   select liberar_curso('<empresa_id>', '<pasta_id>', 'checkout', '<pedido>');
--   select revogar_curso('<empresa_id>', '<pasta_id>', '<reembolso>');
--   (PostgREST: POST /rest/v1/rpc/liberar_curso com p_empresa_id, p_pasta_id,
--    p_origem, p_motivo). Recusa pasta com venda avulsa = Não. Idempotente.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Colunas novas + conversão de dados (uma vez só) ─────────
do $$
declare
  v_primeira boolean := not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'kb_pastas' and column_name = 'venda_avulsa');
  v_id uuid;
begin
  alter table kb_pastas add column if not exists tipos_usuario text[];
  alter table kb_pastas add column if not exists planos text[] not null default '{mentoria,consultoria}';
  alter table kb_pastas add column if not exists ativo boolean not null default true;
  alter table kb_pastas add column if not exists venda_avulsa boolean not null default false;
  alter table kb_pastas add column if not exists checkout_url text;
  alter table kb_aulas add column if not exists planos text[] not null default '{}';

  if not v_primeira then
    raise notice 'Conversão de dados da 052 já feita antes — nada a converter';
    return;
  end if;

  -- tipos de usuário a partir do nivel_acesso (conversão fiel)
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'kb_pastas' and column_name = 'nivel_acesso') then
    execute $q$
      update kb_pastas set tipos_usuario = case coalesce(nivel_acesso, 'todos')
          when 'master' then array['master']
          when 'gestor' then array['master', 'gestor']
          else array['master', 'gestor', 'comum'] end
       where tipos_usuario is null
    $q$;
  end if;

  -- pastas de escritório: plano/venda/link não se aplicam
  update kb_pastas set planos = '{}', venda_avulsa = false, checkout_url = null where empresa_id is not null;

  -- as duas pastas vendidas separadamente (por ID; avisa se faltar)
  foreach v_id in array array['b1bce93c-c93e-4a55-9910-45fe3611eac7', 'a720fe69-b91d-48f4-9bfe-ee2d624a62a3']::uuid[] loop
    update kb_pastas set planos = '{mentoria,consultoria}', venda_avulsa = true
     where id = v_id and empresa_id is null;
    if not found then
      raise notice 'Pasta % não encontrada (ou não é Prolu) — seguindo sem ela', v_id;
    end if;
  end loop;
  -- demais pastas Prolu: mentoria + consultoria, venda avulsa = Não (padrão das colunas)
end $$;

update kb_pastas set tipos_usuario = array['master', 'gestor', 'comum'] where tipos_usuario is null;
alter table kb_pastas alter column tipos_usuario set default array['master', 'gestor', 'comum'];
alter table kb_pastas alter column tipos_usuario set not null;

alter table kb_pastas drop constraint if exists kb_pastas_tipos_validos;
alter table kb_pastas add constraint kb_pastas_tipos_validos
  check (tipos_usuario <@ array['master', 'gestor', 'comum'] and 'master' = any(tipos_usuario));
alter table kb_pastas drop constraint if exists kb_pastas_planos_validos;
alter table kb_pastas add constraint kb_pastas_planos_validos
  check (planos <@ array['starter', 'pro', 'business', 'mentoria', 'consultoria']);
alter table kb_pastas drop constraint if exists kb_pastas_checkout_valido;
alter table kb_pastas add constraint kb_pastas_checkout_valido
  check (checkout_url is null or (venda_avulsa and checkout_url ~* '^https://[^[:space:]]+$'));
alter table kb_aulas drop constraint if exists kb_aulas_planos_validos;
alter table kb_aulas add constraint kb_aulas_planos_validos
  check (planos <@ array['starter', 'pro', 'business', 'mentoria', 'consultoria']);

-- ───────── 2. Liberações avulsas por pasta ─────────
create table if not exists kb_pasta_liberacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  pasta_id uuid not null references kb_pastas(id) on delete cascade,
  origem text not null default 'manual' check (origem in ('manual', 'checkout', 'sistema')),
  motivo text,
  criado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid references usuarios(id) on delete set null,
  revogado_motivo text,
  migrada_de uuid  -- id em curso_liberacoes (050), para a conversão não repetir
);
create unique index if not exists kb_pasta_liberacoes_ativa_unica
  on kb_pasta_liberacoes (empresa_id, pasta_id) where revogado_em is null;
create unique index if not exists kb_pasta_liberacoes_migrada
  on kb_pasta_liberacoes (migrada_de, pasta_id) where migrada_de is not null;

alter table kb_pasta_liberacoes enable row level security;
drop policy if exists "prolu_admin le liberacoes" on kb_pasta_liberacoes;
create policy "prolu_admin le liberacoes" on kb_pasta_liberacoes for select using (auth_is_prolu_admin());
revoke insert, update, delete on kb_pasta_liberacoes from anon, authenticated;

-- conversão das liberações da 050 (por curso → uma por pasta do curso).
-- Pasta com venda avulsa = Não não aceita liberação: entra já revogada.
do $$
begin
  if to_regclass('public.curso_liberacoes') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'kb_pastas' and column_name = 'curso_id') then
    raise notice 'Sem liberações da 050 para converter';
    return;
  end if;
  execute $q$
    insert into kb_pasta_liberacoes (empresa_id, pasta_id, origem, motivo, criado_por, criado_em,
                                     revogado_em, revogado_por, revogado_motivo, migrada_de)
    select l.empresa_id, p.id, l.origem, l.motivo, l.criado_por, l.criado_em,
           case when l.revogado_em is null and not p.venda_avulsa then now() else l.revogado_em end,
           l.revogado_por,
           case when l.revogado_em is null and not p.venda_avulsa
                then 'venda avulsa não disponível nesta pasta (migração 052)' else l.revogado_motivo end,
           l.id
      from curso_liberacoes l
      join kb_pastas p on p.curso_id = l.curso_id and p.empresa_id is null
     where not exists (select 1 from kb_pasta_liberacoes k where k.migrada_de = l.id and k.pasta_id = p.id)
  $q$;
end $$;

-- ───────── 3. Regras impostas no banco ─────────
-- pasta de escritório: plano/venda/link não se aplicam (normaliza)
create or replace function kb_pastas_normaliza()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.empresa_id is not null then
    new.planos := '{}';
    new.venda_avulsa := false;
    new.checkout_url := null;
  elsif not new.venda_avulsa then
    new.checkout_url := null;  -- link de compra só com venda avulsa = Sim
  end if;
  return new;
end $$;
drop trigger if exists kb_pastas_normaliza on kb_pastas;
create trigger kb_pastas_normaliza before insert or update on kb_pastas
  for each row execute function kb_pastas_normaliza();

-- trocar a chave "venda avulsa":
--   Não → Sim: aulas do curso perdem a regra por plano (tudo ou nada)
--   Sim → Não: liberações avulsas ativas são revogadas
create or replace function kb_pastas_venda_avulsa_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.venda_avulsa and not old.venda_avulsa then
    update kb_aulas set planos = '{}'
     where planos <> '{}' and modulo_id in (select id from kb_modulos where pasta_id = new.id);
  elsif old.venda_avulsa and not new.venda_avulsa then
    update kb_pasta_liberacoes
       set revogado_em = now(), revogado_motivo = 'venda avulsa desativada',
           revogado_por = (select id from usuarios where auth_id = auth.uid())
     where pasta_id = new.id and revogado_em is null;
  end if;
  return null;
end $$;
drop trigger if exists kb_pastas_venda_avulsa_mudou on kb_pastas;
create trigger kb_pastas_venda_avulsa_mudou after update of venda_avulsa on kb_pastas
  for each row execute function kb_pastas_venda_avulsa_mudou();

-- regra por aula: só em pasta Prolu com venda avulsa = Não
create or replace function kb_aulas_planos_valida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pasta record;
begin
  if coalesce(new.planos, '{}') = '{}' then return new; end if;
  select p.empresa_id, p.venda_avulsa into v_pasta
    from kb_modulos m join kb_pastas p on p.id = m.pasta_id where m.id = new.modulo_id;
  if v_pasta.empresa_id is not null then
    raise exception 'Regra de plano por aula só vale em cursos da Prolu.' using errcode = '23514';
  end if;
  if v_pasta.venda_avulsa then
    raise exception 'Curso com venda avulsa: todas as aulas ficam liberadas para quem tem o curso.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists kb_aulas_planos_valida on kb_aulas;
create trigger kb_aulas_planos_valida before insert or update of planos, modulo_id on kb_aulas
  for each row execute function kb_aulas_planos_valida();

-- liberação avulsa ativa só em pasta Prolu com venda avulsa = Sim
create or replace function kb_pasta_liberacoes_valida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revogado_em is null and not exists (
       select 1 from kb_pastas where id = new.pasta_id and empresa_id is null and venda_avulsa) then
    raise exception 'Este curso não tem venda avulsa: o acesso é só pelo plano.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists kb_pasta_liberacoes_valida on kb_pasta_liberacoes;
create trigger kb_pasta_liberacoes_valida before insert or update on kb_pasta_liberacoes
  for each row execute function kb_pasta_liberacoes_valida();

-- ───────── 4. Sai a camada da 050 ─────────
drop policy if exists "usuario ve pastas" on kb_pastas;
drop policy if exists "ve aulas de modulos visiveis" on kb_aulas;
drop function if exists kb_cursos(uuid);
drop function if exists kb_pasta_vitrine(uuid);
drop function if exists admin_salvar_curso(uuid, text, text, boolean, int, text, text[], uuid[]);
drop function if exists admin_curso_liberacoes(uuid);
drop function if exists liberar_curso(uuid, uuid, text, text);
drop function if exists revogar_curso(uuid, uuid, text);
drop function if exists kb_curso_liberado(uuid);
drop function if exists empresa_acessa_curso(uuid, uuid);
alter table kb_pastas drop constraint if exists kb_pastas_curso_so_prolu;
drop index if exists kb_pastas_curso_idx;
alter table kb_pastas drop column if exists curso_id;
drop table if exists curso_liberacoes;
drop table if exists curso_planos;
drop table if exists cursos;

-- ───────── 5. Regras de acesso ─────────
-- acesso do ESCRITÓRIO à pasta (sem olhar tipo de usuário):
-- 'proprio' (pasta do escritório) | 'plano' | 'avulso' | null
create or replace function kb_acesso_empresa_pasta(p_empresa_id uuid, p_pasta_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.status_conta <> 'ativa' then null
    when p.empresa_id is not null then case when p.empresa_id = e.id then 'proprio' end
    when not p.ativo then null
    when e.plano = any(p.planos) then 'plano'
    when p.venda_avulsa and exists (select 1 from kb_pasta_liberacoes l
                                     where l.pasta_id = p.id and l.empresa_id = e.id and l.revogado_em is null) then 'avulso'
  end
    from kb_pastas p, empresas e
   where p.id = p_pasta_id and e.id = p_empresa_id
$$;
revoke all on function kb_acesso_empresa_pasta(uuid, uuid) from public, anon, authenticated;
grant execute on function kb_acesso_empresa_pasta(uuid, uuid) to service_role;

-- aula liberada para um escritório (dado que ele acessa a pasta)
create or replace function kb_aula_livre_para(p_empresa_id uuid, p_aula_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select a.planos = '{}' or (not p.venda_avulsa and p.empresa_id is null and e.plano = any(a.planos))
      from kb_aulas a
      join kb_modulos m on m.id = a.modulo_id
      join kb_pastas p on p.id = m.pasta_id
      join empresas e on e.id = p_empresa_id
     where a.id = p_aula_id
  ), false)
$$;
revoke all on function kb_aula_livre_para(uuid, uuid) from public, anon, authenticated;
grant execute on function kb_aula_livre_para(uuid, uuid) to service_role;

-- RLS: o usuário logado vê a pasta? (acesso do escritório + tipo de usuário)
create or replace function kb_pasta_liberada(p_pasta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth_is_prolu_admin(), false) then true
    when auth_empresa_id() is null then false
    else coalesce((
      select u.role = any(p.tipos_usuario)
             and kb_acesso_empresa_pasta(u.empresa_id, p.id) is not null
        from kb_pastas p, usuarios u
       where p.id = p_pasta_id and u.auth_id = auth.uid()
    ), false)
  end
$$;
revoke all on function kb_pasta_liberada(uuid) from public, anon;
grant execute on function kb_pasta_liberada(uuid) to authenticated;

-- RLS: o usuário logado vê a aula? (pasta liberada + regra da aula)
create or replace function kb_aula_liberada(p_aula_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth_is_prolu_admin(), false) then true
    when auth_empresa_id() is null then false
    else kb_aula_livre_para(auth_empresa_id(), p_aula_id)
  end
$$;
revoke all on function kb_aula_liberada(uuid) from public, anon;
grant execute on function kb_aula_liberada(uuid) to authenticated;

-- pastas: substitui a policy de leitura da 010/022/050 (nivel_acesso → tipos)
create policy "usuario ve pastas" on kb_pastas
  for select using (kb_pasta_liberada(id));
-- aulas: módulo visível (= pasta visível) + regra da aula. Anexos e a URL
-- assinada do PDF já dependem da aula visível.
create policy "ve aulas de modulos visiveis" on kb_aulas
  for select using (modulo_id in (select id from kb_modulos) and kb_aula_liberada(id));

-- ───────── 6. Liberação avulsa (admin e webhook) ─────────
create or replace function liberar_curso(p_empresa_id uuid, p_pasta_id uuid, p_origem text default 'manual', p_motivo text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not pode_gerir_liberacoes() then
    raise exception 'Apenas a Prolu pode liberar cursos.' using errcode = '42501';
  end if;
  if coalesce(p_origem, '') not in ('manual', 'checkout', 'sistema') then
    raise exception 'Origem inválida.' using errcode = '22023';
  end if;
  if not exists (select 1 from empresas where id = p_empresa_id) then
    raise exception 'Escritório não encontrado.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from kb_pastas where id = p_pasta_id and empresa_id is null) then
    raise exception 'Curso não encontrado.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from kb_pastas where id = p_pasta_id and venda_avulsa) then
    raise exception 'Este curso não tem venda avulsa: o acesso é só pelo plano.' using errcode = '22023';
  end if;

  select id into v_id from kb_pasta_liberacoes
   where empresa_id = p_empresa_id and pasta_id = p_pasta_id and revogado_em is null;
  if v_id is not null then return v_id; end if;

  insert into kb_pasta_liberacoes (empresa_id, pasta_id, origem, motivo, criado_por)
  values (p_empresa_id, p_pasta_id, p_origem, nullif(trim(coalesce(p_motivo, '')), ''),
          (select id from usuarios where auth_id = auth.uid()))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function liberar_curso(uuid, uuid, text, text) from public, anon;
grant execute on function liberar_curso(uuid, uuid, text, text) to authenticated, service_role;

create or replace function revogar_curso(p_empresa_id uuid, p_pasta_id uuid, p_motivo text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pode_gerir_liberacoes() then
    raise exception 'Apenas a Prolu pode revogar cursos.' using errcode = '42501';
  end if;
  update kb_pasta_liberacoes
     set revogado_em = now(),
         revogado_por = (select id from usuarios where auth_id = auth.uid()),
         revogado_motivo = nullif(trim(coalesce(p_motivo, '')), '')
   where empresa_id = p_empresa_id and pasta_id = p_pasta_id and revogado_em is null;
  return found;
end $$;
revoke all on function revogar_curso(uuid, uuid, text) from public, anon;
grant execute on function revogar_curso(uuid, uuid, text) to authenticated, service_role;

-- ───────── 7. Leitura para as telas ─────────
-- Cursos (pastas Prolu) com o acesso do escritório. Tipo de usuário sem
-- permissão: o curso nem aparece. p_empresa_id só vale para o prolu_admin
-- (vendo como um escritório / detalhe no admin); admin puro = tudo, inclusive
-- inativos, com acesso 'admin'.
create or replace function kb_cursos(p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean := coalesce(auth_is_prolu_admin(), false);
  v_empresa uuid;
  v_role text;
begin
  v_empresa := case when v_admin then p_empresa_id else auth_empresa_id() end;
  if not v_admin and v_empresa is null then return '[]'::jsonb; end if;
  select role into v_role from usuarios where auth_id = auth.uid();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'titulo', p.titulo,
             'descricao', p.subtitulo,
             'cor_capa', p.cor_capa,
             'ordem', p.ordem,
             'ativo', p.ativo,
             'planos', to_jsonb(array(select x from unnest(p.planos) x order by plano_nivel(x))),
             'tipos_usuario', to_jsonb(p.tipos_usuario),
             'venda_avulsa', p.venda_avulsa,
             'checkout_url', p.checkout_url,
             'aulas', (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id),
             'via', case when v_empresa is null then 'admin' else kb_acesso_empresa_pasta(v_empresa, p.id) end,
             'acesso', v_empresa is null or kb_acesso_empresa_pasta(v_empresa, p.id) is not null
           ) order by p.ordem, p.titulo)
      from kb_pastas p
     where p.empresa_id is null
       and (v_admin or (p.ativo and v_role = any(p.tipos_usuario)))
       and (v_empresa is null or p.ativo)
  ), '[]'::jsonb);
end $$;
revoke all on function kb_cursos(uuid) from public, anon;
grant execute on function kb_cursos(uuid) to authenticated;

-- Estrutura de um curso: módulos e aulas com SÓ título/tipo/ordem/planos e se
-- a aula está liberada para o escritório. Nunca vídeo, PDF, descrição ou texto.
-- Serve à vitrine (curso sem acesso) e às aulas bloqueadas dentro do curso.
create or replace function kb_pasta_vitrine(p_pasta_id uuid, p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean := coalesce(auth_is_prolu_admin(), false);
  v_empresa uuid;
  v_role text;
  v_acesso text;
begin
  v_empresa := case when v_admin then p_empresa_id else auth_empresa_id() end;
  if not v_admin and v_empresa is null then return null; end if;
  select role into v_role from usuarios where auth_id = auth.uid();
  -- só curso Prolu ativo que o tipo de usuário pode ver
  if not exists (select 1 from kb_pastas p where p.id = p_pasta_id and p.empresa_id is null
                  and (v_admin or (p.ativo and v_role = any(p.tipos_usuario)))) then
    return null;
  end if;
  v_acesso := case when v_empresa is null then 'admin' else kb_acesso_empresa_pasta(v_empresa, p_pasta_id) end;

  return (
    select jsonb_build_object(
      'id', p.id, 'titulo', p.titulo, 'subtitulo', p.subtitulo, 'cor_capa', p.cor_capa,
      'planos', to_jsonb(array(select x from unnest(p.planos) x order by plano_nivel(x))),
      'venda_avulsa', p.venda_avulsa, 'checkout_url', p.checkout_url,
      'acesso', v_acesso is not null, 'via', v_acesso,
      'modulos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'titulo', m.titulo, 'ordem', m.ordem,
                 'aulas', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', a.id, 'titulo', a.titulo, 'tipo', coalesce(a.tipo, 'video'), 'ordem', a.ordem,
                            'planos', to_jsonb(array(select x from unnest(a.planos) x order by plano_nivel(x))),
                            'liberada', v_acesso is not null
                                        and (v_empresa is null or kb_aula_livre_para(v_empresa, a.id))
                          ) order by a.ordem, a.titulo)
                     from kb_aulas a where a.modulo_id = m.id), '[]'::jsonb)
               ) order by m.ordem, m.titulo)
          from kb_modulos m where m.pasta_id = p.id), '[]'::jsonb)
    )
    from kb_pastas p where p.id = p_pasta_id
  );
end $$;
revoke all on function kb_pasta_vitrine(uuid, uuid) from public, anon;
grant execute on function kb_pasta_vitrine(uuid, uuid) to authenticated;

-- ───────── 8. Admin ─────────
-- cursos (pastas Prolu) com contagens para a lista e os avisos do modal
create or replace function admin_cursos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode ver os cursos.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'titulo', p.titulo, 'subtitulo', p.subtitulo, 'ordem', p.ordem, 'ativo', p.ativo,
             'planos', to_jsonb(array(select x from unnest(p.planos) x order by plano_nivel(x))),
             'tipos_usuario', to_jsonb(p.tipos_usuario),
             'venda_avulsa', p.venda_avulsa, 'checkout_url', p.checkout_url,
             'aulas', (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id),
             'aulas_com_regra', (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id
                                  where m.pasta_id = p.id and a.planos <> '{}'),
             'liberacoes_ativas', (select count(*) from kb_pasta_liberacoes l where l.pasta_id = p.id and l.revogado_em is null)
           ) order by p.ordem, p.titulo)
      from kb_pastas p where p.empresa_id is null
  ), '[]'::jsonb);
end $$;
revoke all on function admin_cursos() from public, anon;
grant execute on function admin_cursos() to authenticated;

-- salva o modal "Acesso". Trocar a venda avulsa dispara o trigger da seção 3
-- (limpa regras de aula ou revoga liberações); devolve o que aconteceu.
create or replace function admin_salvar_acesso_curso(
  p_pasta_id uuid, p_planos text[], p_tipos text[], p_ativo boolean, p_venda_avulsa boolean, p_checkout_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aulas int;
  v_libs int;
  v_url text := nullif(trim(coalesce(p_checkout_url, '')), '');
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode alterar o acesso aos cursos.' using errcode = '42501';
  end if;
  if not exists (select 1 from kb_pastas where id = p_pasta_id and empresa_id is null) then
    raise exception 'Curso não encontrado.' using errcode = 'P0002';
  end if;
  if not ('master' = any(coalesce(p_tipos, '{}'))) then
    raise exception 'O tipo Master sempre vê o curso.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_tipos, '{}')) x where x not in ('master', 'gestor', 'comum'))
     or exists (select 1 from unnest(coalesce(p_planos, '{}')) x where x not in ('starter', 'pro', 'business', 'mentoria', 'consultoria')) then
    raise exception 'Plano ou tipo de usuário inválido.' using errcode = '22023';
  end if;
  if v_url is not null and (not coalesce(p_venda_avulsa, false) or v_url !~* '^https://[^[:space:]]+$') then
    raise exception 'Link de compra só com venda avulsa, começando com https://' using errcode = '22023';
  end if;

  select count(*) into v_aulas from kb_aulas a join kb_modulos m on m.id = a.modulo_id
   where m.pasta_id = p_pasta_id and a.planos <> '{}';
  select count(*) into v_libs from kb_pasta_liberacoes where pasta_id = p_pasta_id and revogado_em is null;

  update kb_pastas
     set planos = array(select distinct x from unnest(coalesce(p_planos, '{}')) x),
         tipos_usuario = array(select distinct x from unnest(p_tipos) x),
         ativo = coalesce(p_ativo, true),
         venda_avulsa = coalesce(p_venda_avulsa, false),
         checkout_url = v_url
   where id = p_pasta_id;

  return jsonb_build_object(
    'aulas_liberadas', case when coalesce(p_venda_avulsa, false) then v_aulas else 0 end,
    'liberacoes_revogadas', case when coalesce(p_venda_avulsa, false) then 0 else v_libs end
  );
end $$;
revoke all on function admin_salvar_acesso_curso(uuid, text[], text[], boolean, boolean, text) from public, anon;
grant execute on function admin_salvar_acesso_curso(uuid, text[], text[], boolean, boolean, text) to authenticated;

-- liberações avulsas de um curso (ativas e revogadas)
create or replace function admin_curso_liberacoes(p_pasta_id uuid)
returns table (
  id uuid, empresa_id uuid, empresa_nome text, empresa_plano text, origem text, motivo text,
  criado_por text, criado_em timestamptz, revogado_em timestamptz, revogado_por text, revogado_motivo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode ver as liberações.' using errcode = '42501';
  end if;
  return query
  select l.id, l.empresa_id, e.nome, e.plano, l.origem, l.motivo,
         uc.nome, l.criado_em, l.revogado_em, ur.nome, l.revogado_motivo
    from kb_pasta_liberacoes l
    join empresas e on e.id = l.empresa_id
    left join usuarios uc on uc.id = l.criado_por
    left join usuarios ur on ur.id = l.revogado_por
   where l.pasta_id = p_pasta_id
   order by (l.revogado_em is null) desc, coalesce(l.revogado_em, l.criado_em) desc;
end $$;
revoke all on function admin_curso_liberacoes(uuid) from public, anon;
grant execute on function admin_curso_liberacoes(uuid) to authenticated;

-- detalhe do escritório: "X de Y aulas" = aulas que cada pessoa acessa
-- (curso acessível ao escritório, tipo de usuário permitido, regra da aula)
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
    select a.id, p.tipos_usuario
      from kb_aulas a
      join kb_modulos m on m.id = a.modulo_id
      join kb_pastas p on p.id = m.pasta_id
     where kb_acesso_empresa_pasta(p_empresa_id, p.id) is not null
       and kb_aula_livre_para(p_empresa_id, a.id)
  ),
  visiveis as (
    select u.id as uid, a.id as aula_id
      from usuarios u
      join aulas a on u.role = any(a.tipos_usuario)
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

-- ───────── 9. Sai nivel_acesso (convertido em tipos_usuario no passo 1) ─────────
alter table kb_pastas drop column if exists nivel_acesso;

notify pgrst, 'reload schema';
