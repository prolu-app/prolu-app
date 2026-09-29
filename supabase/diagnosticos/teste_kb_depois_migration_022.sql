-- ════════════════════════════════════════════════════════════════
-- Teste DEPOIS da migration_022 — não grava nada. Rode o arquivo inteiro,
-- sem editar.
--
-- ATENÇÃO: o resultado aparece como "ERROR" DE PROPÓSITO. O script termina
-- abortando com uma mensagem que contém o resultado — isso garante que
-- nada fica gravado (o SQL Editor do Supabase não respeita begin/rollback
-- entre comandos, por isso é tudo um comando só).
--
-- Escolhe sozinho 3 usuários reais e simula o login de cada um:
--   - o master do escritório "Talita Shigueoka…"
--   - um usuário comum (de preferência da Talita; senão, de qualquer escritório)
--   - o prolu_admin
-- Cada linha termina em OK ou FALHOU, comparando com o esperado:
--                              master   comum   prolu_admin
--   escreve conteúdo Prolu      não      não     sim
--   escreve no próprio          sim      não     sim
--   vê conteúdo de outros       0        0       > 0 (leitura p/ suporte)
-- ════════════════════════════════════════════════════════════════
do $$
declare
  alvos jsonb;
  u jsonb;
  v_prolu boolean;
  v_propria boolean;
  v_pastas bigint;
  v_modulos bigint;
  v_aulas bigint;
  v_ok boolean;
  v_saida text := 'RESULTADO DO TESTE (o "erro" é proposital, nada foi gravado):';
begin
  -- escolhe os usuários antes de trocar de papel (como postgres, sem RLS)
  select jsonb_agg(x order by x.ordem) into alvos from (
    (select 1 as ordem, us.auth_id, us.email, us.role, e.nome
       from usuarios us join empresas e on e.id = us.empresa_id
      where us.role = 'master' and e.nome ilike 'Talita Shigueoka%' and us.auth_id is not null
      limit 1)
    union all
    (select 2, us.auth_id, us.email, us.role, e.nome
       from usuarios us join empresas e on e.id = us.empresa_id
      where us.role = 'comum' and us.auth_id is not null
      order by (e.nome ilike 'Talita Shigueoka%') desc
      limit 1)
    union all
    (select 3, us.auth_id, us.email, us.role, e.nome
       from usuarios us left join empresas e on e.id = us.empresa_id
      where us.role = 'prolu_admin' and us.auth_id is not null
      limit 1)
  ) x;

  if alvos is null then
    raise exception 'Nenhum usuário encontrado para testar.';
  end if;

  for u in select * from jsonb_array_elements(alvos) loop
    -- simula o login desse usuário
    perform set_config('request.jwt.claims',
      json_build_object('sub', u->>'auth_id', 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    v_prolu   := kb_pode_escrever(null);
    v_propria := kb_pode_escrever(auth_empresa_id());
    select count(*) into v_pastas  from kb_pastas  where empresa_id is not null and empresa_id is distinct from auth_empresa_id();
    select count(*) into v_modulos from kb_modulos where empresa_id is not null and empresa_id is distinct from auth_empresa_id();
    select count(*) into v_aulas   from kb_aulas   where empresa_id is not null and empresa_id is distinct from auth_empresa_id();

    execute 'reset role';

    v_ok := case u->>'role'
      when 'master'      then not v_prolu and v_propria and v_pastas = 0 and v_modulos = 0 and v_aulas = 0
      when 'comum'       then not v_prolu and not v_propria and v_pastas = 0 and v_modulos = 0 and v_aulas = 0
      when 'prolu_admin' then v_prolu and v_propria
    end;

    v_saida := v_saida || E'\n' || format(
      '[%s] %s (%s, %s) | escreve Prolu: %s | escreve no próprio: %s | vê de outros: %s pastas, %s módulos, %s aulas',
      case when v_ok then 'OK' else 'FALHOU' end,
      u->>'role', u->>'email', coalesce(u->>'nome', 'sem escritório'),
      case when v_prolu then 'sim' else 'não' end,
      case when v_propria then 'sim' else 'não' end,
      v_pastas, v_modulos, v_aulas);
  end loop;

  raise exception '%', v_saida;
end $$;
