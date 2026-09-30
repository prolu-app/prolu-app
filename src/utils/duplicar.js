import { supabase } from '../services/supabaseClient.js'

/* Duplicação de precificações e de modelos de etapas.

   Tudo roda com o usuário logado (supabase-js + RLS) — nada aqui contorna
   as policies: se a RLS não deixa gravar no destino, a cópia falha.

   Copia com select('*') e só remove id/created_at/updated_at: colunas que
   existam no banco real e não estejam documentadas nas migrations (já
   aconteceu — ver migration_015) vão junto sem precisar listá-las aqui.

   Não é transacional (são vários inserts pela API). Se algum nível falhar,
   o registro raiz recém-criado é apagado — o on delete cascade das tabelas
   filhas limpa o que já tinha sido copiado. */

const NAO_COPIAR = ['id', 'created_at', 'updated_at']

function semIds(row, sobrescrever = {}) {
  const r = { ...row }
  NAO_COPIAR.forEach((k) => { delete r[k] })
  return { ...r, ...sobrescrever }
}

// Copia um nível da árvore (ex: todas as tarefas das etapas copiadas).
// `mapa` = { idPaiAntigo: idPaiNovo }. Devolve o mesmo formato para os
// registros deste nível, usado como pai do nível seguinte.
async function copiarNivel(tabela, fk, mapa, { ordenar = true } = {}) {
  const idsAntigos = Object.keys(mapa)
  if (!idsAntigos.length) return {}

  let q = supabase.from(tabela).select('*').in(fk, idsAntigos)
  if (ordenar) q = q.order('ordem')
  const { data: origem, error } = await q
  if (error) throw error
  if (!origem?.length) return {}

  const payload = origem.map((r) => semIds(r, { [fk]: mapa[r[fk]] }))
  const { data: novos, error: errIns } = await supabase.from(tabela).insert(payload).select('*')
  if (errIns) throw errIns

  // O Postgres devolve as linhas inseridas na mesma ordem do payload; confere
  // mesmo assim antes de usar os ids novos como pais — uma correspondência
  // errada penduraria subtarefas na tarefa errada em silêncio.
  const novoMapa = {}
  origem.forEach((r, i) => {
    const n = novos?.[i]
    if (!n || n[fk] !== payload[i][fk] || n.nome !== r.nome) {
      throw new Error(`Cópia de ${tabela} fora de ordem`)
    }
    novoMapa[r.id] = n.id
  })
  return novoMapa
}

async function desfazer(tabela, id) {
  await supabase.from(tabela).delete().eq('id', id)
}

// Precificação inteira: etapas → tarefas → subtarefas, custos extras e
// etiquetas. A cópia mantém cliente e registro do CRM de origem e volta a
// ser um orçamento (status/valor de fechamento não são herdados).
export async function duplicarPrecificacao(precificacaoId, { usuarioId } = {}) {
  const { data: orig, error } = await supabase
    .from('precificacoes').select('*').eq('id', precificacaoId).single()
  if (error || !orig) throw error || new Error('Precificação não encontrada')

  const extra = { nome: `${orig.nome} (cópia)` }
  if ('status' in orig) extra.status = 'orcamento'
  if ('valor_fechamento' in orig) extra.valor_fechamento = null
  if ('created_by' in orig && usuarioId) extra.created_by = usuarioId

  const { data: nova, error: errIns } = await supabase
    .from('precificacoes').insert(semIds(orig, extra)).select('id').single()
  if (errIns || !nova) throw errIns || new Error('Não foi possível criar a cópia')

  try {
    const raiz = { [orig.id]: nova.id }
    const etapas = await copiarNivel('precificacao_etapas', 'precificacao_id', raiz)
    const tarefas = await copiarNivel('precificacao_tarefas', 'etapa_id', etapas)
    await copiarNivel('precificacao_subtarefas', 'tarefa_id', tarefas)
    await copiarNivel('precificacao_custos_extras', 'precificacao_id', raiz)
    await copiarNivel('precificacao_etiquetas', 'precificacao_id', raiz, { ordenar: false })
  } catch (e) {
    await desfazer('precificacoes', nova.id)
    throw e
  }
  return nova.id
}

// Modelo inteiro: etapas → tarefas → subtarefas.
// destino.prolu = true → outro Modelo Padrão Prolu (is_prolu, sem empresa) —
//   só a visão global do prolu_admin usa isso.
// senão → modelo do escritório destino.empresaId, sempre editável por ele,
//   mesmo quando o original é um Modelo Padrão Prolu.
export async function duplicarModelo(modeloId, destino) {
  const { data: orig, error } = await supabase
    .from('modelos_precificacao').select('*').eq('id', modeloId).single()
  if (error || !orig) throw error || new Error('Modelo não encontrado')

  const dono = destino.prolu
    ? { is_prolu: true, empresa_id: null }
    : { is_prolu: false, empresa_id: destino.empresaId }
  if (!destino.prolu && !destino.empresaId) throw new Error('Escritório de destino não definido')

  const { data: novo, error: errIns } = await supabase
    .from('modelos_precificacao')
    .insert(semIds(orig, { ...dono, nome: `${orig.nome} (cópia)` }))
    .select('id, nome, empresa_id, is_prolu').single()
  if (errIns || !novo) throw errIns || new Error('Não foi possível criar a cópia')

  try {
    const etapas = await copiarNivel('modelo_etapas', 'modelo_id', { [orig.id]: novo.id })
    const tarefas = await copiarNivel('modelo_tarefas', 'etapa_id', etapas)
    await copiarNivel('modelo_subtarefas', 'tarefa_id', tarefas)
  } catch (e) {
    await desfazer('modelos_precificacao', novo.id)
    throw e
  }
  return novo
}
