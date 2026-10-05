-- ════════════════════════════════════════════════════════════════
-- MIGRATION 039 — Formulários: escolha única (radio), múltipla escolha
-- (checkbox), opção "Outro" e página de agradecimento condicional
-- Rodar no SQL Editor do Supabase ANTES de publicar a Edge Function
-- formulario-publico e o front novos.
-- ════════════════════════════════════════════════════════════════

-- 1. tipos novos de pergunta ──────────────────────────────────────────────
--    radio    = escolha única com bolinhas (valor: texto)
--    checkbox = múltipla escolha (valor: lista de textos)
--    A constraint da migration_025 só aceitava os 6 tipos antigos.
alter table formulario_campos drop constraint if exists formulario_campos_tipo_check;
alter table formulario_campos add constraint formulario_campos_tipo_check
  check (tipo in ('text', 'textarea', 'number', 'phone', 'email', 'select', 'radio', 'checkbox'));

-- Opção "Outro" (radio e checkbox): mais um item em formulario_campos.opcoes,
--   { "value": "__outro__", "tipo": "outro" }
-- No formulário o visitante escreve o complemento; a resposta gravada é
-- "Outro: <texto>" (ou "Outro:" em branco). Sem mudança estrutural.

-- 2. página de agradecimento condicional ("página A") ─────────────────────
--    A página padrão ("página B") continua sendo sucesso_titulo,
--    sucesso_texto, obrigado_botao_texto e obrigado_botao_url (028/029).
--    obrigado_condicao: [{ "campo_id": "<uuid>", "valores": ["Residencial", "__outro__"] }]
--      regras em OU; valores de uma regra em OU; "__outro__" casa com
--      qualquer resposta "Outro: …". Vale só com "Mostrar mensagem".
alter table formularios
  add column if not exists obrigado_a_ativa boolean not null default false,
  add column if not exists sucesso_a_titulo text,
  add column if not exists sucesso_a_texto text,
  add column if not exists obrigado_a_botao_texto text,
  add column if not exists obrigado_a_botao_url text,
  add column if not exists obrigado_condicao jsonb not null default '[]'::jsonb;

alter table formularios drop constraint if exists formularios_obrigado_a_valida;
alter table formularios add constraint formularios_obrigado_a_valida check (
  char_length(coalesce(sucesso_a_titulo, '')) <= 120
  and char_length(coalesce(sucesso_a_texto, '')) <= 1000
  and char_length(coalesce(obrigado_a_botao_texto, '')) <= 60
  and (obrigado_a_botao_url is null or (obrigado_a_botao_url ~* '^https?://[^[:space:]]+$' and char_length(obrigado_a_botao_url) <= 2000))
  and jsonb_typeof(obrigado_condicao) = 'array'
  and jsonb_array_length(obrigado_condicao) <= 20
);

notify pgrst, 'reload schema';
