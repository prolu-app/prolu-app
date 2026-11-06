# Pendências de segurança

Itens conhecidos, ainda não corrigidos, para entrar no roadmap.

## PDFs da Base de Conhecimento com link público

- **Resolvido em:** migration_050 (Passo 3B, cursos): bucket privado, leitura por URL assinada e só de arquivo usado por aula que a pessoa vê (curso liberado). PDFs antigos continuam funcionando: a URL guardada vira só identificador do arquivo.

- **Registrado em:** 2026-09-29
- **Situação:** o bucket de Storage `kb-pdfs` é público. Qualquer pessoa com o link de um PDF consegue abri-lo, inclusive PDFs de conteúdo de outro escritório, sem estar logada.
- **Por que não foi corrigido junto com a migration 022:** a migration 022 corrige quem pode **enviar/alterar/apagar** arquivos (dono pela 1ª pasta do caminho) e quem vê as aulas no app, mas a **leitura** do arquivo segue pública. Decisão de manter assim por enquanto.
- **Mitigação atual:** o link não é listado em lugar nenhum fora do app e contém id da empresa + timestamp, então não é trivial de adivinhar — mas vaza se for compartilhado.
- **Correção proposta:** tornar o bucket privado, trocar a policy de leitura para seguir a visibilidade da aula (mesma regra de `kb_aulas`) e fazer o player/links de download usarem URL assinada temporária (`createSignedUrl`) em vez de `getPublicUrl`/`pdf_url` direto. Afeta `BaseConhecimento.jsx` (player, lista de anexos, upload) e os PDFs já existentes (que guardam a URL pública em `kb_aulas.pdf_url` / `kb_aula_pdfs.arquivo_url`).

## Usuário logado consegue se inserir em qualquer escritório

- **Resolvido em:** migration_061 (Fase 0a): gatilho `usuarios_protege` no banco. O INSERT pela API só aceita (a) o master de uma empresa criada pela própria pessoa (`empresas.criado_por`) e ainda sem usuários, ou (b) um convite pendente com mesma empresa e papel para o e-mail confirmado. Nunca aceita prolu_admin. Também fecha o UPDATE: o comum não muda mais o próprio role nem o empresa_id, e o master não grava prolu_admin. A ideia da RPC `completar_cadastro` segue como melhoria (ver abaixo).

- **Registrado em:** 2026-10-09
- **Prioridade:** alta — corrigir logo depois do Passo 2 (planos), em uma rodada só de segurança.
- **Situação:** a policy `"usuario cria o próprio registro"` em `usuarios` (migration_001/007) só exige `auth_id = auth.uid()`. Qualquer pessoa com conta no Supabase Auth pode inserir o próprio registro com **qualquer** `empresa_id` (e qualquer `role`, inclusive `master`) direto pela API, e passa a ver os dados daquele escritório.
- **Correção proposta:** o insert em `usuarios` só pode (a) criar o master de uma empresa recém-criada pela própria pessoa e ainda sem usuários, ou (b) entrar numa empresa com convite pendente para o e-mail da pessoa, com o `role` do convite. Melhor ainda: mover os dois caminhos para uma função `SECURITY DEFINER` (`completar_cadastro`) e remover a policy de insert direto. Afeta `AuthContext.completeOnboarding` e `AceitarConvite.jsx`.

## Edge Function invite-user não confere quem está chamando

- **Resolvido em:** invite-user (Fase 0a, publicada antes da migration_061): quem convida sai do JWT (`auth.getUser`) e é buscado por `auth_id`; o `convidado_por` do corpo é ignorado. Só master/prolu_admin convidam master, o gestor convida gestor ou comum e o comum não convida.

- **Registrado em:** 2026-10-09
- **Prioridade:** alta — mesma rodada de segurança.
- **Situação:** `invite-user` é publicada com `--no-verify-jwt` e confia no `convidado_por` enviado no corpo. Quem souber o id de um usuário master/gestor e o `empresa_id` pode disparar convites em nome dele (convidando alguém, inclusive como master, para aquele escritório). A checagem de plano (migration_045) não muda isso.
- **Correção proposta:** ler o JWT do header `Authorization`, obter o usuário com `supabase.auth.getUser(token)` e buscar o criador por `auth_id` — ignorar `convidado_por` do corpo (ou exigir que coincida). O front já envia o JWT automaticamente pelo `supabase.functions.invoke`.

## Cadastro ainda grava direto em `usuarios` pelo navegador

- **Registrado em:** 2026-10-27 (Fase 0a)
- **Prioridade:** média. O gatilho da 061 já impede o abuso; isto é para simplificar.
- **Situação:** `AuthContext.completeOnboarding` insere em `empresas` e em `usuarios` a partir do navegador, e o gatilho `usuarios_protege` valida. Funciona, mas a regra fica espalhada entre o front e o gatilho.
- **Correção proposta:** RPC `SECURITY DEFINER` `completar_cadastro(nome, empresa_nome)` que cria a empresa e o master, ou aplica o convite pendente, numa transação só. Depois disso, remover a policy "usuario cria o próprio registro". Afeta `AuthContext.jsx`, `Onboarding.jsx` e `AceitarConvite.jsx`.

## Entrar por convite depende do "Confirm email" do Auth

- **Registrado em:** 2026-10-27 (Fase 0a)
- **Situação:** o caminho (b) da 061 exige `auth.users.email_confirmed_at`. Com "Confirm email" desligado no painel do Supabase Auth, o cadastro já nasce confirmado, e alguém poderia criar conta com o e-mail de uma pessoa convidada e entrar no lugar dela.
- **Correção proposta:** manter "Confirm email" **ligado** (Authentication → Providers → Email). Conferir sempre que mexer na configuração do Auth.

## RPC SECURITY DEFINER que gravar em `usuarios` passa pelo gatilho

- **Registrado em:** 2026-10-27 (Fase 0a)
- **Situação:** o gatilho `usuarios_protege` libera tudo o que não chega como `anon` ou `authenticated`. Dentro de uma função DEFINER, o `current_user` é o dono da função, então o gatilho deixa passar.
- **Regra:** toda RPC DEFINER futura que grave em `usuarios` tem que validar quem chama (`auth.uid()`, papel e escritório) por conta própria. Hoje nenhuma RPC grava em `usuarios`.

## Pequenos pontos de `usuarios` / Equipe

- **Registrado em:** 2026-10-27 (Fase 0a)
- A pessoa ainda edita o próprio `usuarios.email` pela API. Esse campo é usado para avisar os masters (formulario-limite-aviso). O risco é baixo (só redireciona os avisos da própria pessoa). Correção: ignorar a coluna e ler o e-mail de `auth.users`.
- `Configuracoes.jsx` `removerUsuario` não confere o resultado (mesmo padrão que o `alterarRole` tinha). Hoje a tela não oferece remoções que o banco recusa (a si mesmo, prolu_admin). Corrigir junto com a próxima mudança na aba Equipe.
- Dois masters rebaixando um ao outro ao mesmo tempo: a 061 trava as linhas, e no pior caso o Postgres aborta uma das transações por deadlock. Resultado seguro; só registrado.
- `empresas_protege_plano` (045) usa `auth.uid() is null` para reconhecer a service role. Está seguro porque a RLS barra o anon antes, mas o ideal é alinhar com o critério de `current_user` da 061.

## Fase 0b: varredura de policies (próxima migration livre: 062)

- **Resolvido em:** migration_062 (Fase 0b), exceto a criação de empresas sem limite. CRM (`crm_colunas`, `crm_linhas`, `crm_fichas`, `oportunidade_comentarios`), precificações e filhas, `precificacao_etiquetas_cadastro`, modelos de precificação e indicadores agora são lidos só pelo master do escritório ou pelo prolu_admin (qualquer escritório), e gravados só no próprio escritório por master ou prolu_admin. Gestor e comum não recebem nenhuma linha. Os modelos da Prolu (`is_prolu`) são lidos por master e prolu_admin, e só o prolu_admin os grava ou marca. `fn_fechamentos` e `fn_fechamentos_periodo` devolvem vazio para gestor e comum. `clientes` ficou de fora de propósito (não tem coluna em R$ e a Gestão de Projetos precisa dela para todos os papéis).
- **Registrado em:** 2026-10-27, na varredura da Fase 0a
- **prolu_admin escreve na precificação de qualquer escritório:** `precificacoes`, `precificacao_etapas`, `precificacao_tarefas`, `precificacao_subtarefas`, `precificacao_custos_extras` e `precificacao_etiquetas` têm uma policy ALL com `... OR auth_is_prolu_admin()`. Isso contraria a regra de que o prolu_admin só lê escritórios dos outros. Correção: separar SELECT (com prolu_admin) de INSERT/UPDATE/DELETE (só o próprio escritório).
- **Seção Comercial gravável por qualquer papel pela API:** `clientes`, `crm_colunas`, `crm_linhas`, `oportunidade_comentarios`, `indicadores`, `indicador_metas`, `indicador_resultados` e `precificacao*` aceitam escrita de gestor e comum do escritório (só `empresa_id = auth_empresa_id()`). Na tela, a seção é só do master. O `USING` impede mover linhas para outro escritório, então o problema é só de papel. Antes de restringir, conferir o que gestor e comum usam de fato (ex.: Contatos é gestor ou superior).
- **Criação de empresas sem limite:** a policy "usuario autenticado cria empresa" deixa qualquer login criar quantas empresas quiser (sempre starter/ativa, sem acesso, porque o usuário só pode ter um cadastro). O risco é lixo no banco. Correção: entra junto com a RPC `completar_cadastro`.
- **Sem problema encontrado:** `empresas` (o master não altera plano, status ou exclusão, que estão travados pelo gatilho da 045; não há colunas de trial ou de limite), `convites` (o `USING` vale como check e a constraint de role exclui prolu_admin).

## Gestão de Projetos não lê o CRM

- **Registrado em:** 2026-11-06 (Fase 0b, decisão)
- **Regra:** gestor e comum não têm nenhum acesso a `crm_linhas` e às demais tabelas financeiras (migration_062), sem exceção. Tudo o que a Gestão de Projetos mostrar vindo do CRM (cliente, cidade, tipo de projeto etc.) é **copiado para o próprio projeto** quando ele é criado ou vinculado. A tela de projeto nunca consulta `crm_linhas`. Valores em R$ do projeto ficam numa tabela separada, só do master.

## "Entrar como escritório": botões de editar dados financeiros

- **Registrado em:** 2026-11-06 (Fase 0b, backlog de front)
- **Situação:** desde a migration_062, o prolu_admin só lê dados financeiros de outros escritórios. Quando ele entra como outro escritório, as telas de CRM, Precificação, Modelos e Indicadores ainda mostram os botões de criar, editar e excluir, e essas ações falham no servidor.
- **Correção proposta:** com `impersonatedEmpresaId` ativo, esconder ou desabilitar as ações de escrita nessas telas, com um aviso de "somente leitura".

## Gestor apaga cliente e desvincula precificação

- **Registrado em:** 2026-11-06 (Fase 0b)
- **Situação:** `precificacoes.cliente_id` tem `ON DELETE SET NULL`. Quando um gestor apaga um cliente em Contatos, as precificações daquele cliente ficam sem vínculo. Nenhum valor vaza, mas o master perde a ligação.
- **Correção proposta:** avisar na exclusão quando o cliente tiver precificação ou negócio no CRM, ou restringir a exclusão de cliente com vínculo ao master.
