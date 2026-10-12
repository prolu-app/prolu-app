-- ════════════════════════════════════════════════════════════════
-- Plano Prático PADRÃO — substituir o modelo (o que o prolu_admin edita em
-- /admin) pelo conteúdo novo de 2026-10-12: 4 tags e 18 ações.
--
-- Mexe SÓ em plano_modelo_tags / plano_modelo_acoes (e na data de "salvo" em
-- plano_modelo_meta). NÃO toca em plano_tags / plano_acoes (o Plano Prático de
-- cada escritório) nem em empresas.plano_pratico_inicializado_em, e não chama
-- copiar_plano_modelo(): nenhum escritório existente recebe nada. O modelo novo
-- só vale para escritório criado DEPOIS do COMMIT (cópia única, migration_051).
--
-- Rodar no SQL Editor, UM BLOCO DE CADA VEZ, na ordem:
--   1 (leitura) → 2 (backup) → 3 (substituição, ROLLBACK) → conferir →
--   3 com COMMIT → 4 (verificação) → 5 (escritórios intactos).
--   Bloco 6 só se precisar desfazer.
-- Sem mudança de schema nas tabelas do app (só as tabelas de backup): não
-- precisa de notify pgrst.
-- ════════════════════════════════════════════════════════════════


-- ── 1. Estado atual (só leitura) ──
-- modelo de hoje: tags e ações, na ordem em que o admin e a cópia usam
select t.ordem, t.nome, t.cor,
       (select count(*) from plano_modelo_acoes a where a.tag_id = t.id) as acoes
  from plano_modelo_tags t order by t.ordem, t.created_at, t.id;
select a.ordem, t.nome as tag, a.status, a.texto
  from plano_modelo_acoes a left join plano_modelo_tags t on t.id = a.tag_id
 order by a.ordem, a.created_at, a.id;
select salvo_em, salvo_por, backfill_em, backfill_qtd from plano_modelo_meta;
-- escritórios ainda não inicializados (a cópia do modelo ainda pode acontecer
-- para eles, mas SÓ pela criação do escritório ou por chamada manual da função;
-- este script não chama)
select count(*) filter (where plano_pratico_inicializado_em is null) as nao_inicializados,
       count(*) as escritorios
  from empresas;


-- ── 2. Backup do modelo + retrato dos escritórios (rodar UMA vez, antes do 3) ──
-- "if not exists": rodar de novo NÃO sobrescreve o backup (fica o original).
-- RLS ligada sem policy: as tabelas de backup não ficam expostas pela API.
create table if not exists _bkp_plano_modelo_tags_20261012 as
  select * from plano_modelo_tags;
create table if not exists _bkp_plano_modelo_acoes_20261012 as
  select * from plano_modelo_acoes;
create table if not exists _bkp_plano_modelo_meta_20261012 as
  select * from plano_modelo_meta;
-- retrato do Plano Prático de cada escritório (contagem + assinatura do
-- conteúdo), para o bloco 5 provar que nada mudou
create table if not exists _bkp_plano_pratico_escritorios_20261012 as
  select e.id as empresa_id,
         (select count(*) from plano_tags t where t.empresa_id = e.id) as tags,
         (select count(*) from plano_acoes a where a.empresa_id = e.id) as acoes,
         md5(coalesce((select string_agg(t.id::text || '|' || coalesce(t.nome, '') || '|' || coalesce(t.cor, ''), ',' order by t.id)
                         from plano_tags t where t.empresa_id = e.id), '')
             || '#' ||
             coalesce((select string_agg(a.id::text || '|' || coalesce(a.tag_id::text, '') || '|' || coalesce(a.texto, '') || '|' || coalesce(a.status, '') || '|' || coalesce(a.ordem::text, ''), ',' order by a.id)
                         from plano_acoes a where a.empresa_id = e.id), '')) as assinatura,
         e.plano_pratico_inicializado_em
    from empresas e;
alter table _bkp_plano_modelo_tags_20261012 enable row level security;
alter table _bkp_plano_modelo_acoes_20261012 enable row level security;
alter table _bkp_plano_modelo_meta_20261012 enable row level security;
alter table _bkp_plano_pratico_escritorios_20261012 enable row level security;
-- confira: as contagens do backup = as do bloco 1
select (select count(*) from _bkp_plano_modelo_tags_20261012) as tags_backup,
       (select count(*) from _bkp_plano_modelo_acoes_20261012) as acoes_backup,
       (select count(*) from _bkp_plano_pratico_escritorios_20261012) as escritorios_retratados;


-- ── 3. Substituição (ROLLBACK; troque por COMMIT depois de conferir) ──
-- Idempotente: apaga o modelo inteiro e grava sempre o mesmo conteúdo.
-- Cor: a da tag de mesmo nome no modelo atual (sem diferenciar maiúsculas),
-- se existir; senão a cor padrão da linha abaixo.
begin;

create temp table _cores_modelo on commit drop as
  select distinct on (lower(trim(nome))) lower(trim(nome)) as chave, cor
    from plano_modelo_tags order by lower(trim(nome)), ordem, created_at;

delete from plano_modelo_acoes;
delete from plano_modelo_tags;

with novas_tags as (
  insert into plano_modelo_tags (nome, cor, ordem)
  select v.nome, coalesce(c.cor, v.cor_padrao), v.ordem
    from (values
      ('Configurações',       '#5f5f58', 0),
      ('Estratégia',          '#8050a0', 1),
      ('Estrutura Comercial', '#3a6ea5', 2),
      ('Resultados e metas',  '#4CAF82', 3)
    ) as v(nome, cor_padrao, ordem)
    left join _cores_modelo c on c.chave = lower(trim(v.nome))
  returning id, nome
)
insert into plano_modelo_acoes (tag_id, texto, status, ordem)
select t.id, a.texto, 'pend', a.ordem
  from (values
    ('Configurações',        0, 'Completar os dados do escritório e conferir o endereço (URL) que aparece nos links públicos (Configurações → Escritório)'),
    ('Configurações',        1, 'Cadastrar o WhatsApp que recebe o aviso de novos pedidos de orçamento (Configurações → Escritório)'),
    ('Configurações',        2, 'Convidar a equipe e definir o perfil de cada pessoa (Configurações → Equipe)'),
    ('Estratégia',           3, 'Preencher o perfil do cliente ideal (Aula ICP no curso de Vendas e Posicionamento)'),
    ('Estrutura Comercial',  4, 'Publicar a Minha Página com foto, apresentação e botões de contato (Minha Página)'),
    ('Estrutura Comercial',  5, 'Criar o formulário de orçamento a partir do modelo e ajustar as perguntas (Formulários)'),
    ('Estrutura Comercial',  6, 'Ativar o aviso de novos pedidos por e-mail e WhatsApp no formulário (Formulários → Notificações)'),
    ('Estrutura Comercial',  7, 'Colocar o link da Minha Página na bio do Instagram'),
    ('Estrutura Comercial',  8, 'Produzir conteúdo para atração de ICP'),
    ('Estrutura Comercial',  9, 'Montar o roteiro de reunião com o método PVI (Aula no curso de Vendas e Posicionamento)'),
    ('Estrutura Comercial', 10, 'Montar o modelo de proposta de alto valor (Modelo: https://www.canva.com/design/DAGP6tb24ck/JR6xIBdNIzQIiI-Wg88gag/edit)'),
    ('Estrutura Comercial', 11, 'Marcar "recebeu proposta" no CRM sempre que enviar uma proposta.'),
    ('Estrutura Comercial', 12, 'Calcular o valor-hora do escritório (Precificação → Valor da hora)'),
    ('Estrutura Comercial', 13, 'Revisar o modelo de etapas e ajustar ao jeito do escritório (Precificação → Modelos)'),
    ('Estrutura Comercial', 14, 'Precificar o próximo orçamento no app e vincular ao CRM (Precificação)'),
    ('Resultados e metas',  15, 'Definir as metas do ano (Indicadores)'),
    ('Resultados e metas',  16, 'Conferir o Painel Comercial no fim do mês: pedidos, fechamentos, ticket médio e conversão (Painel Comercial)'),
    ('Resultados e metas',  17, 'Escolher o principal número do mês para levar ao encontro mensal')
  ) as a(tag, ordem, texto)
  join novas_tags t on t.nome = a.tag;

-- "salvo em" do admin: agora, sem autor (SQL Editor)
update plano_modelo_meta set salvo_em = now(), salvo_por = null where id = 1;

-- conferir antes do COMMIT: 4 tags e 18 ações, todas com tag
select (select count(*) from plano_modelo_tags) as tags,                       -- 4
       (select count(*) from plano_modelo_acoes) as acoes,                     -- 18
       (select count(*) from plano_modelo_acoes where tag_id is null) as sem_tag;  -- 0
select t.ordem, t.nome, t.cor, count(a.id) as acoes
  from plano_modelo_tags t left join plano_modelo_acoes a on a.tag_id = t.id
 group by t.id order by t.ordem;                                               -- 3, 1, 11, 3

rollback;   -- troque por COMMIT depois de conferir


-- ── 4. Verificação depois do COMMIT (só leitura) ──
select t.ordem, t.nome, t.cor, count(a.id) as acoes
  from plano_modelo_tags t left join plano_modelo_acoes a on a.tag_id = t.id
 group by t.id order by t.ordem;
select a.ordem, t.nome as tag, a.status, a.texto
  from plano_modelo_acoes a join plano_modelo_tags t on t.id = a.tag_id
 order by a.ordem;
-- o que a tela do admin recebe (mesma ordem da cópia): rode logado como
-- prolu_admin pelo app (/admin) — aqui só o equivalente direto
select jsonb_array_length(jsonb_agg(nome order by ordem)) as tags, jsonb_agg(nome order by ordem) as nomes
  from plano_modelo_tags;


-- ── 5. Nenhum escritório afetado (só leitura) ──
-- compara cada escritório com o retrato do bloco 2. Esperado: 0 linhas.
select coalesce(b.empresa_id, e.id) as empresa_id, e.nome,
       b.tags as tags_antes, (select count(*) from plano_tags t where t.empresa_id = e.id) as tags_agora,
       b.acoes as acoes_antes, (select count(*) from plano_acoes a where a.empresa_id = e.id) as acoes_agora
  from _bkp_plano_pratico_escritorios_20261012 b
  full join empresas e on e.id = b.empresa_id
 where b.empresa_id is null          -- escritório novo criado depois do retrato (recebe o modelo novo: é o esperado)
    or e.id is null                  -- escritório apagado depois do retrato
    or b.assinatura is distinct from md5(
         coalesce((select string_agg(t.id::text || '|' || coalesce(t.nome, '') || '|' || coalesce(t.cor, ''), ',' order by t.id)
                     from plano_tags t where t.empresa_id = e.id), '')
         || '#' ||
         coalesce((select string_agg(a.id::text || '|' || coalesce(a.tag_id::text, '') || '|' || coalesce(a.texto, '') || '|' || coalesce(a.status, '') || '|' || coalesce(a.ordem::text, ''), ',' order by a.id)
                     from plano_acoes a where a.empresa_id = e.id), ''))
    or b.plano_pratico_inicializado_em is distinct from e.plano_pratico_inicializado_em;
-- totais, para conferir de olho (antes = agora)
select (select sum(tags) from _bkp_plano_pratico_escritorios_20261012) as tags_antes,
       (select count(*) from plano_tags) as tags_agora,
       (select sum(acoes) from _bkp_plano_pratico_escritorios_20261012) as acoes_antes,
       (select count(*) from plano_acoes) as acoes_agora;
-- Obs.: um escritório que editou o próprio Plano Prático entre o bloco 2 e
-- este bloco também aparece acima (mudança dele, não do script). Para tirar a
-- dúvida, rode o bloco 5 logo depois do COMMIT do bloco 3.


-- ── 6. Desfazer: volta o modelo do backup (ROLLBACK; troque por COMMIT) ──
begin;
delete from plano_modelo_acoes;
delete from plano_modelo_tags;
insert into plano_modelo_tags (id, nome, cor, ordem, created_at)
  select id, nome, cor, ordem, created_at from _bkp_plano_modelo_tags_20261012;
insert into plano_modelo_acoes (id, tag_id, texto, status, ordem, created_at)
  select id, tag_id, texto, status, ordem, created_at from _bkp_plano_modelo_acoes_20261012;
update plano_modelo_meta m
   set salvo_em = b.salvo_em, salvo_por = b.salvo_por
  from _bkp_plano_modelo_meta_20261012 b where m.id = 1 and b.id = 1;
select (select count(*) from plano_modelo_tags) as tags, (select count(*) from plano_modelo_acoes) as acoes;  -- = backup
rollback;   -- troque por COMMIT para desfazer de verdade

-- Depois de tudo conferido (dias depois), as tabelas de backup podem sair:
-- drop table _bkp_plano_modelo_tags_20261012, _bkp_plano_modelo_acoes_20261012,
--            _bkp_plano_modelo_meta_20261012, _bkp_plano_pratico_escritorios_20261012;
