# Pendências de segurança

Itens conhecidos, ainda não corrigidos, para entrar no roadmap.

## PDFs da Base de Conhecimento com link público

- **Registrado em:** 2026-09-29
- **Situação:** o bucket de Storage `kb-pdfs` é público. Qualquer pessoa com o link de um PDF consegue abri-lo, inclusive PDFs de conteúdo de outro escritório, sem estar logada.
- **Por que não foi corrigido junto com a migration 022:** a migration 022 corrige quem pode **enviar/alterar/apagar** arquivos (dono pela 1ª pasta do caminho) e quem vê as aulas no app, mas a **leitura** do arquivo segue pública. Decisão de manter assim por enquanto.
- **Mitigação atual:** o link não é listado em lugar nenhum fora do app e contém id da empresa + timestamp, então não é trivial de adivinhar — mas vaza se for compartilhado.
- **Correção proposta:** tornar o bucket privado, trocar a policy de leitura para seguir a visibilidade da aula (mesma regra de `kb_aulas`) e fazer o player/links de download usarem URL assinada temporária (`createSignedUrl`) em vez de `getPublicUrl`/`pdf_url` direto. Afeta `BaseConhecimento.jsx` (player, lista de anexos, upload) e os PDFs já existentes (que guardam a URL pública em `kb_aulas.pdf_url` / `kb_aula_pdfs.arquivo_url`).
