import { useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { IconPlus, IconTrash, IconEdit, IconFile } from '../../components/Icons.jsx'
import EtapasEditor from '../../components/EtapasEditor.jsx'
import ImportarModeloTxtModal from '../../components/ImportarModeloTxtModal.jsx'
import { carregarModeloTree } from '../../utils/modeloPrecificacaoTree.js'
import './AdminModelosPrecificacao.css'

export default function AdminModelosPrecificacao() {
  const toast = useToast()

  const [modelos, setModelos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selecionadoId, setSelecionadoId] = useState(null)
  const [etapas, setEtapas] = useState([])
  const [carregandoEtapas, setCarregandoEtapas] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [modalNovo, setModalNovo] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [criando, setCriando] = useState(false)
  const [modalImportar, setModalImportar] = useState(false)

  useEffect(() => { carregarModelos() }, [])

  async function carregarModelos() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('modelos_precificacao').select('id, nome').eq('is_prolu', true).order('nome')
    if (error) toast('Erro ao carregar modelos')
    const lista = data || []
    setModelos(lista)
    setLoading(false)
    if (lista.length && !selecionadoId) selecionar(lista[0].id)
  }

  async function selecionar(modeloId) {
    setSelecionadoId(modeloId)
    setCarregandoEtapas(true)
    setEtapas(await carregarModeloTree(modeloId))
    setCarregandoEtapas(false)
  }

  async function criarModelo() {
    if (!nomeNovo.trim()) return
    setCriando(true)
    const { data, error } = await supabase.from('modelos_precificacao')
      .insert({ empresa_id: null, is_prolu: true, nome: nomeNovo.trim() })
      .select('id, nome').single()
    setCriando(false)
    if (error || !data) { toast('Erro ao criar modelo'); return }
    setModelos((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    setModalNovo(false)
    setNomeNovo('')
    selecionar(data.id)
  }

  async function renomear(modeloId, nome) {
    setModelos((prev) => prev.map((m) => m.id === modeloId ? { ...m, nome } : m))
    await supabase.from('modelos_precificacao').update({ nome }).eq('id', modeloId)
    setEditandoId(null)
  }

  async function excluir(modeloId) {
    await supabase.from('modelos_precificacao').delete().eq('id', modeloId)
    const restantes = modelos.filter((m) => m.id !== modeloId)
    setModelos(restantes)
    if (selecionadoId === modeloId) {
      if (restantes.length) selecionar(restantes[0].id)
      else { setSelecionadoId(null); setEtapas([]) }
    }
  }

  // Importação via .txt: só reflete nesta tela quando o destino foi
  // "Modelo Prolu" (essa lista só mostra is_prolu = true). Quando o
  // destino foi um escritório específico, o modelo criado/atualizado não
  // aparece aqui — quem gerencia daí em diante é o próprio escritório em
  // /precificacao/modelos.
  function handleModeloImportado({ destino, modelo }) {
    if (destino !== 'prolu') return
    setModelos((prev) => {
      const semEle = prev.filter((m) => m.id !== modelo.id)
      return [...semEle, modelo].sort((a, b) => a.nome.localeCompare(b.nome))
    })
    selecionar(modelo.id)
  }

  // ── Etapas do modelo selecionado ──
  async function refetchEtapas() { setEtapas(await carregarModeloTree(selecionadoId)) }

  async function handleAddEtapa() {
    const { data } = await supabase.from('precificacao_modelo_etapas')
      .insert({ modelo_id: selecionadoId, nome: '', ordem: etapas.length })
      .select('id').single()
    await refetchEtapas()
    return data?.id
  }
  async function handleRenameEtapa(etapaId, nome) {
    await supabase.from('precificacao_modelo_etapas').update({ nome }).eq('id', etapaId)
    refetchEtapas()
  }
  async function handleDeleteEtapa(etapaId) {
    await supabase.from('precificacao_modelo_etapas').delete().eq('id', etapaId)
    refetchEtapas()
  }
  async function handleReorderEtapas(draggedId, targetId, position) {
    const fromIdx = etapas.findIndex((e) => e.id === draggedId)
    if (fromIdx === -1) return
    const list = [...etapas]
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex((e) => e.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((e, i) => ({ ...e, ordem: i }))
    setEtapas(reordered)
    await Promise.all(reordered.map((e) => supabase.from('precificacao_modelo_etapas').update({ ordem: e.ordem }).eq('id', e.id)))
  }

  async function handleAddTarefa(etapaId) {
    const etapa = etapas.find((e) => e.id === etapaId)
    const { data } = await supabase.from('precificacao_modelo_tarefas')
      .insert({ etapa_id: etapaId, nome: '', horas_estimadas_soltas: 0, ordem: (etapa?.tarefas || []).length })
      .select('id').single()
    await refetchEtapas()
    return data?.id
  }
  async function handleRenameTarefa(tarefaId, nome) {
    await supabase.from('precificacao_modelo_tarefas').update({ nome }).eq('id', tarefaId)
    refetchEtapas()
  }
  async function handleSetTarefaHoras(tarefaId, horas) {
    await supabase.from('precificacao_modelo_tarefas').update({ horas_estimadas_soltas: horas }).eq('id', tarefaId)
    refetchEtapas()
  }
  async function handleDeleteTarefa(tarefaId) {
    await supabase.from('precificacao_modelo_tarefas').delete().eq('id', tarefaId)
    refetchEtapas()
  }
  async function handleReorderTarefas(etapaId, draggedId, targetId, position) {
    const etapa = etapas.find((e) => e.id === etapaId)
    if (!etapa) return
    const list = [...etapa.tarefas]
    const fromIdx = list.findIndex((t) => t.id === draggedId)
    if (fromIdx === -1) return
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex((t) => t.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((t, i) => ({ ...t, ordem: i }))
    setEtapas((prev) => prev.map((e) => e.id === etapaId ? { ...e, tarefas: reordered } : e))
    await Promise.all(reordered.map((t) => supabase.from('precificacao_modelo_tarefas').update({ ordem: t.ordem }).eq('id', t.id)))
  }

  async function handleAddSubtarefa(tarefaId) {
    let subCount = 0
    etapas.forEach((e) => e.tarefas.forEach((t) => { if (t.id === tarefaId) subCount = t.subtarefas.length }))
    const { data } = await supabase.from('precificacao_modelo_subtarefas')
      .insert({ tarefa_id: tarefaId, nome: '', horas_estimadas: 0, ordem: subCount })
      .select('id').single()
    await refetchEtapas()
    return data?.id
  }
  async function handleReorderSubtarefas(tarefaId, draggedId, targetId, position) {
    let tarefaAtual = null
    etapas.forEach((e) => e.tarefas.forEach((t) => { if (t.id === tarefaId) tarefaAtual = t }))
    if (!tarefaAtual) return
    const list = [...tarefaAtual.subtarefas]
    const fromIdx = list.findIndex((st) => st.id === draggedId)
    if (fromIdx === -1) return
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex((st) => st.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((st, i) => ({ ...st, ordem: i }))
    setEtapas((prev) => prev.map((e) => ({
      ...e,
      tarefas: e.tarefas.map((t) => t.id === tarefaId ? { ...t, subtarefas: reordered } : t),
    })))
    await Promise.all(reordered.map((st) => supabase.from('precificacao_modelo_subtarefas').update({ ordem: st.ordem }).eq('id', st.id)))
  }
  async function handleRenameSubtarefa(subId, nome) {
    await supabase.from('precificacao_modelo_subtarefas').update({ nome }).eq('id', subId)
    refetchEtapas()
  }
  async function handleSetSubtarefaHoras(subId, horas) {
    await supabase.from('precificacao_modelo_subtarefas').update({ horas_estimadas: horas }).eq('id', subId)
    refetchEtapas()
  }
  async function handleDeleteSubtarefa(subId) {
    await supabase.from('precificacao_modelo_subtarefas').delete().eq('id', subId)
    refetchEtapas()
  }

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Modelos de precificação</div>
          <div className="page-sub">Modelos Prolu — visíveis e sugeridos pra todos os escritórios.</div>
        </div>
        <div className="amp-header-actions">
          <button className="btn-secondary" onClick={() => setModalImportar(true)}>
            <IconFile /> Importar de arquivo (.txt)
          </button>
          <button className="btn-primary" onClick={() => setModalNovo(true)}>
            <IconPlus /> Novo modelo Prolu
          </button>
        </div>
      </div>

      {loading ? (
        <p className="amp-empty">Carregando…</p>
      ) : modelos.length === 0 ? (
        <p className="amp-empty">Nenhum modelo Prolu cadastrado ainda.</p>
      ) : (
        <div className="amp-layout">
          <div className="amp-sidebar">
            {modelos.map((m) => (
              <ModeloItem key={m.id} m={m} ativo={m.id === selecionadoId}
                editando={editandoId === m.id}
                onSelect={() => selecionar(m.id)}
                onEditar={() => setEditandoId(m.id)}
                onRenomear={(nome) => renomear(m.id, nome)}
                onExcluir={() => excluir(m.id)} />
            ))}
          </div>

          <div className="amp-content">
            {carregandoEtapas ? (
              <p className="amp-empty">Carregando…</p>
            ) : (
              <EtapasEditor
                etapas={etapas}
                onAddEtapa={handleAddEtapa}
                onRenameEtapa={handleRenameEtapa}
                onDeleteEtapa={handleDeleteEtapa}
                onReorderEtapas={handleReorderEtapas}
                onAddTarefa={handleAddTarefa}
                onRenameTarefa={handleRenameTarefa}
                onSetTarefaHoras={handleSetTarefaHoras}
                onDeleteTarefa={handleDeleteTarefa}
                onReorderTarefas={handleReorderTarefas}
                onAddSubtarefa={handleAddSubtarefa}
                onRenameSubtarefa={handleRenameSubtarefa}
                onSetSubtarefaHoras={handleSetSubtarefaHoras}
                onDeleteSubtarefa={handleDeleteSubtarefa}
                onReorderSubtarefas={handleReorderSubtarefas}
              />
            )}
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalNovo(false) }}>
          <div className="modal">
            <div className="modal-title">Novo modelo Prolu</div>
            <div className="modal-field">
              <label className="modal-label">Nome do modelo</label>
              <input
                className="modal-input" autoFocus
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && criarModelo()}
                placeholder="Ex.: Projeto residencial padrão"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalNovo(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criarModelo} disabled={criando}>
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportarModeloTxtModal
        open={modalImportar}
        onClose={() => setModalImportar(false)}
        modelosProlu={modelos}
        onImported={handleModeloImportado}
      />
    </>
  )
}

function ModeloItem({ m, ativo, editando, onSelect, onEditar, onRenomear, onExcluir }) {
  if (editando) {
    return (
      <input
        className="amp-item-input"
        autoFocus
        defaultValue={m.nome}
        onBlur={(e) => onRenomear(e.target.value.trim() || m.nome)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
      />
    )
  }
  return (
    <div className={`amp-item${ativo ? ' active' : ''}`}>
      <button className="amp-item-select" onClick={onSelect}>{m.nome}</button>
      <div className="amp-item-actions">
        <button onClick={onEditar} aria-label="Renomear"><IconEdit /></button>
        <button onClick={onExcluir} aria-label="Excluir"><IconTrash /></button>
      </div>
    </div>
  )
}
