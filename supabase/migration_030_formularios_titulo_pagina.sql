-- ════════════════════════════════════════════════════════════════
-- MIGRATION 030 — Formulários públicos: título da página
-- Rodar no SQL Editor do Supabase.
--
-- Nome e descrição do formulário passam a ser só de uso interno (editor e
-- lista). O visitante vê titulo_pagina; se vazio, o nome do escritório
-- (empresas.nome). A Edge Function `formulario-publico` lê com select('*'):
-- pode ser publicada antes ou depois desta migration.
-- ════════════════════════════════════════════════════════════════

alter table formularios add column if not exists titulo_pagina text;

alter table formularios drop constraint if exists formularios_titulo_pagina_tamanho;
alter table formularios add constraint formularios_titulo_pagina_tamanho
  check (char_length(coalesce(titulo_pagina, '')) <= 120);
