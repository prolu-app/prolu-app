-- ════════════════════════════════════════════════════════════════
-- migration_055: preparar, restaurar e limpar o ESCRITÓRIO DE TESTE
-- (master andresouzavr@gmail.com). Nenhum bloco toca em escritório de cliente:
-- todo filtro passa pela empresa desse usuário (ou por um curso que você
-- mesmo mudou no Admin → Cursos, bloco 5).
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ, com os claims vazios (aba nova
-- do SQL Editor): só assim o gatilho empresas_protege_plano deixa mudar o plano.
-- ════════════════════════════════════════════════════════════════


-- ── 0. Estado atual (só leitura) ──
select e.id, e.nome, e.plano, e.status_conta,
       empresa_libera(e.id, 'base_propria') as base_propria, empresa_libera(e.id, 'kb_painel') as painel
  from empresas e where e.id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com');
select p.id, p.titulo, p.created_at,
       (select count(*) from kb_modulos m where m.pasta_id = p.id) as modulos
  from kb_pastas p
 where p.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
 order by p.created_at;
-- cursos da Prolu com venda avulsa (e o preço, se já houver)
select id, titulo, venda_avulsa, preco_avulso, checkout_url from kb_pastas
 where empresa_id is null and venda_avulsa order by ordem;


-- ── 1. Trocar o plano do escritório de teste (fica gravado) ──
-- Rode com 'starter', teste; depois 'pro', teste; depois 'business', teste.
-- Troque ROLLBACK por COMMIT para gravar.
begin;
update empresas set plano = 'starter'   -- 'starter' | 'pro' | 'business'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
returning id, nome, plano, status_conta;
rollback;


-- ── 2. Restaurar: escritório de teste de volta para mentoria/ativa ──
begin;
update empresas set plano = 'mentoria', status_conta = 'ativa'
 where id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
returning id, nome, plano, status_conta;
rollback;   -- troque por COMMIT depois de conferir


-- ── 3. Limpeza: primeiro só olhar ──
-- Pastas próprias criadas durante os testes (ajuste :inicio, horário de SP).
-- Confira a lista: pasta que já existia antes dos testes NÃO pode entrar.
select p.id, p.titulo, p.created_at,
       (select count(*) from kb_modulos m where m.pasta_id = p.id) as modulos,
       (select count(*) from kb_aulas a join kb_modulos m on m.id = a.modulo_id where m.pasta_id = p.id) as aulas
  from kb_pastas p
 where p.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
   and p.created_at >= '2026-10-12 00:00:00-03'   -- :inicio
 order by p.created_at;
-- PDFs enviados pelo escritório de teste durante os testes
select name, created_at from storage.objects
 where bucket_id = 'kb-pdfs'
   and name like (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')::text || '/%'
   and created_at >= '2026-10-12 00:00:00-03'      -- :inicio
 order by created_at;


-- ── 4. Limpeza: apagar (ROLLBACK; troque por COMMIT depois de conferir) ──
-- módulos, aulas, anexos e progresso saem junto (on delete cascade).
-- Os arquivos do storage não se apagam por SQL: remova pelo painel do
-- Supabase (Storage → kb-pdfs → pasta do escritório), conferindo a lista do bloco 3.
begin;
delete from kb_pastas p
 where p.empresa_id = (select empresa_id from usuarios where email = 'andresouzavr@gmail.com')
   and p.created_at >= '2026-10-12 00:00:00-03'   -- :inicio (o mesmo do bloco 3)
returning p.id, p.titulo;
rollback;


-- ── 5. Preço de teste num curso da Prolu ──
-- Se você pôs um preço só para testar, o jeito certo de tirar é pelo Admin →
-- Cursos → Acesso (apague o preço e salve). Este bloco só confere:
select id, titulo, venda_avulsa, preco_avulso from kb_pastas
 where empresa_id is null and preco_avulso is not null order by ordem;
