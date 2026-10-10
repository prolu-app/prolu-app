-- ════════════════════════════════════════════════════════════════
-- Limpeza do Plano Prático duplicado — SÓ do escritório de teste
-- NÃO RODE sem conferir o e-mail. Rodar DEPOIS da migration_051.
-- Apaga TODAS as tags e ações do escritório de teste e recria uma cópia do
-- modelo atual pela função corrigida. Prazo/status alterados no teste se perdem.
-- ════════════════════════════════════════════════════════════════

begin;

-- confira que é o escritório certo (deve aparecer só o de teste)
select e.id, e.nome, e.plano,
       (select count(*) from plano_tags where empresa_id = e.id) as tags,
       (select count(*) from plano_acoes where empresa_id = e.id) as acoes
  from empresas e
 where e.id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');

delete from plano_acoes where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
delete from plano_tags  where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
update empresas set plano_pratico_inicializado_em = null
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');

-- recria pela função (esperado: retorna 11 com o modelo padrão)
select copiar_plano_modelo((select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) as acoes_copiadas;

-- esperado: 3 tags e 11 ações, sem repetição
select (select count(*) from plano_tags where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) as tags,
       (select count(*) from plano_acoes where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')) as acoes;

-- tudo certo? troque ROLLBACK por COMMIT e rode de novo
rollback;
