import { useMemo } from 'react'
import { supabase } from '../services/supabaseClient.js'

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

// Total de horas e valor final não são colunas — são sempre calculados na
// hora a partir de etapas/tarefas/subtarefas + custos extras. Usado fora de
// PrecificacaoDetalhe.jsx (listagem, drawer do CRM) pra exibir esses
// valores sem precisar cachear nada no banco. Retorna null quando a
// precificação não tem etapa nenhuma, pro chamador poder mostrar "—".
export async function carregarCalculoPrecificacao(precificacaoId, cabecalho) {
  const [etapasRes, custosRes] = await Promise.all([
    supabase.from('precificacao_etapas').select('id').eq('precificacao_id', precificacaoId),
    supabase.from('precificacao_custos_extras').select('valor_estimado').eq('precificacao_id', precificacaoId),
  ])
  const etapaIds = (etapasRes.data || []).map((e) => e.id)
  if (etapaIds.length === 0) return null

  const { data: tarefas } = await supabase
    .from('precificacao_tarefas').select('id, horas_estimadas_soltas').in('etapa_id', etapaIds)
  const tarefaIds = (tarefas || []).map((t) => t.id)

  let subtarefas = []
  if (tarefaIds.length) {
    const { data } = await supabase
      .from('precificacao_subtarefas').select('tarefa_id, horas_estimadas').in('tarefa_id', tarefaIds)
    subtarefas = data || []
  }

  return calcularPrecificacao({
    etapas: [{
      tarefas: (tarefas || []).map((t) => ({
        horas_estimadas_soltas: t.horas_estimadas_soltas || 0,
        subtarefas: subtarefas.filter((s) => s.tarefa_id === t.id).map((s) => ({ horas_estimadas: s.horas_estimadas || 0 })),
      })),
    }],
    custos_extras: (custosRes.data || []).map((c) => ({ valor_estimado: c.valor_estimado || 0 })),
    valor_hora: cabecalho.valor_hora || 0,
    margem_pct: cabecalho.margem_pct || 0,
    nf_pct: cabecalho.nf_pct || 0,
    nf_ativo: cabecalho.nf_ativo || false,
  })
}
