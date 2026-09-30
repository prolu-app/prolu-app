-- ════════════════════════════════════════════════════════════════
-- MIGRATION 024 — Ações em massa no CRM (atualização em lote)
-- Rodar no SQL Editor do Supabase ANTES do deploy do front que usa isso.
--
-- Por que uma função: os campos do CRM ficam em crm_linhas.valores (jsonb,
-- { coluna_id: valor }). Um PATCH em lote da API REST só consegue gravar o
-- MESMO jsonb inteiro em todas as linhas — não "muda só a chave Status e
-- mantém o resto". Aqui o merge (valores || patch) é feito no banco, num
-- único UPDATE para todos os ids.
--
-- SECURITY INVOKER (padrão): roda com o usuário logado, então a RLS de
-- crm_linhas vale normalmente — linhas que ele não pode editar ficam de fora
-- em silêncio. A função devolve quantas linhas foram de fato atualizadas,
-- para o app avisar se alguma ficou de fora.
--
-- Regra da data de fechamento (a mesma da edição individual, CRM.jsx
-- efeitoStatusNaDataFech), aplicada quando o patch muda a coluna de slug
-- 'status':
--   → "Fechado"                 : preenche data_fechamento com p_hoje, se vazia
--   "Fechado" → qualquer outro  : limpa data_fechamento (null)
-- p_hoje vem do app (data LOCAL do usuário, igual à edição individual).
-- ════════════════════════════════════════════════════════════════

create or replace function crm_linhas_atualizar_em_massa(
  p_ids   uuid[],
  p_patch jsonb,
  p_hoje  date default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update crm_linhas l
  set valores = l.valores || p_patch || coalesce((
        select case
          when k.status_id is null or k.data_fech_id is null or not (p_patch ? k.status_id) then '{}'::jsonb
          when p_patch->>k.status_id = 'Fechado'
               and coalesce(l.valores->>k.data_fech_id, '') = ''
            then jsonb_build_object(k.data_fech_id, coalesce(p_hoje, current_date)::text)
          when p_patch->>k.status_id is distinct from 'Fechado'
               and l.valores->>k.status_id = 'Fechado'
            then jsonb_build_object(k.data_fech_id, null)
          else '{}'::jsonb
        end
        -- colunas status/data_fechamento DESTA empresa (ids diferem por escritório)
        from (
          select max(case when c.opcoes->>'slug' = 'status'          then c.id::text end) as status_id,
                 max(case when c.opcoes->>'slug' = 'data_fechamento' then c.id::text end) as data_fech_id
          from crm_colunas c
          where c.empresa_id = l.empresa_id and jsonb_typeof(c.opcoes) = 'object'
        ) k
      ), '{}'::jsonb),
      updated_at = now()
  where l.id = any(p_ids);

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function crm_linhas_atualizar_em_massa(uuid[], jsonb, date) from public, anon;
grant execute on function crm_linhas_atualizar_em_massa(uuid[], jsonb, date) to authenticated;
