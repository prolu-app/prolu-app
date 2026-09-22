// Parser do formato de importação de modelo de precificação via .txt
// (usado em ImportarModeloTxtModal, /admin/modelos-precificacao).
//
// Uma linha por item, prefixo indica o nível hierárquico:
//   #   → Etapa
//   -   → Tarefa   (pertence à última Etapa lida acima)
//   --  → Subtarefa (pertence à última Tarefa lida acima)
//
// Linhas vazias são ignoradas. Uma tarefa fora de uma etapa, ou uma
// subtarefa fora de uma tarefa, para o parse imediatamente com o número
// da linha e o motivo — não tenta adivinhar o encaixe. Uma nova etapa
// também fecha a tarefa "atual": uma subtarefa logo após uma nova etapa
// (sem tarefa própria antes dela) é tratada como erro, não como filha de
// uma tarefa de uma etapa anterior.
//
// Retorna { etapas: [{ nome, tarefas: [{ nome, subtarefas: [{ nome }] }] }] }
// em caso de sucesso, ou { error: { linha, motivo } } em caso de erro.
export function parseModeloTxt(texto) {
  const linhas = String(texto || '').split(/\r\n|\r|\n/)
  const etapas = []
  let etapaAtual = null
  let tarefaAtual = null

  for (let i = 0; i < linhas.length; i++) {
    const bruta = linhas[i]
    if (!bruta.trim()) continue
    const linha = i + 1

    if (bruta.startsWith('--')) {
      const nome = bruta.slice(2).trim()
      if (!tarefaAtual) return { error: { linha, motivo: 'subtarefa (--) encontrada antes de qualquer tarefa (-)' } }
      if (!nome) return { error: { linha, motivo: 'subtarefa sem nome' } }
      tarefaAtual.subtarefas.push({ nome })
    } else if (bruta.startsWith('-')) {
      const nome = bruta.slice(1).trim()
      if (!etapaAtual) return { error: { linha, motivo: 'tarefa (-) encontrada antes de qualquer etapa (#)' } }
      if (!nome) return { error: { linha, motivo: 'tarefa sem nome' } }
      tarefaAtual = { nome, subtarefas: [] }
      etapaAtual.tarefas.push(tarefaAtual)
    } else if (bruta.startsWith('#')) {
      const nome = bruta.slice(1).trim()
      if (!nome) return { error: { linha, motivo: 'etapa sem nome' } }
      etapaAtual = { nome, tarefas: [] }
      tarefaAtual = null
      etapas.push(etapaAtual)
    } else {
      return { error: { linha, motivo: 'linha sem prefixo válido — use #, - ou --' } }
    }
  }

  if (!etapas.length) return { error: { linha: 0, motivo: 'nenhuma etapa (#) encontrada no arquivo' } }
  return { etapas }
}
