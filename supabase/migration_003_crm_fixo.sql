-- Adiciona coluna `fixo` à tabela crm_colunas para distinguir colunas fixas
-- (não removíveis nem renomeáveis) das colunas dinâmicas criadas pelo usuário.
-- Executar no Supabase SQL Editor.

alter table crm_colunas
  add column if not exists fixo boolean not null default false;

-- Marca como fixas as colunas que já foram criadas com opcoes.fixed = true
-- (formato legado via JSONB). Mantém compatibilidade retroativa.
update crm_colunas
  set fixo = true
  where opcoes is not null
    and jsonb_typeof(opcoes) = 'object'
    and (opcoes->>'fixed')::boolean = true
    and fixo = false;
