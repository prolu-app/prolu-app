-- ════════════════════════════════════════════════════════════════
-- Verificação da migration_049 (Plano Prático padrão)
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ. Os testes terminam em ROLLBACK:
-- nada fica gravado.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Modelo semeado e backfill ──
-- Esperado: 3 tags, 11 ações; backfill_em preenchido e backfill_qtd = nº de
-- escritórios que receberam a cópia
select (select count(*) from plano_modelo_tags) as tags,
       (select count(*) from plano_modelo_acoes) as acoes,
       backfill_em, backfill_qtd
  from plano_modelo_meta;


-- ── 2. Escritório NOVO recebe a cópia na criação ──
-- Esperado: 3 tags na ordem do modelo e 11 ações com tag e ordem 0..10
begin;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000049', 'Teste 049');
select nome, cor, created_at from plano_tags
 where empresa_id = '00000000-0000-0000-0000-000000000049' order by created_at;
select a.ordem, a.texto, a.status, t.nome as tag
  from plano_acoes a left join plano_tags t on t.id = a.tag_id
 where a.empresa_id = '00000000-0000-0000-0000-000000000049' order by a.ordem;
rollback;


-- ── 3. Editar o modelo NÃO muda escritórios existentes ──
-- Troca o texto de uma ação do modelo e confere que nenhuma cópia mudou.
-- Esperado: 0 linhas com o texto novo em plano_acoes
begin;
update plano_modelo_acoes set texto = 'TEXTO EDITADO 049' where ordem = 0;
select count(*) as copias_alteradas from plano_acoes where texto = 'TEXTO EDITADO 049';
-- e um escritório criado DEPOIS da edição recebe o texto novo (esperado: 1)
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000149', 'Teste 049 b');
select count(*) as novo_recebeu_edicao from plano_acoes
 where empresa_id = '00000000-0000-0000-0000-000000000149' and texto = 'TEXTO EDITADO 049';
rollback;


-- ── 4. Modelo vazio: escritório nasce sem conteúdo, sem erro ──
-- Esperado: insert funciona e 0 tags / 0 ações
begin;
delete from plano_modelo_acoes;
delete from plano_modelo_tags;
insert into empresas (id, nome) values ('00000000-0000-0000-0000-000000000249', 'Teste 049 c');
select (select count(*) from plano_tags where empresa_id = '00000000-0000-0000-0000-000000000249') as tags,
       (select count(*) from plano_acoes where empresa_id = '00000000-0000-0000-0000-000000000249') as acoes;
rollback;


-- ── 5. Convidado não gera cópia ──
-- Aceitar convite só cria uma linha em usuarios (não em empresas); a cópia é
-- disparada apenas pelo insert em empresas. Esperado: 1 trigger, em empresas.
select tgrelid::regclass as tabela, tgname from pg_trigger where tgname = 'empresas_copia_plano_modelo';
