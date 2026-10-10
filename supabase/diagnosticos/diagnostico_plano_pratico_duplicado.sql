-- ════════════════════════════════════════════════════════════════
-- Diagnóstico: Plano Prático duplicado no escritório de teste
-- SÓ LEITURA. Rodar no SQL Editor, um bloco de cada vez.
-- Troque 'master@teste.com' pelo e-mail do master do escritório de teste.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Linha do tempo do escritório de teste ──
-- Compare: criação do escritório, backfill (migration_049) e as duas cópias.
select 'escritório criado' as evento, e.created_at as quando
  from empresas e where e.id = (select empresa_id from usuarios where email = 'master@teste.com')
union all
select 'backfill da 049', backfill_em from plano_modelo_meta
union all
select 'tag: ' || nome, created_at from plano_tags
 where empresa_id = (select empresa_id from usuarios where email = 'master@teste.com')
union all
select 'ação ' || ordem || ': ' || left(texto, 40), created_at from plano_acoes
 where empresa_id = (select empresa_id from usuarios where email = 'master@teste.com')
order by quando;


-- ── 2. As duas cópias lado a lado (por nome da tag e texto da ação) ──
select nome, count(*) as vezes, array_agg(created_at order by created_at) as criadas_em
  from plano_tags
 where empresa_id = (select empresa_id from usuarios where email = 'master@teste.com')
 group by nome order by min(created_at);

select texto, count(*) as vezes,
       array_agg(ordem order by created_at) as ordens,
       array_agg(created_at order by created_at) as criadas_em
  from plano_acoes
 where empresa_id = (select empresa_id from usuarios where email = 'master@teste.com')
 group by texto order by min(ordem);

-- Como ler:
--  * Front antigo (antes do 3A) rodando 2x em paralelo (npm run dev / StrictMode):
--    as 3 tags de CADA cópia têm o MESMO created_at (um insert só), as duas
--    cópias distam milissegundos, ordens 0..10 repetidas, e tudo ANTES do
--    backfill_em (o backfill então pulou o escritório, que já tinha conteúdo).
--  * Função de cópia do banco (049): tags com created_at separados por 1 ms
--    (base + ordem/1000). Se uma das cópias for assim, a outra veio do front.
--  * Backfill: uma cópia com created_at ≈ backfill_em.


-- ── 3. Escritórios reais com tags ou ações repetidas (mesmo nome/texto) ──
select e.nome as escritorio, 'tag' as tipo, t.nome as repetido, count(*) as vezes
  from plano_tags t join empresas e on e.id = t.empresa_id
 group by e.nome, t.empresa_id, lower(trim(t.nome)), t.nome
having count(*) > 1
union all
select e.nome, 'ação', left(a.texto, 80), count(*)
  from plano_acoes a join empresas e on e.id = a.empresa_id
 where trim(a.texto) <> ''
 group by e.nome, a.empresa_id, a.texto
having count(*) > 1
order by 1, 2, 3;
