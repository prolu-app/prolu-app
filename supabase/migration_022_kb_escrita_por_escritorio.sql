-- ════════════════════════════════════════════════════════════════
-- MIGRATION 022 — Base de Conhecimento: escrita por escritório + Prolu global
-- Rodar no SQL Editor do Supabase.
--
-- Mesmo padrão dos modelos de precificação (migrations 015/019):
--   conteúdo Prolu (empresa_id null)     → escreve só prolu_admin
--   conteúdo do escritório (empresa_id)  → escreve master/gestor/prolu_admin
--                                          da PRÓPRIA empresa (= auth_empresa_id())
-- Leitura:
--   pastas  → policy "usuario ve pastas" (migration 010) continua valendo:
--             Prolu + própria empresa, respeitando nivel_acesso; prolu_admin vê tudo
--   módulos/aulas/pdfs → herdam a visibilidade da pasta pai (antes eram
--             "using (true)": qualquer escritório lia módulos/aulas de outro via API)
--
-- Substitui TODAS as policies de kb_pastas/kb_modulos/kb_aulas/kb_aula_pdfs
-- (o banco tem policies que não estão no repositório; recriar o conjunto
-- inteiro deixa o estado conhecido) e as de escrita do bucket kb-pdfs.
--
-- Estado real antes desta migration (diagnóstico 2026-09-29):
--   - "todos leem pastas/modulos/aulas/pdfs" = true → qualquer usuário lia o
--     conteúdo de qualquer escritório, e nivel_acesso não valia no banco
--     (a policy "usuario ve pastas" era somada por OR com essa aberta)
--   - escrita: gestor+ da própria empresa OU prolu_admin em qualquer empresa
-- ════════════════════════════════════════════════════════════════

-- 1. Regra única de escrita
create or replace function kb_pode_escrever(p_empresa_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case when p_empresa_id is null then auth_is_prolu_admin()
         else p_empresa_id = auth_empresa_id() and auth_is_gestor_ou_superior()
    end,
    false)
$$;

-- 2. Remove todas as policies atuais das tabelas da BC
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('kb_pastas', 'kb_modulos', 'kb_aulas', 'kb_aula_pdfs')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3. kb_pastas
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
create policy "escreve pastas do escritorio ou prolu" on kb_pastas
  for all using (kb_pode_escrever(empresa_id))
  with check (kb_pode_escrever(empresa_id));

-- 4. kb_modulos — a subquery em kb_pastas passa pela RLS de kb_pastas,
--    então o módulo só é visível se a pasta for.
create policy "ve modulos de pastas visiveis" on kb_modulos
  for select using (pasta_id in (select id from kb_pastas));
create policy "escreve modulos do escritorio ou prolu" on kb_modulos
  for all using (kb_pode_escrever(empresa_id))
  with check (
    kb_pode_escrever(empresa_id)
    -- módulo tem que ser da mesma empresa da pasta (impede enfiar módulo em pasta Prolu/alheia)
    and exists (select 1 from kb_pastas p where p.id = pasta_id and p.empresa_id is not distinct from kb_modulos.empresa_id)
  );

-- 5. kb_aulas
create policy "ve aulas de modulos visiveis" on kb_aulas
  for select using (modulo_id in (select id from kb_modulos));
create policy "escreve aulas do escritorio ou prolu" on kb_aulas
  for all using (kb_pode_escrever(empresa_id))
  with check (
    kb_pode_escrever(empresa_id)
    and exists (select 1 from kb_modulos m where m.id = modulo_id and m.empresa_id is not distinct from kb_aulas.empresa_id)
  );

-- 6. kb_aula_pdfs (anexos; não tem empresa_id — usa o da aula)
create policy "ve pdfs de aulas visiveis" on kb_aula_pdfs
  for select using (aula_id in (select id from kb_aulas));
create policy "escreve pdfs do escritorio ou prolu" on kb_aula_pdfs
  for all using (exists (select 1 from kb_aulas a where a.id = aula_id and kb_pode_escrever(a.empresa_id)))
  with check (exists (select 1 from kb_aulas a where a.id = aula_id and kb_pode_escrever(a.empresa_id)));

-- 7. Storage kb-pdfs — a 1ª pasta do caminho do arquivo define o dono:
--      'prolu/…'             → conteúdo Prolu: só prolu_admin
--      '<empresa_id>/…'      → conteúdo do escritório: gestor+ da própria empresa
--    (PDFs Prolu antigos estão em '<empresa da Prolu>/…' e continuam
--     editáveis pelo prolu_admin pela 2ª regra.)
--    Leitura continua pública (o player embeda o PDF pela URL pública).
--    No banco real (diagnóstico de 2026-09-29) as policies de escrita eram
--    "usuarios autenticados fazem upload" / "usuarios autenticados excluem",
--    só com bucket_id = 'kb-pdfs' — qualquer usuário logado, de qualquer
--    escritório e qualquer perfil, enviava/apagava qualquer arquivo.
--    "usuarios autenticados visualizam" (SELECT) é mantida: leitura pública
--    é pendência registrada em docs/pendencias-seguranca.md.
drop policy if exists "usuarios autenticados fazem upload" on storage.objects;
drop policy if exists "usuarios autenticados excluem"      on storage.objects;
drop policy if exists "gestor+ envia pdfs da kb"    on storage.objects;
drop policy if exists "gestor+ atualiza pdfs da kb" on storage.objects;
drop policy if exists "gestor+ remove pdfs da kb"   on storage.objects;
drop policy if exists "kb-pdfs: escreve do escritorio ou prolu" on storage.objects;

create policy "kb-pdfs: escreve do escritorio ou prolu" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'kb-pdfs' and (
      ((storage.foldername(name))[1] = 'prolu' and auth_is_prolu_admin())
      or ((storage.foldername(name))[1] = auth_empresa_id()::text and auth_is_gestor_ou_superior())
    )
  )
  with check (
    bucket_id = 'kb-pdfs' and (
      ((storage.foldername(name))[1] = 'prolu' and auth_is_prolu_admin())
      or ((storage.foldername(name))[1] = auth_empresa_id()::text and auth_is_gestor_ou_superior())
    )
  );
