-- ════════════════════════════════════════════════════════════════
-- Valor-hora v3: inspeção e limpeza dos cenários do escritório de teste
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ.
-- Escritório de teste: master andresouzavr@gmail.com.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Inspeção (só leitura): TODOS os cenários de valor-hora ──
-- Se aparecer cenário de outro escritório ou de outro usuário, PARE: a v3
-- não converte formatos antigos e esses cenários ficariam inutilizáveis.
select c.id,
       e.nome               as escritorio,
       au.email             as criado_por,
       c.nome               as cenario,
       c.dados->>'versao'   as versao,      -- null = primeira versão (v1)
       c.created_at
  from valor_hora_cenarios c
  left join empresas e    on e.id = c.empresa_id
  left join usuarios u    on u.id = c.created_by
  left join auth.users au on au.id = u.auth_id
 order by e.nome, c.created_at;

-- resumo por escritório (esperado: só o escritório de teste)
select e.nome as escritorio, count(*) as cenarios
  from valor_hora_cenarios c join empresas e on e.id = c.empresa_id
 group by e.nome order by e.nome;


-- ── 2. Limpeza: só os cenários criados pelo usuário de teste no escritório de teste ──
-- Termina em ROLLBACK: confira as linhas devolvidas e troque por COMMIT para gravar.
begin;
delete from valor_hora_cenarios c
 where c.created_by = (select id from usuarios where email = 'andresouzavr@gmail.com')
   and c.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
returning c.id, c.nome, c.dados->>'versao' as versao, c.created_at;
-- o que sobrou na tabela (esperado: 0, se só havia cenários de teste)
select count(*) as restantes from valor_hora_cenarios;
rollback;
