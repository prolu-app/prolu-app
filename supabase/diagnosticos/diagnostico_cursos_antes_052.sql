-- ════════════════════════════════════════════════════════════════
-- Diagnóstico antes da migration_052 (correção do módulo de cursos)
-- SÓ LEITURA. Rodar no SQL Editor, um bloco de cada vez.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Cursos da 050 e seus planos ──
select c.id, c.titulo, c.ativo, c.checkout_url,
       (select string_agg(plano, ', ' order by plano_nivel(plano)) from curso_planos where curso_id = c.id) as planos
  from cursos c order by c.ordem;


-- ── 2. Pastas Prolu: curso da 050 e visibilidade por tipo de usuário ──
-- (nivel_acesso: todos | gestor = gestor e master | master = só master)
select p.id, p.titulo, p.ordem, p.nivel_acesso, c.titulo as curso_050,
       (select count(*) from kb_modulos m where m.pasta_id = p.id) as modulos,
       (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id) as aulas
  from kb_pastas p left join cursos c on c.id = p.curso_id
 where p.empresa_id is null
 order by p.ordem, p.titulo;


-- ── 3. Liberações avulsas gravadas (ativas e revogadas) ──
select l.id, e.nome as escritorio, c.titulo as curso, l.origem, l.motivo, l.criado_em, l.revogado_em
  from curso_liberacoes l
  join empresas e on e.id = l.empresa_id
  join cursos c on c.id = l.curso_id
 order by l.criado_em;


-- ── 4. Pastas de escritórios com visibilidade restrita (nivel_acesso <> 'todos') ──
select e.nome as escritorio, p.titulo, p.nivel_acesso
  from kb_pastas p join empresas e on e.id = p.empresa_id
 where coalesce(p.nivel_acesso, 'todos') <> 'todos'
 order by 1, 2;
