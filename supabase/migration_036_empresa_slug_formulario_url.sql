-- ════════════════════════════════════════════════════════════════
-- MIGRATION 036 — Endereço do escritório (empresas.slug) e URL hierárquica
-- dos formulários: /e/<slug do escritório>/<slug do formulário>
-- Rodar no SQL Editor do Supabase ANTES de publicar a Edge Function
-- `formulario-publico` nova (ela busca por empresas.slug).
--
-- A rota antiga /f/<slug> deixa de existir (decisão: links e embeds antigos
-- param de funcionar). O slug do formulário passa a ser único só dentro do
-- escritório.
-- ════════════════════════════════════════════════════════════════

-- 1. coluna ───────────────────────────────────────────────────────────────
alter table empresas add column if not exists slug text;

-- 2. slug a partir do nome (sem depender da extensão unaccent: translate,
--    como na migration_026) — mesmo formato dos slugs de formulário
create or replace function empresa_slug_base(p_nome text)
returns text language sql immutable as $$
  select case
    when s = '' then 'escritorio'
    when char_length(s) < 3 then s || '-escritorio'
    else s
  end
  from (
    select trim(both '-' from left(regexp_replace(
      lower(translate(coalesce(p_nome, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
      '[^a-z0-9]+', '-', 'g'), 50)) as s
  ) x
$$;

-- 3. preenche quem não tem; repetidos ganham -2, -3… (o mais antigo fica com o nome limpo)
do $$
declare
  e record;
  v_base text;
  v_slug text;
  n int;
begin
  for e in select id, nome from empresas where slug is null or slug = '' order by created_at nulls last, id loop
    v_base := empresa_slug_base(e.nome);
    v_slug := v_base;
    n := 1;
    while exists (select 1 from empresas where slug = v_slug and id <> e.id) loop
      n := n + 1;
      v_slug := v_base || '-' || n;
    end loop;
    update empresas set slug = v_slug where id = e.id;
  end loop;
end $$;

-- escritórios criados depois desta migration já nascem com slug (o app cria
-- a empresa no cadastro sem mandar slug — sem isto o NOT NULL barraria)
create or replace function empresas_preenche_slug()
returns trigger language plpgsql as $$
declare
  v_base text;
  n int := 1;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  v_base := empresa_slug_base(new.nome);
  new.slug := v_base;
  while exists (select 1 from empresas where slug = new.slug) loop
    n := n + 1;
    new.slug := v_base || '-' || n;
  end loop;
  return new;
end $$;
drop trigger if exists empresas_preenche_slug on empresas;
create trigger empresas_preenche_slug before insert on empresas
  for each row execute function empresas_preenche_slug();

-- 4. único, obrigatório e no formato de URL ───────────────────────────────
alter table empresas alter column slug set not null;
alter table empresas drop constraint if exists empresas_slug_unique;
alter table empresas add constraint empresas_slug_unique unique (slug);
alter table empresas drop constraint if exists empresas_slug_formato;
alter table empresas add constraint empresas_slug_formato
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60);

-- 5. slug do formulário: único por escritório (era global — índice
--    formularios_slug_unico da migration_026)
drop index if exists formularios_slug_unico;
alter table formularios drop constraint if exists formularios_slug_key;
drop index if exists formularios_slug_key;
create unique index if not exists formularios_empresa_slug_unique on formularios (empresa_id, slug);

-- 6. trocar o endereço pelo app (Configurações): master e gestor do próprio
--    escritório. A policy de update de empresas (migration_011) é só do
--    master e vale para todas as colunas — em vez de abri-la para o gestor,
--    esta função troca SÓ o slug.
create or replace function empresa_atualizar_slug(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if auth_empresa_id() is null or not coalesce(auth_is_gestor_ou_superior(), false) then
    raise exception 'Sem permissão para alterar o endereço do escritório' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 60 then
    raise exception 'Endereço inválido: use letras minúsculas, números e hífens (3 a 60)' using errcode = '22023';
  end if;
  update empresas set slug = v_slug where id = auth_empresa_id();  -- 23505 se já estiver em uso
  return v_slug;
end $$;
revoke all on function empresa_atualizar_slug(text) from public;
grant execute on function empresa_atualizar_slug(text) to authenticated;

-- RLS de empresas: nada muda — a leitura da própria empresa (schema) já
-- inclui a coluna nova; a Edge Function lê com service role.

notify pgrst, 'reload schema';

-- conferência
select nome, slug from empresas order by nome;
