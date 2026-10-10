-- ════════════════════════════════════════════════════════════════
-- MIGRATION 050 — Cursos: liberação por plano e liberação avulsa (Passo 3B)
-- Rodar no SQL Editor do Supabase ANTES de publicar o front novo.
-- Idempotente (pode rodar de novo). Depende das migrations 045/046.
--
-- Modelo encontrado: Base de Conhecimento = kb_pastas → kb_modulos → kb_aulas
-- (+ kb_aula_pdfs), progresso em kb_progresso (por usuário e aula). Pastas
-- Prolu têm empresa_id null; pastas do escritório, empresa_id dele. Não havia
-- "curso". Modelo criado (mínimo):
--   cursos           — título, descrição, ativo, ordem, checkout_url
--   curso_planos     — planos que liberam o curso (lista EXPLÍCITA)
--   curso_liberacoes — liberação avulsa por escritório (histórico; revogado_em)
--   kb_pastas.curso_id — cada pasta Prolu pertence a no máximo um curso.
--                        Pastas do escritório nunca têm curso (sempre dele).
-- O conteúdo atual vira UM curso ("Método Prolu"), liberado para os 5 planos:
-- ninguém perde acesso e o progresso (kb_progresso) não é tocado.
--
-- Acesso (servidor): empresa_acessa_curso(empresa, curso) = curso ativo E conta
-- ativa E (plano na lista OU liberação avulsa não revogada). A leitura de
-- kb_pastas passa a exigir isso (kb_curso_liberado); módulos, aulas e PDFs já
-- herdam a visibilidade da pasta (migration_022). prolu_admin vê tudo.
--
-- PDFs: o bucket kb-pdfs deixa de ser público. Leitura só por URL assinada, e
-- só de arquivo referenciado por uma aula que a pessoa consegue ver.
-- Vídeos são links do YouTube: um link já visto não tem como ser revogado.
--
-- WEBHOOK DE CHECKOUT (futuro, Kiwify/Asaas) — chamar com a service role:
--   select liberar_curso('<empresa_id>', '<curso_id>', 'checkout', '<pedido/transação>');
--   select revogar_curso('<empresa_id>', '<curso_id>', '<reembolso/chargeback>');
--   (via PostgREST: POST /rest/v1/rpc/liberar_curso com p_empresa_id,
--    p_curso_id, p_origem, p_motivo). liberar_curso é idempotente: com uma
--   liberação ativa, devolve a existente em vez de duplicar.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Tabelas ─────────
create table if not exists cursos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  ativo boolean not null default true,
  ordem int not null default 0,
  checkout_url text check (checkout_url is null or checkout_url ~* '^https://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists curso_planos (
  curso_id uuid not null references cursos(id) on delete cascade,
  plano text not null check (plano in ('starter', 'pro', 'business', 'mentoria', 'consultoria')),
  primary key (curso_id, plano)
);

create table if not exists curso_liberacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  origem text not null default 'manual' check (origem in ('manual', 'checkout', 'sistema')),
  motivo text,
  criado_por uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid references usuarios(id) on delete set null,
  revogado_motivo text
);
-- no máximo uma liberação ATIVA por escritório e curso (revogadas ficam no histórico)
create unique index if not exists curso_liberacoes_ativa_unica
  on curso_liberacoes (empresa_id, curso_id) where revogado_em is null;

-- pasta → curso. "restrict": apagar um curso com pastas é recusado (senão as
-- pastas ficariam sem curso = livres). Para tirar do ar, desative o curso.
alter table kb_pastas add column if not exists curso_id uuid references cursos(id) on delete restrict;
alter table kb_pastas drop constraint if exists kb_pastas_curso_so_prolu;
alter table kb_pastas add constraint kb_pastas_curso_so_prolu check (curso_id is null or empresa_id is null);
create index if not exists kb_pastas_curso_idx on kb_pastas (curso_id);

-- ───────── 2. Backfill: conteúdo atual = um curso para os 5 planos ─────────
do $$
declare
  v_curso uuid;
begin
  if exists (select 1 from cursos) then
    raise notice 'Já existem cursos — backfill não aplicado';
    return;
  end if;
  insert into cursos (titulo, descricao, ordem)
  values ('Método Prolu', 'O método Prolu para estruturar o comercial do escritório de arquitetura.', 0)
  returning id into v_curso;
  insert into curso_planos (curso_id, plano)
  select v_curso, p from unnest(array['starter', 'pro', 'business', 'mentoria', 'consultoria']) p;
  update kb_pastas set curso_id = v_curso where empresa_id is null and curso_id is null;
  raise notice 'Curso "Método Prolu" criado com % pastas', (select count(*) from kb_pastas where curso_id = v_curso);
end $$;

-- ───────── 3. Regra de acesso ─────────
create or replace function empresa_acessa_curso(p_empresa_id uuid, p_curso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.ativo
       and e.status_conta = 'ativa'
       and (
         exists (select 1 from curso_planos cp where cp.curso_id = c.id and cp.plano = e.plano)
         or exists (select 1 from curso_liberacoes l
                     where l.curso_id = c.id and l.empresa_id = e.id and l.revogado_em is null)
       )
      from cursos c, empresas e
     where c.id = p_curso_id and e.id = p_empresa_id
  ), false)
$$;
revoke all on function empresa_acessa_curso(uuid, uuid) from public, anon, authenticated;
grant execute on function empresa_acessa_curso(uuid, uuid) to service_role;

-- usada na RLS: o usuário logado pode ver conteúdo deste curso?
-- curso null = pasta sem curso (do escritório, ou Prolu ainda não associada):
-- vale como antes, só exigindo conta ativa.
create or replace function kb_curso_liberado(p_curso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth_is_prolu_admin(), false) then true
    when auth_empresa_id() is null then false
    when p_curso_id is null then true
    else empresa_acessa_curso(auth_empresa_id(), p_curso_id)
  end
$$;
revoke all on function kb_curso_liberado(uuid) from public, anon;
grant execute on function kb_curso_liberado(uuid) to authenticated;

-- ───────── 4. RLS ─────────
-- pastas: a mesma policy da migration_010/022 + acesso ao curso.
-- Módulos, aulas e PDFs filtram por "pasta visível" (subquery em kb_pastas,
-- que passa por esta RLS) — então herdam o bloqueio sem mudar nada.
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
      and kb_curso_liberado(curso_id)
    )
  );

alter table cursos enable row level security;
alter table curso_planos enable row level security;
alter table curso_liberacoes enable row level security;

-- título, descrição, planos e link de compra são públicos para quem está logado
-- (a vitrine mostra); escrever, só prolu_admin
drop policy if exists "logados leem cursos" on cursos;
create policy "logados leem cursos" on cursos for select to authenticated using (true);
drop policy if exists "prolu_admin escreve cursos" on cursos;
create policy "prolu_admin escreve cursos" on cursos for all
  using (auth_is_prolu_admin()) with check (auth_is_prolu_admin());

drop policy if exists "logados leem planos do curso" on curso_planos;
create policy "logados leem planos do curso" on curso_planos for select to authenticated using (true);
drop policy if exists "prolu_admin escreve planos do curso" on curso_planos;
create policy "prolu_admin escreve planos do curso" on curso_planos for all
  using (auth_is_prolu_admin()) with check (auth_is_prolu_admin());

-- liberações: só prolu_admin lê; escrita só por liberar_curso/revogar_curso
drop policy if exists "prolu_admin le liberacoes" on curso_liberacoes;
create policy "prolu_admin le liberacoes" on curso_liberacoes for select using (auth_is_prolu_admin());
revoke insert, update, delete on curso_liberacoes from anon, authenticated;

-- ───────── 5. Storage: PDFs privados ─────────
-- Antes: bucket público (link do PDF abria para qualquer pessoa, logada ou
-- não — pendência registrada em docs/pendencias-seguranca.md). Agora: leitura
-- por URL assinada, só de arquivo usado por uma aula que a pessoa vê (a
-- subquery em kb_aulas/kb_aula_pdfs passa pela RLS, incluindo o curso).
-- As colunas pdf_url/arquivo_url continuam guardando a URL "pública" só como
-- identificador do arquivo; o app gera a URL assinada na hora de abrir.
update storage.buckets set public = false where id = 'kb-pdfs';

-- remove TODA policy de leitura que mencione o kb-pdfs (o banco já teve
-- policies fora do repositório — ver migration_022), para nenhuma continuar
-- liberando leitura aberta
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       -- só SELECT: a policy FOR ALL de escrita (migration_022) continua
       and cmd = 'SELECT'
       and coalesce(qual, '') like '%kb-pdfs%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;
drop policy if exists "leitura publica de pdfs da kb" on storage.objects;
drop policy if exists "kb-pdfs: le arquivo de aula visivel" on storage.objects;
create policy "kb-pdfs: le arquivo de aula visivel" on storage.objects
  for select to authenticated using (
    bucket_id = 'kb-pdfs' and (
      auth_is_prolu_admin()
      or exists (select 1 from kb_aulas a where split_part(a.pdf_url, '/kb-pdfs/', 2) = storage.objects.name)
      or exists (select 1 from kb_aula_pdfs p where split_part(p.arquivo_url, '/kb-pdfs/', 2) = storage.objects.name)
      -- quem enviou e ainda não salvou a aula (prévia no editor): a própria pasta
      or ((storage.foldername(name))[1] = auth_empresa_id()::text and auth_is_gestor_ou_superior())
    )
  );

-- ───────── 6. Liberação avulsa (admin e webhook) ─────────
-- Quem pode: prolu_admin, service role (webhook) ou sessão direta no banco
-- (SQL Editor, sem JWT). Usuário comum da API, nunca.
create or replace function pode_gerir_liberacoes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_is_prolu_admin(), false)
      or coalesce(auth.role(), '') = 'service_role'
      or coalesce(current_setting('request.jwt.claims', true), '') in ('', 'null')
$$;
revoke all on function pode_gerir_liberacoes() from public, anon;
grant execute on function pode_gerir_liberacoes() to authenticated, service_role;

create or replace function liberar_curso(p_empresa_id uuid, p_curso_id uuid, p_origem text default 'manual', p_motivo text default null)
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
  if not exists (select 1 from cursos where id = p_curso_id) then
    raise exception 'Curso não encontrado.' using errcode = 'P0002';
  end if;

  select id into v_id from curso_liberacoes
   where empresa_id = p_empresa_id and curso_id = p_curso_id and revogado_em is null;
  if v_id is not null then return v_id; end if;

  insert into curso_liberacoes (empresa_id, curso_id, origem, motivo, criado_por)
  values (p_empresa_id, p_curso_id, p_origem, nullif(trim(coalesce(p_motivo, '')), ''),
          (select id from usuarios where auth_id = auth.uid()))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function liberar_curso(uuid, uuid, text, text) from public, anon;
grant execute on function liberar_curso(uuid, uuid, text, text) to authenticated, service_role;

create or replace function revogar_curso(p_empresa_id uuid, p_curso_id uuid, p_motivo text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pode_gerir_liberacoes() then
    raise exception 'Apenas a Prolu pode revogar cursos.' using errcode = '42501';
  end if;
  update curso_liberacoes
     set revogado_em = now(),
         revogado_por = (select id from usuarios where auth_id = auth.uid()),
         revogado_motivo = nullif(trim(coalesce(p_motivo, '')), '')
   where empresa_id = p_empresa_id and curso_id = p_curso_id and revogado_em is null;
  return found;
end $$;
revoke all on function revogar_curso(uuid, uuid, text) from public, anon;
grant execute on function revogar_curso(uuid, uuid, text) to authenticated, service_role;

-- ───────── 7. Leitura para as telas ─────────
-- Cursos ativos com o acesso do escritório. p_empresa_id só vale para o
-- prolu_admin (vendo como um escritório / detalhe no admin); para os demais é
-- sempre o escritório de quem chama. Sem escritório (admin puro) = acesso total.
-- Pastas: só dados de vitrine (título, subtítulo, capa, nº de aulas).
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
    select jsonb_agg(x order by (x->>'ordem')::int, x->>'titulo')
      from (
        select jsonb_build_object(
          'id', c.id,
          'titulo', c.titulo,
          'descricao', c.descricao,
          'ordem', c.ordem,
          'ativo', c.ativo,
          'checkout_url', c.checkout_url,
          'planos', coalesce((select jsonb_agg(cp.plano order by plano_nivel(cp.plano)) from curso_planos cp where cp.curso_id = c.id), '[]'::jsonb),
          'acesso', case when v_empresa is null then true else empresa_acessa_curso(v_empresa, c.id) end,
          'via', case
                   when v_empresa is null then 'admin'
                   when not empresa_acessa_curso(v_empresa, c.id) then null
                   when exists (select 1 from curso_planos cp join empresas e on e.id = v_empresa
                                 where cp.curso_id = c.id and cp.plano = e.plano) then 'plano'
                   else 'avulso'
                 end,
          'pastas', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', p.id, 'titulo', p.titulo, 'subtitulo', p.subtitulo, 'cor_capa', p.cor_capa,
                     'nivel_acesso', p.nivel_acesso,
                     'aulas', (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id)
                   ) order by p.ordem, p.titulo)
              from kb_pastas p
             where p.curso_id = c.id
               -- mesmo nível de acesso da RLS (admin puro vê todas)
               and (v_admin or coalesce(p.nivel_acesso, 'todos') = 'todos'
                    or (p.nivel_acesso = 'gestor' and v_role in ('gestor', 'master'))
                    or (p.nivel_acesso = 'master' and v_role = 'master'))
          ), '[]'::jsonb)
        ) as x
          from cursos c
         where c.ativo or v_admin
      ) t
  ), '[]'::jsonb);
end $$;
revoke all on function kb_cursos(uuid) from public, anon;
grant execute on function kb_cursos(uuid) to authenticated;

-- Vitrine de uma pasta de curso: SÓ títulos/ordem/tipo de módulos e aulas.
-- Nunca URL de vídeo, PDF, descrição ou texto da aula.
create or replace function kb_pasta_vitrine(p_pasta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'titulo', p.titulo, 'subtitulo', p.subtitulo, 'cor_capa', p.cor_capa, 'curso_id', p.curso_id,
    'modulos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'titulo', m.titulo,
               'aulas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'titulo', a.titulo, 'tipo', coalesce(a.tipo, 'video')) order by a.ordem, a.titulo)
                                    from kb_aulas a where a.modulo_id = m.id), '[]'::jsonb)
             ) order by m.ordem, m.titulo)
        from kb_modulos m where m.pasta_id = p.id
    ), '[]'::jsonb)
  )
  from kb_pastas p
  join cursos c on c.id = p.curso_id and c.ativo
  where p.id = p_pasta_id
    and p.empresa_id is null
    and auth.uid() is not null
$$;
revoke all on function kb_pasta_vitrine(uuid) from public, anon;
grant execute on function kb_pasta_vitrine(uuid) to authenticated;

-- ───────── 8. Admin ─────────
-- grava curso + planos + pastas associadas numa transação
create or replace function admin_salvar_curso(
  p_id uuid, p_titulo text, p_descricao text, p_ativo boolean, p_ordem int,
  p_checkout_url text, p_planos text[], p_pastas uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_url text := nullif(trim(coalesce(p_checkout_url, '')), '');
begin
  if not coalesce(auth_is_prolu_admin(), false) then
    raise exception 'Apenas a Prolu pode editar cursos.' using errcode = '42501';
  end if;
  if trim(coalesce(p_titulo, '')) = '' then
    raise exception 'Informe o título do curso.' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~* '^https://[^[:space:]]+$' then
    raise exception 'O link de compra precisa começar com https://' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_planos, '{}')) x where x not in ('starter', 'pro', 'business', 'mentoria', 'consultoria')) then
    raise exception 'Plano inválido.' using errcode = '22023';
  end if;
  if exists (select 1 from kb_pastas where id = any(coalesce(p_pastas, '{}')) and empresa_id is not null) then
    raise exception 'Só pastas da Prolu podem fazer parte de um curso.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into cursos (titulo, descricao, ativo, ordem, checkout_url)
    values (trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), coalesce(p_ativo, true), coalesce(p_ordem, 0), v_url)
    returning id into v_id;
  else
    update cursos
       set titulo = trim(p_titulo), descricao = nullif(trim(coalesce(p_descricao, '')), ''),
           ativo = coalesce(p_ativo, true), ordem = coalesce(p_ordem, 0), checkout_url = v_url, updated_at = now()
     where id = v_id;
    if not found then raise exception 'Curso não encontrado.' using errcode = 'P0002'; end if;
  end if;

  delete from curso_planos where curso_id = v_id;
  insert into curso_planos (curso_id, plano)
  select distinct v_id, x from unnest(coalesce(p_planos, '{}')) x;

  -- pastas: as marcadas passam a ser deste curso; as que eram e saíram ficam sem curso
  update kb_pastas set curso_id = null where curso_id = v_id and not (id = any(coalesce(p_pastas, '{}')));
  update kb_pastas set curso_id = v_id where id = any(coalesce(p_pastas, '{}'));
  return v_id;
end $$;
revoke all on function admin_salvar_curso(uuid, text, text, boolean, int, text, text[], uuid[]) from public, anon;
grant execute on function admin_salvar_curso(uuid, text, text, boolean, int, text, text[], uuid[]) to authenticated;

-- liberações avulsas de um curso (ativas e revogadas), com nome do escritório
create or replace function admin_curso_liberacoes(p_curso_id uuid)
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
    from curso_liberacoes l
    join empresas e on e.id = l.empresa_id
    left join usuarios uc on uc.id = l.criado_por
    left join usuarios ur on ur.id = l.revogado_por
   where l.curso_id = p_curso_id
   order by (l.revogado_em is null) desc, coalesce(l.revogado_em, l.criado_em) desc;
end $$;
revoke all on function admin_curso_liberacoes(uuid) from public, anon;
grant execute on function admin_curso_liberacoes(uuid) to authenticated;

-- detalhe do escritório: progresso na Base de Conhecimento passa a contar só as
-- aulas dos cursos a que o escritório tem acesso (+ pastas sem curso) — o
-- "X de Y aulas" é o somatório dos cursos acessíveis. Resto igual à 046.
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
     where (p.empresa_id is null or p.empresa_id = p_empresa_id)
       and (p.curso_id is null or empresa_acessa_curso(p_empresa_id, p.curso_id))
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
