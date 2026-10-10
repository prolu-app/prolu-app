-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_051 — testes em transação (ROLLBACK no fim)
-- Rodar no SQL Editor, um bloco de cada vez.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Escritório novo: exatamente uma cópia; repetir a função e o backfill não duplica ──
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000051', 'Teste 051');
select copiar_plano_modelo('00000000-0000-0000-0000-000000000051') as segunda_chamada;  -- esperado: 0
select copiar_plano_modelo('00000000-0000-0000-0000-000000000051') as terceira_chamada;  -- esperado: 0
select (select count(*) from plano_tags where empresa_id = '00000000-0000-0000-0000-000000000051') as tags,     -- 3
       (select count(*) from plano_acoes where empresa_id = '00000000-0000-0000-0000-000000000051') as acoes,    -- 11
       (select plano_pratico_inicializado_em is not null from empresas where id = '00000000-0000-0000-0000-000000000051') as marcado;
rollback;


-- ── 2. Escritório que apagou tudo não é preenchido de novo ──
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000151', 'Teste 051 b');
delete from plano_acoes where empresa_id = '00000000-0000-0000-0000-000000000151';
delete from plano_tags where empresa_id = '00000000-0000-0000-0000-000000000151';
select copiar_plano_modelo('00000000-0000-0000-0000-000000000151') as recopiou;  -- esperado: 0
rollback;


-- ── 3. Editar o modelo vale para o próximo escritório, não para o anterior ──
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000251', 'Antes da edição');
update plano_modelo_acoes set texto = 'EDITADO 051' where ordem = 0;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000351', 'Depois da edição');
select e.nome, exists (select 1 from plano_acoes a where a.empresa_id = e.id and a.texto = 'EDITADO 051') as tem_edicao
  from empresas e
 where e.id in ('00000000-0000-0000-0000-000000000251', '00000000-0000-0000-0000-000000000351');
-- esperado: "Antes da edição" = false, "Depois da edição" = true
rollback;


-- ── 4. Índice único de tag ──
select indexname from pg_indexes where indexname = 'plano_tags_nome_unico';
