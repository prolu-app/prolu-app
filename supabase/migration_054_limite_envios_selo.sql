-- ════════════════════════════════════════════════════════════════
-- migration_054 — Limite de envios de formulário (Starter) + selo
-- "Feito com Prolu" fixo na Minha Página do Starter
--
--   formulario_envios_mes  → contador por escritório e mês (America/Sao_Paulo).
--                            Conta SEMPRE, em todos os planos; o bloqueio só
--                            vale quando empresa_limite() devolve número.
--                            Começa do zero (sem backfill).
--   empresa_limite()       → espelho numérico de LIMITES (src/utils/planos.js)
--   empresa_libera()       → + 'selo_removivel' (pro), espelho de RECURSOS
--   form_reservar_envio    → reserva atômica (uma instrução: insert … on
--                            conflict … where total < limite) — dois envios
--                            simultâneos no 5º não passam os dois
--   form_devolver_envio    → desconta quando a gravação no CRM falha
--   form_situacao_envios   → usados/limite/esgotado (uso interno das funções)
--   form_marcar_aviso_limite → marca o e-mail de limite (uma vez por mês)
--   form_envios_mes        → números do painel (master e prolu_admin)
--   pagina_publica()       → + 'selo': decidido aqui pelo plano, não pelo flag
--
-- As funções de reserva/devolução/aviso só rodam com a service role (Edge
-- Functions formulario-publico e formulario-limite-aviso).
--
-- Idempotente: pode rodar de novo sem efeito colateral.
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. Contador mensal ─────────
create table if not exists formulario_envios_mes (
  empresa_id uuid not null references empresas(id) on delete cascade,
  mes date not null,                 -- primeiro dia do mês (America/Sao_Paulo)
  total int not null default 0,
  aviso_limite_em timestamptz,       -- e-mail "parou de receber" já enviado neste mês
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, mes)
);
alter table formulario_envios_mes drop constraint if exists formulario_envios_mes_valida;
alter table formulario_envios_mes add constraint formulario_envios_mes_valida
  check (total >= 0 and mes = date_trunc('month', mes)::date);

-- leitura: master do próprio escritório ou prolu_admin; escrita: só as funções
-- (sem policy de insert/update/delete = negado para anon e authenticated)
alter table formulario_envios_mes enable row level security;
drop policy if exists "formulario_envios_mes: le master ou prolu_admin" on formulario_envios_mes;
create policy "formulario_envios_mes: le master ou prolu_admin" on formulario_envios_mes
  for select using (
    (empresa_id = auth_empresa_id() and auth_is_empresa_master())
    or auth_is_prolu_admin()
  );

-- mês corrente em São Paulo (p_agora permite testar a virada do mês)
create or replace function mes_sao_paulo(p_agora timestamptz default now()) returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('month', p_agora at time zone 'America/Sao_Paulo')::date
$$;

-- ───────── 2. Limites numéricos por plano ─────────
-- ESPELHO de LIMITES em src/utils/planos.js: ao mudar um limite lá, mudar aqui.
-- null = sem limite (planos acima, recurso desconhecido ou escritório inexistente).
create or replace function empresa_limite(p_empresa_id uuid, p_limite text) returns int
language sql
stable
security definer
set search_path = public
as $$
  select case p_limite
           when 'envios_form_mes' then case e.plano when 'starter' then 5 end
         end
    from empresas e
   where e.id = p_empresa_id
$$;
revoke all on function empresa_limite(uuid, text) from public, anon;
grant execute on function empresa_limite(uuid, text) to authenticated, service_role;

-- ───────── 3. empresa_libera(): + selo_removivel ─────────
-- mesma função da migration_045, com 'selo_removivel' (pro)
create or replace function empresa_libera(p_empresa_id uuid, p_recurso text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.status_conta = 'ativa'
       and plano_nivel(e.plano) >= plano_nivel(case p_recurso
             when 'painel_comercial'     then 'pro'
             when 'indicadores'          then 'pro'
             when 'selo_removivel'       then 'pro'
             when 'equipe_convites'      then 'business'
             when 'ferramentas_mentoria' then 'mentoria'
           end)
      from empresas e
     where e.id = p_empresa_id
  ), false)
$$;
revoke all on function empresa_libera(uuid, text) from public, anon;
grant execute on function empresa_libera(uuid, text) to authenticated, service_role;

-- ───────── 4. Reserva e devolução (só service role) ─────────
-- Devolve { aceito, total, limite, mes }. Recusa sem alterar nada quando o
-- limite do mês já foi alcançado.
create or replace function form_reservar_envio(p_empresa_id uuid, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := mes_sao_paulo(p_agora);
  v_limite int := empresa_limite(p_empresa_id, 'envios_form_mes');
  v_total int;
begin
  if v_limite is not null and v_limite <= 0 then
    select coalesce((select total from formulario_envios_mes where empresa_id = p_empresa_id and mes = v_mes), 0) into v_total;
    return jsonb_build_object('aceito', false, 'total', v_total, 'limite', v_limite, 'mes', v_mes);
  end if;

  insert into formulario_envios_mes as t (empresa_id, mes, total)
  values (p_empresa_id, v_mes, 1)
  on conflict (empresa_id, mes) do update
     set total = t.total + 1, atualizado_em = now()
   where v_limite is null or t.total < v_limite
  returning t.total into v_total;

  if found then
    return jsonb_build_object('aceito', true, 'total', v_total, 'limite', v_limite, 'mes', v_mes);
  end if;
  select total into v_total from formulario_envios_mes where empresa_id = p_empresa_id and mes = v_mes;
  return jsonb_build_object('aceito', false, 'total', v_total, 'limite', v_limite, 'mes', v_mes);
end $$;
revoke all on function form_reservar_envio(uuid, timestamptz) from public, anon, authenticated;
grant execute on function form_reservar_envio(uuid, timestamptz) to service_role;

-- desconta a reserva do mês informado (o da reserva, mesmo que o mês vire no meio)
create or replace function form_devolver_envio(p_empresa_id uuid, p_mes date) returns void
language sql
security definer
set search_path = public
as $$
  update formulario_envios_mes
     set total = greatest(total - 1, 0), atualizado_em = now()
   where empresa_id = p_empresa_id and mes = p_mes
$$;
revoke all on function form_devolver_envio(uuid, date) from public, anon, authenticated;
grant execute on function form_devolver_envio(uuid, date) to service_role;

-- ───────── 5. Situação do mês ─────────
-- uso interno (formulario-publico no "carregar"): sem checagem de usuário
create or replace function form_situacao_envios(p_empresa_id uuid, p_agora timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usados', coalesce(c.total, 0),
    'limite', l.limite,
    'esgotado', l.limite is not null and coalesce(c.total, 0) >= l.limite,
    'mes', mes_sao_paulo(p_agora)
  )
    from (select empresa_limite(p_empresa_id, 'envios_form_mes') as limite) l
    left join formulario_envios_mes c
      on c.empresa_id = p_empresa_id and c.mes = mes_sao_paulo(p_agora)
$$;
revoke all on function form_situacao_envios(uuid, timestamptz) from public, anon, authenticated;
grant execute on function form_situacao_envios(uuid, timestamptz) to service_role;

-- painel de formulários: master do próprio escritório ou prolu_admin
create or replace function form_envios_mes(p_empresa_id uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (p_empresa_id = auth_empresa_id() and coalesce(auth_is_empresa_master(), false))
      or coalesce(auth_is_prolu_admin(), false)
    then form_situacao_envios(p_empresa_id)
  end
$$;
revoke all on function form_envios_mes(uuid) from public, anon;
grant execute on function form_envios_mes(uuid) to authenticated;

-- ───────── 6. Aviso de limite: uma vez por escritório por mês ─────────
-- true só para quem marcou agora (marcação atômica); p_desmarcar = true
-- devolve a marcação quando o e-mail falha, para tentar no próximo bloqueio.
create or replace function form_marcar_aviso_limite(p_empresa_id uuid, p_mes date, p_desmarcar boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_desmarcar then
    update formulario_envios_mes set aviso_limite_em = null
     where empresa_id = p_empresa_id and mes = p_mes;
    return false;
  end if;
  update formulario_envios_mes set aviso_limite_em = now()
   where empresa_id = p_empresa_id and mes = p_mes and aviso_limite_em is null;
  return found;
end $$;
revoke all on function form_marcar_aviso_limite(uuid, date, boolean) from public, anon, authenticated;
grant execute on function form_marcar_aviso_limite(uuid, date, boolean) to service_role;

-- ───────── 7. Minha Página: selo decidido no servidor ─────────
-- mesma função da migration_045, com 'selo': no Starter (empresa_libera nega
-- 'selo_removivel') o selo aparece sempre; nos demais planos segue o
-- rodape_prolu salvo (ausente = ligado). O flag salvo não é alterado.
create or replace function pagina_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'escritorio', e.nome,
    'slug', e.slug,
    'config', e.pagina_config,
    'selo', not empresa_libera(e.id, 'selo_removivel')
            or coalesce(e.pagina_config->>'rodape_prolu', 'true') <> 'false',
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'tipo', l.tipo,
               'titulo', l.titulo,
               'url', case when l.tipo = 'link' then l.url end,
               'slug_formulario', f.slug,
               'estilo', l.estilo,
               'imagem_url', l.imagem_url,
               'imagem_modo', case when l.imagem_url is not null then coalesce(l.imagem_modo, 'icone') end
             ) order by l.ordem, l.created_at)
        from pagina_links l
        left join formularios f
          on l.tipo = 'formulario' and f.id = l.formulario_id and f.empresa_id = l.empresa_id and f.ativo
       where l.empresa_id = e.id
         and l.ativo
         and l.titulo <> ''
         and ((l.tipo = 'link' and l.url is not null) or (l.tipo = 'formulario' and f.id is not null))
    ), '[]'::jsonb)
  )
  from empresas e
  where e.slug = lower(trim(coalesce(p_slug, '')))
    and e.pagina_config->>'publicada' = 'true'
    and e.status_conta = 'ativa'
$$;
revoke all on function pagina_publica(text) from public;
grant execute on function pagina_publica(text) to anon, authenticated;

notify pgrst, 'reload schema';
