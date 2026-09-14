-- ════════════════════════════════════════════════════════════════
-- MIGRATION 012 — aulas em PDF na Base de Conhecimento
-- Rodar no SQL Editor do Supabase.
--
-- Permite que uma aula seja do tipo 'video' (padrão, YouTube) ou
-- 'pdf' (arquivo enviado para o bucket de Storage kb-pdfs).
-- ════════════════════════════════════════════════════════════════

-- 1. Campos novos em kb_aulas.
alter table kb_aulas
  add column if not exists tipo text default 'video'
  check (tipo in ('video', 'pdf'));
alter table kb_aulas
  add column if not exists pdf_url text;

update kb_aulas set tipo = 'video' where tipo is null;

-- 2. Bucket público para os PDFs das aulas.
insert into storage.buckets (id, name, public)
values ('kb-pdfs', 'kb-pdfs', true)
on conflict (id) do nothing;

-- 3. Policies do bucket: leitura pública (o player embeda o PDF direto
-- pela URL pública), escrita restrita a gestor/master/prolu_admin —
-- os mesmos papéis que já podem editar aulas na Base de Conhecimento.
drop policy if exists "leitura publica de pdfs da kb" on storage.objects;
create policy "leitura publica de pdfs da kb" on storage.objects
  for select using (bucket_id = 'kb-pdfs');

drop policy if exists "gestor+ envia pdfs da kb" on storage.objects;
create policy "gestor+ envia pdfs da kb" on storage.objects
  for insert with check (bucket_id = 'kb-pdfs' and auth_is_gestor_ou_superior());

drop policy if exists "gestor+ atualiza pdfs da kb" on storage.objects;
create policy "gestor+ atualiza pdfs da kb" on storage.objects
  for update using (bucket_id = 'kb-pdfs' and auth_is_gestor_ou_superior());

drop policy if exists "gestor+ remove pdfs da kb" on storage.objects;
create policy "gestor+ remove pdfs da kb" on storage.objects
  for delete using (bucket_id = 'kb-pdfs' and auth_is_gestor_ou_superior());
