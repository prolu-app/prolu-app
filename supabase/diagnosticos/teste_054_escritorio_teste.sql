-- ════════════════════════════════════════════════════════════════
-- Passo 4a (migration_054): preparar, restaurar e limpar o ESCRITÓRIO DE TESTE
-- (master andresouzavr@gmail.com). Nenhum bloco toca em escritório de cliente:
-- todo filtro passa pela empresa desse usuário.
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ, com os claims vazios (aba nova
-- do SQL Editor): só assim o gatilho empresas_protege_plano deixa mudar o plano.
-- ════════════════════════════════════════════════════════════════


-- ── 0. Estado atual (só leitura) ──
select e.id, e.nome, e.slug, e.plano, e.status_conta,
       e.pagina_config->>'publicada' as pagina_publicada, e.pagina_config->>'rodape_prolu' as rodape_prolu
  from empresas e where e.id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select mes, total, aviso_limite_em from formulario_envios_mes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com') order by mes;


-- ── 1. Preparar o teste: escritório de teste como Starter (fica gravado) ──
-- Troque ROLLBACK por COMMIT para gravar.
begin;
update empresas set plano = 'starter'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
returning id, nome, plano, status_conta;
rollback;
-- atalho para testar o 4 de 5 / 5 de 5 sem preencher tudo (opcional):
-- insert into formulario_envios_mes (empresa_id, mes, total)
-- values ((select empresa_id from usuarios where email = 'andresouzavr@gmail.com'), mes_sao_paulo(), 4)
-- on conflict (empresa_id, mes) do update set total = 4, aviso_limite_em = null;


-- ── 2. Restaurar: escritório de teste de volta para mentoria/ativa ──
begin;
update empresas set plano = 'mentoria', status_conta = 'ativa'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
returning id, nome, plano, status_conta;
rollback;   -- troque por COMMIT depois de conferir


-- ── 3. Limpeza dos dados de teste: primeiro só olhar ──
-- Ajuste a data/hora de início dos testes em :inicio (horário de São Paulo).
-- contador do escritório de teste
select mes, total, aviso_limite_em from formulario_envios_mes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
-- pedidos que vieram de formulário durante os testes (com a ficha, se houver)
select l.id, l.created_at, f.nome as formulario, l.valores
  from crm_linhas l left join formularios f on f.id = l.formulario_id
 where l.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
   and l.formulario_id is not null
   and l.created_at >= '2026-10-11 00:00:00-03'   -- :inicio
 order by l.created_at;


-- ── 4. Limpeza: apagar (ROLLBACK; troque por COMMIT depois de conferir) ──
begin;
delete from formulario_envios_mes
 where empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
returning mes, total;
-- crm_fichas saem junto (on delete cascade)
delete from crm_linhas l
 where l.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
   and l.formulario_id is not null
   and l.created_at >= '2026-10-11 00:00:00-03'   -- :inicio (o mesmo do bloco 3)
returning l.id, l.created_at;
-- contatos criados pelos envios de teste ficam: confira e apague à mão em
-- Contatos, se quiser (o nome vem do campo Cliente do formulário).
rollback;
