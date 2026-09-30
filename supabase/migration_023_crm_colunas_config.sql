-- ════════════════════════════════════════════════════════════════
-- MIGRATION 023 — Configuração de colunas do CRM persistida por escritório
-- Rodar no SQL Editor do Supabase ANTES do deploy do front que usa isso.
--
-- crm_colunas já tem uma linha por coluna por empresa (empresa_id) e já
-- guarda a ordem (coluna `ordem`). Aqui entram os outros dois ajustes da
-- tela, compartilhados entre todos os usuários do escritório:
--   oculta  → coluna escondida na tabela (antes: localStorage do navegador)
--   largura → largura em px ajustada arrastando a borda do cabeçalho
--             (null = automática)
--
-- Nenhuma policy nova: as de crm_colunas já restringem leitura/escrita à
-- própria empresa, e o app já atualiza essa tabela (renomear coluna,
-- editar opções).
-- ════════════════════════════════════════════════════════════════

alter table crm_colunas
  add column if not exists oculta boolean not null default false;

alter table crm_colunas
  add column if not exists largura int
  check (largura is null or largura between 60 and 800);
