-- ════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO — Gestão de Projetos (antes das migrations 061+)
-- SOMENTE LEITURA: nenhum bloco grava, altera ou apaga nada.
--
-- Rodar UM BLOCO DE CADA VEZ no SQL Editor (o editor só mostra o resultado
-- do último comando) e colar o resultado de cada bloco na conversa.
--
--   Bloco 1–3 → fase 0a (furo de role/empresa_id em usuarios)
--   Bloco 4–6 → fase 1 (tabelas legadas projetos*/orcamentos*: dados e dependências)
--   Bloco 7   → fase 0b (policies atuais das tabelas com R$)
-- ════════════════════════════════════════════════════════════════


-- ── 1. Policies de usuarios (e convites/empresas, que entram no mesmo fluxo) ──
--      Procurar: policy de UPDATE/INSERT em usuarios sem with_check, ou com
--      with_check que não amarra role/empresa_id.
select tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('usuarios', 'convites', 'empresas')
 order by tablename, cmd, policyname;


-- ── 2. Gatilhos, constraints e privilégios de coluna em usuarios ──
--      Procurar: algum gatilho que já proteja role/empresa_id; grants de
--      UPDATE por coluna (se existirem, o update fica limitado a elas).
select 'gatilho' as tipo, tgname as nome, pg_get_triggerdef(oid) as definicao
  from pg_trigger
 where tgrelid = 'public.usuarios'::regclass and not tgisinternal
union all
select 'constraint', conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.usuarios'::regclass
union all
select 'grant tabela', grantee || ' ' || privilege_type, null
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'usuarios'
   and grantee in ('anon', 'authenticated')
union all
select 'grant coluna', grantee || ' ' || privilege_type || ' (' || column_name || ')', null
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'usuarios'
   and grantee in ('anon', 'authenticated')
   and not exists (  -- só lista se NÃO houver grant da tabela inteira (senão repete todas as colunas)
     select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = 'usuarios'
        and g.grantee = column_privileges.grantee and g.privilege_type = column_privileges.privilege_type)
order by 1, 2;


-- ── 3. Colunas de usuarios e funções do banco que gravam em usuarios ──
--      As funções listadas aqui precisam continuar funcionando depois da 061.
select 'coluna' as tipo, column_name as nome,
       data_type || coalesce(' default ' || column_default, '') as detalhe
  from information_schema.columns
 where table_schema = 'public' and table_name = 'usuarios'
union all
select 'funcao que grava', p.proname,
       case when p.prosecdef then 'security definer' else 'security invoker' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ~* '(update|insert\s+into|delete\s+from)\s+(public\.)?usuarios\M'
order by 1, 2;


-- ── 4. Tabelas legadas: existem? quantas linhas (contagem EXATA) ──
--      query_to_xml roda o count(*) de cada tabela sem precisar de bloco DO.
select t.nome,
       (c.oid is not null) as existe,
       case when c.oid is null then null
            else (xpath('/row/n/text()',
                        query_to_xml(format('select count(*) as n from public.%I', t.nome), false, true, '')))[1]::text::bigint
       end as linhas
  from unnest(array[
         'projetos', 'projeto_etapas', 'projeto_etapa_itens', 'projeto_custos_extras',
         'orcamentos', 'orcamento_etapas', 'orcamento_etapa_itens', 'orcamento_custos_extras',
         'modelos_etapas', 'modelo_etapa_grupos', 'modelo_etapa_itens',
         'etiquetas', 'valorhora_cenarios'
       ]) as t(nome)
  left join pg_class c on c.relname = t.nome and c.relkind = 'r'
                      and c.relnamespace = 'public'::regnamespace
 order by t.nome;


-- ── 5. Dependências das tabelas legadas de projeto/orçamento ──
--      FK de OUTRAS tabelas apontando para elas, views que as usam,
--      gatilhos nelas e policies em outras tabelas que as citam.
with legado(nome) as (
  select unnest(array['projetos', 'projeto_etapas', 'projeto_etapa_itens', 'projeto_custos_extras',
                      'orcamentos', 'orcamento_etapas', 'orcamento_etapa_itens', 'orcamento_custos_extras'])
), rel as (
  select l.nome, c.oid from legado l
  join pg_class c on c.relname = l.nome and c.relnamespace = 'public'::regnamespace
)
select 'fk de fora' as tipo, r.nome as tabela_legada,
       con.conrelid::regclass::text || ' → ' || con.conname as dependente
  from pg_constraint con join rel r on r.oid = con.confrelid
 where con.contype = 'f'
   and con.conrelid not in (select oid from rel)        -- FK entre as próprias legadas não conta
union all
select distinct 'view', r.nome, v.oid::regclass::text
  from pg_depend d
  join pg_rewrite rw on rw.oid = d.objid
  join pg_class v on v.oid = rw.ev_class
  join rel r on r.oid = d.refobjid
 where v.oid <> r.oid
union all
select 'gatilho', r.nome, tg.tgname
  from pg_trigger tg join rel r on r.oid = tg.tgrelid
 where not tg.tgisinternal
union all
select 'policy em outra tabela', l.nome, p.tablename || ' → ' || p.policyname
  from pg_policies p join legado l
    on (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~* ('\m' || l.nome || '\M')
 where p.schemaname = 'public' and p.tablename <> l.nome
order by 1, 2, 3;


-- ── 6. Funções que citam as tabelas legadas no corpo ──
--      Atenção a falso positivo: "projetos" aparece em comentários/textos.
--      Conferir cada função listada antes de remover/renomear.
select p.proname as funcao, l.nome as cita
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  join unnest(array['projetos', 'projeto_etapas', 'projeto_etapa_itens', 'projeto_custos_extras',
                    'orcamentos', 'orcamento_etapas', 'orcamento_etapa_itens', 'orcamento_custos_extras']) as l(nome)
    on p.prosrc ~* ('\m(public\.)?' || l.nome || '\M')
 order by 1, 2;


-- ── 7. Policies atuais das tabelas com R$ (insumo da fase 0b) ──
select tablename, policyname, permissive, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('crm_linhas', 'crm_colunas', 'oportunidade_comentarios', 'crm_fichas',
                     'precificacoes', 'precificacao_etapas', 'precificacao_tarefas',
                     'precificacao_subtarefas', 'precificacao_custos_extras', 'precificacao_etiquetas',
                     'indicadores', 'indicador_metas', 'indicador_resultados', 'clientes')
 order by tablename, cmd, policyname;
