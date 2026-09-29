-- ════════════════════════════════════════════════════════════════
-- Teste DEPOIS da migration_022 — somente leitura (termina em rollback).
-- Não precisa editar nada: rode o arquivo inteiro de uma vez.
--
-- Escolhe sozinho 3 usuários reais e, para cada um, simula o login e mede
-- o que ele pode ler/escrever na Base de Conhecimento:
--   - o master do escritório "Talita Shigueoka…"
--   - um usuário comum (de preferência da Talita; senão, de qualquer escritório)
--   - o prolu_admin
--
-- Esperado:
--                              master   comum   prolu_admin
--   pode_escrever_prolu         false    false   true
--   pode_escrever_propria       true     false   true
--   pastas_de_outros_visiveis   0        0       > 0 (leitura p/ suporte)
--   modulos_de_outros_visiveis  0        0       > 0
--   aulas_de_outros_visiveis    0        0       > 0
-- ════════════════════════════════════════════════════════════════
begin;

create temp table _teste_kb (
  ordem int, email text, perfil text, escritorio text,
  pode_escrever_prolu boolean, pode_escrever_propria boolean,
  pastas_de_outros_visiveis bigint, modulos_de_outros_visiveis bigint, aulas_de_outros_visiveis bigint
) on commit drop;
grant all on _teste_kb to authenticated;

do $$
declare
  alvos jsonb;
  u jsonb;
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

  for u in select * from jsonb_array_elements(coalesce(alvos, '[]'::jsonb)) loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', u->>'auth_id', 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    insert into _teste_kb
    select (u->>'ordem')::int, u->>'email', u->>'role', u->>'nome',
      kb_pode_escrever(null),
      kb_pode_escrever(auth_empresa_id()),
      (select count(*) from kb_pastas  where empresa_id is not null and empresa_id is distinct from auth_empresa_id()),
      (select count(*) from kb_modulos where empresa_id is not null and empresa_id is distinct from auth_empresa_id()),
      (select count(*) from kb_aulas   where empresa_id is not null and empresa_id is distinct from auth_empresa_id());

    execute 'reset role';
  end loop;
end $$;

select email, perfil, escritorio,
       pode_escrever_prolu, pode_escrever_propria,
       pastas_de_outros_visiveis, modulos_de_outros_visiveis, aulas_de_outros_visiveis
from _teste_kb
order by ordem;

rollback;
