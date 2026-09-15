import { useMemo } from 'react'

// Cálculo puro (sem estado) — usado pelo hook abaixo e por quem precisar
// rodar a conta fora de um componente React (ex.: script de migração).
export function calcularPrecificacao({ etapas, custos_extras, valor_hora, margem_pct, nf_pct, nf_ativo }) {
  // Total de horas
  const totalHoras = etapas.reduce((sum, etapa) => {
    return sum + etapa.tarefas.reduce((s, tarefa) => {
      const horasSubtarefas = tarefa.subtarefas.reduce((ss, sub) => ss + (sub.horas_estimadas || 0), 0)
      return s + (tarefa.horas_estimadas_soltas || 0) + horasSubtarefas
    }, 0)
  }, 0)

  // Valor sem margem
  const totalCustos = custos_extras.reduce((s, c) => s + (c.valor_estimado || 0), 0)
  const valorSemMargem = (totalHoras * valor_hora) + totalCustos

  // Margem reversa
  const margem = Math.min(Math.max(margem_pct, 0), 99.99) / 100
  const valorComMargem = margem < 1 ? valorSemMargem / (1 - margem) : valorSemMargem

  // NF reversa
  const nf = nf_ativo ? Math.min(Math.max(nf_pct, 0), 99.99) / 100 : 0
  const valorFinal = nf > 0 ? valorComMargem / (1 - nf) : valorComMargem

  return {
    totalHoras,
    valorSemMargem,
    valorMargem: valorComMargem - valorSemMargem,
    valorComMargem,
    valorNF: valorFinal - valorComMargem,
    valorFinal,
  }
}

// Versão memoizada pra usar direto em componentes — só recalcula quando um
// dos insumos muda de verdade, em vez de a cada render.
export function usePrecificacaoCalculo({ etapas, custos_extras, valor_hora, margem_pct, nf_pct, nf_ativo }) {
  return useMemo(
    () => calcularPrecificacao({ etapas, custos_extras, valor_hora, margem_pct, nf_pct, nf_ativo }),
    [etapas, custos_extras, valor_hora, margem_pct, nf_pct, nf_ativo]
  )
}
