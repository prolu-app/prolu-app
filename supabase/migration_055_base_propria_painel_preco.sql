-- ════════════════════════════════════════════════════════════════
-- migration_055 — Base de conhecimento do escritório e Painel a partir do
-- Business + preço da venda avulsa nos cards de curso
--
--   empresa_libera()        → + 'base_propria' (business) e 'kb_painel'
--                             (business), espelho de RECURSOS em planos.js
--   kb_pode_escrever()      → conteúdo do escritório só é criado/editado/
--                             apagado com 'base_propria' liberado. A LEITURA
--                             não muda (policies de leitura da 052): num
--                             downgrade nada é apagado, só deixa de ser editável.
--   storage kb-pdfs         → upload/troca/remoção de PDF do escritório com a
--                             mesma regra
--   kb_progresso            → o progresso da EQUIPE (Painel) só sai com
--                             'kb_painel'; o próprio progresso continua igual
--   kb_pastas.preco_avulso  → preço do curso com venda avulsa = Sim
--   admin_cursos / admin_salvar_acesso_curso → + preço
--   kb_cursos / kb_pasta_vitrine → + 'preco', SÓ para curso bloqueado do
--                             escritório com venda avulsa = Sim
--
-- Cursos da Prolu (planos, tipos de usuário, liberações) não mudam.
-- Mentoria e Consultoria ficam acima do Business: nada muda para eles.
--
-- Idempotente: pode rodar de novo sem efeito colateral.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. empresa_libera(): + base_propria e kb_painel ─────────
-- mesma função da migration_054, com os dois recursos novos
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
             when 'selo_removivel'       then 'pro'
             when 'equipe_convites'      then 'business'
             when 'base_propria'         then 'business'
             when 'kb_painel'            then 'business'
             when 'ferramentas_mentoria' then 'mentoria'
           end)
      from empresas e
     where e.id = p_empresa_id
  ), false)
$$;
revoke all on function empresa_libera(uuid, text) from public, anon;
grant execute on function empresa_libera(uuid, text) to authenticated, service_role;

-- ───────── 2. Escrita do conteúdo do escritório ─────────
-- mesma regra da migration_022 + plano. Vale para kb_pastas, kb_modulos,
-- kb_aulas e kb_aula_pdfs (policies "escreve … do escritorio ou prolu").
-- Conteúdo Prolu (empresa_id null) continua só com o prolu_admin.
create or replace function kb_pode_escrever(p_empresa_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case when p_empresa_id is null then auth_is_prolu_admin()
         else p_empresa_id = auth_empresa_id()
              and auth_is_gestor_ou_superior()
              and empresa_libera(p_empresa_id, 'base_propria')
    end,
    false)
$$;

-- storage: mesma policy da migration_022, com o plano no ramo do escritório
drop policy if exists "kb-pdfs: escreve do escritorio ou prolu" on storage.objects;
create policy "kb-pdfs: escreve do escritorio ou prolu" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'kb-pdfs' and (
      ((storage.foldername(name))[1] = 'prolu' and auth_is_prolu_admin())
      or ((storage.foldername(name))[1] = auth_empresa_id()::text and auth_is_gestor_ou_superior()
          and empresa_libera(auth_empresa_id(), 'base_propria'))
    )
  )
  with check (
    bucket_id = 'kb-pdfs' and (
      ((storage.foldername(name))[1] = 'prolu' and auth_is_prolu_admin())
      or ((storage.foldername(name))[1] = auth_empresa_id()::text and auth_is_gestor_ou_superior()
          and empresa_libera(auth_empresa_id(), 'base_propria'))
    )
  );

-- ───────── 3. Painel: progresso da equipe ─────────
-- mesma policy da migration_014 + plano. O próprio progresso continua pela
-- policy "usuario gerencia seu progresso" (schema.sql).
drop policy if exists "gestor ve progresso da equipe" on kb_progresso;
create policy "gestor ve progresso da equipe" on kb_progresso
  for select using (
    auth_is_gestor_ou_superior()
    and usuario_id in (select id from usuarios where empresa_id = auth_empresa_id())
    and empresa_libera(auth_empresa_id(), 'kb_painel')
  );

-- ───────── 4. Preço da venda avulsa ─────────
alter table kb_pastas add column if not exists preco_avulso numeric(10,2);

-- mesma função da migration_052: o preço também só existe com venda avulsa = Sim
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
    new.preco_avulso := null;
  elsif not new.venda_avulsa then
    new.checkout_url := null;  -- link de compra só com venda avulsa = Sim
    new.preco_avulso := null;  -- preço também
  end if;
  return new;
end $$;

alter table kb_pastas drop constraint if exists kb_pastas_preco_valido;
alter table kb_pastas add constraint kb_pastas_preco_valido
  check (preco_avulso is null or (venda_avulsa and preco_avulso >= 0));

-- ───────── 5. Admin ─────────
-- mesma função da migration_052, com 'preco_avulso'
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
             'venda_avulsa', p.venda_avulsa, 'checkout_url', p.checkout_url, 'preco_avulso', p.preco_avulso,
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

-- modal "Acesso": + p_preco. A assinatura muda (sai a de 6 parâmetros);
-- p_preco tem default null, então o front antigo continua salvando (sem
-- preço) entre esta migration e o push.
drop function if exists admin_salvar_acesso_curso(uuid, text[], text[], boolean, boolean, text);
create or replace function admin_salvar_acesso_curso(
  p_pasta_id uuid, p_planos text[], p_tipos text[], p_ativo boolean, p_venda_avulsa boolean, p_checkout_url text,
  p_preco numeric default null
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
  if p_preco is not null and not coalesce(p_venda_avulsa, false) then
    raise exception 'Preço só com venda avulsa = Sim.' using errcode = '22023';
  end if;
  if p_preco is not null and (p_preco < 0 or p_preco >= 100000000) then
    raise exception 'Preço inválido.' using errcode = '22023';
  end if;

  select count(*) into v_aulas from kb_aulas a join kb_modulos m on m.id = a.modulo_id
   where m.pasta_id = p_pasta_id and a.planos <> '{}';
  select count(*) into v_libs from kb_pasta_liberacoes where pasta_id = p_pasta_id and revogado_em is null;

  update kb_pastas
     set planos = array(select distinct x from unnest(coalesce(p_planos, '{}')) x),
         tipos_usuario = array(select distinct x from unnest(p_tipos) x),
         ativo = coalesce(p_ativo, true),
         venda_avulsa = coalesce(p_venda_avulsa, false),
         checkout_url = v_url,
         preco_avulso = round(p_preco, 2)
   where id = p_pasta_id;

  return jsonb_build_object(
    'aulas_liberadas', case when coalesce(p_venda_avulsa, false) then v_aulas else 0 end,
    'liberacoes_revogadas', case when coalesce(p_venda_avulsa, false) then 0 else v_libs end
  );
end $$;
revoke all on function admin_salvar_acesso_curso(uuid, text[], text[], boolean, boolean, text, numeric) from public, anon;
grant execute on function admin_salvar_acesso_curso(uuid, text[], text[], boolean, boolean, text, numeric) to authenticated;

-- ───────── 6. Vitrine: preço só em curso bloqueado com venda avulsa ─────────
-- mesma função da migration_052, com 'preco'. Admin puro (sem escritório em
-- contexto) não recebe preço: não há vitrine para ele.
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
             'preco', case when v_empresa is not null and p.venda_avulsa
                                and kb_acesso_empresa_pasta(v_empresa, p.id) is null
                           then p.preco_avulso end,
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

-- mesma função da migration_052, com 'preco'
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
      'preco', case when v_empresa is not null and p.venda_avulsa and v_acesso is null then p.preco_avulso end,
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

notify pgrst, 'reload schema';
