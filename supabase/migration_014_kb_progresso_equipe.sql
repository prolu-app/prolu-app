-- ════════════════════════════════════════════════════════════════
-- MIGRATION 014 — Painel de progresso da equipe (kb_progresso)
-- Rodar no SQL Editor do Supabase.
--
-- A aba "Painel" da Base de Conhecimento (BaseConhecimento.jsx) busca
-- o progresso de todos os usuários da empresa pra montar um card por
-- pessoa. A policy de kb_progresso, porém, era "for all using
-- (usuario_id = ...)" — só a própria linha, pra qualquer comando. Isso
-- não bloqueia a query no cliente (o supabase-js não sabe que vai
-- voltar vazio), mas o Postgres filtra o resultado silenciosamente:
-- a query com .in('usuario_id', [...todos os ids da empresa]) volta
-- só a linha de quem está logado, então o Painel mostrava progresso
-- real só pra si mesmo e 0% pra todo mundo.
--
-- Esta policy nova é só de SELECT e some via OR com a existente — não
-- muda nada sobre quem pode marcar/desmarcar aula concluída (isso
-- continua exclusivo do próprio usuário_id, coberto pela policy "for
-- all" já existente).
-- ════════════════════════════════════════════════════════════════

drop policy if exists "gestor ve progresso da equipe" on kb_progresso;
create policy "gestor ve progresso da equipe" on kb_progresso
  for select using (
    auth_is_gestor_ou_superior()
    and usuario_id in (select id from usuarios where empresa_id = auth_empresa_id())
  );
