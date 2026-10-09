# Pendências de segurança

Itens conhecidos, ainda não corrigidos, para entrar no roadmap.

## PDFs da Base de Conhecimento com link público

- **Registrado em:** 2026-09-29
- **Situação:** o bucket de Storage `kb-pdfs` é público. Qualquer pessoa com o link de um PDF consegue abri-lo, inclusive PDFs de conteúdo de outro escritório, sem estar logada.
- **Por que não foi corrigido junto com a migration 022:** a migration 022 corrige quem pode **enviar/alterar/apagar** arquivos (dono pela 1ª pasta do caminho) e quem vê as aulas no app, mas a **leitura** do arquivo segue pública. Decisão de manter assim por enquanto.
- **Mitigação atual:** o link não é listado em lugar nenhum fora do app e contém id da empresa + timestamp, então não é trivial de adivinhar — mas vaza se for compartilhado.
- **Correção proposta:** tornar o bucket privado, trocar a policy de leitura para seguir a visibilidade da aula (mesma regra de `kb_aulas`) e fazer o player/links de download usarem URL assinada temporária (`createSignedUrl`) em vez de `getPublicUrl`/`pdf_url` direto. Afeta `BaseConhecimento.jsx` (player, lista de anexos, upload) e os PDFs já existentes (que guardam a URL pública em `kb_aulas.pdf_url` / `kb_aula_pdfs.arquivo_url`).

## Usuário logado consegue se inserir em qualquer escritório

- **Registrado em:** 2026-10-09
- **Prioridade:** alta — corrigir logo depois do Passo 2 (planos), em uma rodada só de segurança.
- **Situação:** a policy `"usuario cria o próprio registro"` em `usuarios` (migration_001/007) só exige `auth_id = auth.uid()`. Qualquer pessoa com conta no Supabase Auth pode inserir o próprio registro com **qualquer** `empresa_id` (e qualquer `role`, inclusive `master`) direto pela API, e passa a ver os dados daquele escritório.
- **Correção proposta:** o insert em `usuarios` só pode (a) criar o master de uma empresa recém-criada pela própria pessoa e ainda sem usuários, ou (b) entrar numa empresa com convite pendente para o e-mail da pessoa, com o `role` do convite. Melhor ainda: mover os dois caminhos para uma função `SECURITY DEFINER` (`completar_cadastro`) e remover a policy de insert direto. Afeta `AuthContext.completeOnboarding` e `AceitarConvite.jsx`.

## Edge Function invite-user não confere quem está chamando

- **Registrado em:** 2026-10-09
- **Prioridade:** alta — mesma rodada de segurança.
- **Situação:** `invite-user` é publicada com `--no-verify-jwt` e confia no `convidado_por` enviado no corpo. Quem souber o id de um usuário master/gestor e o `empresa_id` pode disparar convites em nome dele (convidando alguém, inclusive como master, para aquele escritório). A checagem de plano (migration_045) não muda isso.
- **Correção proposta:** ler o JWT do header `Authorization`, obter o usuário com `supabase.auth.getUser(token)` e buscar o criador por `auth_id` — ignorar `convidado_por` do corpo (ou exigir que coincida). O front já envia o JWT automaticamente pelo `supabase.functions.invoke`.
