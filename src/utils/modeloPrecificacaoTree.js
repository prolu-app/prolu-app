import { supabase } from '../services/supabaseClient.js'

// Monta a árvore etapa → tarefa → subtarefa de um modelo de precificação
// (tabelas precificacao_modelo_*). Usado em AdminModelosPrecificacao,
// ModelosEtapas, PrecificacaoDetalhe (importar/salvar modelo) e no fluxo
// de importação via arquivo .txt (ImportarModeloTxtModal).
export async function carregarModeloTree(modeloId) {
  const { data: etapasRows } = await supabase
    .from('precificacao_modelo_etapas').select('id, nome, ordem')
    .eq('modelo_id', modeloId).order('ordem')
  const etapaIds = (etapasRows || []).map((e) => e.id)

  let tarefasRows = []
  if (etapaIds.length) {
    const { data } = await supabase
      .from('precificacao_modelo_tarefas').select('id, etapa_id, nome, horas:horas_estimadas_soltas, ordem')
      .in('etapa_id', etapaIds).order('ordem')
    tarefasRows = data || []
  }
  const tarefaIds = tarefasRows.map((t) => t.id)

  let subRows = []
  if (tarefaIds.length) {
    const { data } = await supabase
      .from('precificacao_modelo_subtarefas').select('id, tarefa_id, nome, horas:horas_estimadas, ordem')
      .in('tarefa_id', tarefaIds).order('ordem')
    subRows = data || []
  }

  return (etapasRows || []).map((e) => ({
    ...e,
    tarefas: tarefasRows.filter((t) => t.etapa_id === e.id).map((t) => ({
      ...t,
      subtarefas: subRows.filter((st) => st.tarefa_id === t.id),
    })),
  }))
}
