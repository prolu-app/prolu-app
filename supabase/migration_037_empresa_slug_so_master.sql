-- ════════════════════════════════════════════════════════════════
-- MIGRATION 037 — Endereço do escritório: só o master altera
-- Rodar no SQL Editor do Supabase.
--
-- A migration_036 deixava master e gestor trocarem empresas.slug pela função
-- empresa_atualizar_slug. Agora só o master (e o prolu_admin no próprio
-- escritório): o endereço derruba todos os links e embeds do escritório, e a
-- tela exige confirmação digitada. Mesma função, só a checagem muda.
-- ════════════════════════════════════════════════════════════════

create or replace function empresa_atualizar_slug(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  -- auth_is_empresa_master() = role in ('prolu_admin', 'master') (migration_001)
  if auth_empresa_id() is null or not coalesce(auth_is_empresa_master(), false) then
    raise exception 'Somente o Master pode alterar o endereço do escritório' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 60 then
    raise exception 'Endereço inválido: use letras minúsculas, números e hífens (3 a 60)' using errcode = '22023';
  end if;
  update empresas set slug = v_slug where id = auth_empresa_id();  -- 23505 se já estiver em uso
  return v_slug;
end $$;
revoke all on function empresa_atualizar_slug(text) from public;
grant execute on function empresa_atualizar_slug(text) to authenticated;

notify pgrst, 'reload schema';
