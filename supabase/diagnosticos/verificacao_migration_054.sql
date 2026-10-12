-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_054 (limite de envios + selo da Minha Página)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Todo bloco termina em ROLLBACK:
-- nada fica gravado (plano do escritório de teste, contador, página).
-- Escritório de teste: master andresouzavr@gmail.com.
-- Plano/status mudam ANTES de simular a identidade (com o JWT simulado o
-- gatilho empresas_protege_plano recusa) — mesmo cuidado da 052.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estrutura (só leitura) ──
select to_regclass('public.formulario_envios_mes') as tabela,
       (select relrowsecurity from pg_class where oid = 'public.formulario_envios_mes'::regclass) as rls,
       (select count(*) from pg_policies where tablename = 'formulario_envios_mes') as policies;   -- 1 (só leitura)
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('empresa_limite', 'empresa_libera', 'form_reservar_envio', 'form_devolver_envio',
                     'form_situacao_envios', 'form_envios_mes', 'form_marcar_aviso_limite', 'pagina_publica', 'mes_sao_paulo')
 order by p.proname;
-- esperado: reservar/devolver/situacao/marcar → authenticated false, anon false;
-- empresa_limite/empresa_libera/form_envios_mes → authenticated true, anon false; pagina_publica → anon true


-- ── 2. Starter: 5 envios aceitos, o 6º recusado ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select n as envio, form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) as resultado
  from generate_series(1, 6) n;
-- esperado: 1–5 aceito=true (total 1..5, limite 5); 6 aceito=false, total 5
select form_situacao_envios((select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) as situacao; -- usados 5, esgotado true
rollback;


-- ── 3. Pro (e acima): sem limite ──
begin;
update empresas set plano = 'pro' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select n as envio, form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'))->>'aceito' as aceito
  from generate_series(1, 7) n;                                            -- todos true
select form_situacao_envios((select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) as situacao; -- usados 7, limite null, esgotado false
rollback;


-- ── 4. Virada do mês (America/Sao_Paulo) ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select mes_sao_paulo('2026-11-01 02:30:00+00') as utc_madrugada_dia1,     -- 2026-10-01 (ainda 31/10 em SP)
       mes_sao_paulo('2026-11-01 03:10:00+00') as sp_dia1;                 -- 2026-11-01
-- 5 envios em outubro, o 6º de outubro recusado, o 1º de novembro aceito
select n, form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), '2026-10-31 23:00:00-03')->>'aceito' as outubro
  from generate_series(1, 6) n;                                            -- 5×true, 1×false
select form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), '2026-11-01 00:05:00-03') as novembro; -- aceito true, total 1, mes 2026-11-01
select mes, total from formulario_envios_mes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
   and mes in ('2026-10-01', '2026-11-01') order by mes;                  -- out 5, nov 1
rollback;


-- ── 5. Duas reservas no 5º envio ──
-- A reserva é UMA instrução (insert … on conflict … where total < limite):
-- a segunda transação espera o lock da linha e reavalia o where com o total
-- já atualizado. Aqui, em sequência, a partir de 4 usados: só uma passa.
-- (Para ver com duas sessões de verdade: abra 2 abas do SQL Editor com
-- "begin; select form_reservar_envio(…);" e rode o commit de uma por vez.)
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
insert into formulario_envios_mes (empresa_id, mes, total)
values ((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo(), 4)
on conflict (empresa_id, mes) do update set total = 4;
select form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'))->>'aceito' as primeira;  -- true (5)
select form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'))->>'aceito' as segunda;   -- false
select total from formulario_envios_mes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com') and mes = mes_sao_paulo();  -- 5
rollback;


-- ── 6. Aviso de limite marcado uma única vez ──
begin;
insert into formulario_envios_mes (empresa_id, mes, total)
values ((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo(), 5)
on conflict (empresa_id, mes) do update set total = 5, aviso_limite_em = null;
select form_marcar_aviso_limite((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo()) as primeira;  -- true
select form_marcar_aviso_limite((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo()) as segunda;   -- false
-- e-mail falhou → desmarca → o próximo bloqueio tenta de novo
select form_marcar_aviso_limite((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo(), true) as desmarcou;  -- false (só desmarca)
select form_marcar_aviso_limite((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo()) as de_novo;          -- true
rollback;


-- ── 7. Devolução de cota ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) from generate_series(1, 5);
select form_devolver_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo());
select form_reservar_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'))->>'aceito' as depois_de_devolver;  -- true
-- devolver com o contador em 0 não fica negativo
update formulario_envios_mes set total = 0
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com') and mes = mes_sao_paulo();
select form_devolver_envio((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo());
select total from formulario_envios_mes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com') and mes = mes_sao_paulo();  -- 0
rollback;


-- ── 8. RLS do contador e RPCs, como o master de teste ──
begin;
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000054', 'Outro 054');
insert into formulario_envios_mes (empresa_id, mes, total) values
  ((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo(), 3),
  ('00000000-0000-0000-0000-000000000054', mes_sao_paulo(), 2)
on conflict (empresa_id, mes) do update set total = excluded.total;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id from usuarios where email = 'andresouzavr@gmail.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select empresa_id, total from formulario_envios_mes;                     -- só a linha do escritório de teste (3)
select form_envios_mes(auth_empresa_id()) as painel;                      -- usados 3, limite 5, esgotado false
select form_envios_mes('00000000-0000-0000-0000-000000000054') as outro;  -- null
update formulario_envios_mes set total = 0 returning empresa_id;          -- 0 linhas (sem policy de escrita)
-- esperado: ERRO de permissão ao descomentar (só service role)
-- select form_reservar_envio(auth_empresa_id());
reset role;
rollback;


-- ── 9. selo_removivel por plano + pagina_publica ──
begin;
-- página publicada com o selo DESLIGADO no flag salvo
update empresas
   set pagina_config = coalesce(pagina_config, '{}'::jsonb) || '{"publicada": true, "rodape_prolu": false}'::jsonb
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
update empresas set plano = 'starter' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'starter' as plano, empresa_libera(e.id, 'selo_removivel') as remove, pagina_publica(e.slug)->'selo' as selo
  from empresas e where e.id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');  -- false, true (fixo)
update empresas set plano = 'pro' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'pro' as plano, empresa_libera(e.id, 'selo_removivel') as remove, pagina_publica(e.slug)->'selo' as selo
  from empresas e where e.id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');  -- true, false
update empresas set plano = 'business' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'business', empresa_libera(id, 'selo_removivel') from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');      -- true
update empresas set plano = 'mentoria' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'mentoria', empresa_libera(id, 'selo_removivel') from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');      -- true
update empresas set plano = 'consultoria' where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select 'consultoria', empresa_libera(id, 'selo_removivel') from empresas where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');   -- true
-- flag salvo ligado: selo aparece em qualquer plano
update empresas set pagina_config = pagina_config || '{"rodape_prolu": true}'::jsonb
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select pagina_publica(slug)->'selo' as selo_com_flag_ligado from empresas
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');  -- true
-- limite de envios: null fora do Starter
select empresa_limite((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), 'envios_form_mes') as limite_consultoria; -- null
rollback;
