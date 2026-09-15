import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconBack, IconPlus, IconTrash, IconEdit } from '../components/Icons.jsx'
import EtapasEditor from '../components/EtapasEditor.jsx'
import './ModelosEtapas.css'

async function carregarModeloTree(modeloId) {
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

export default function ModelosEtapas() {
  const { activeEmpresaId, isProluAdmin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [modelos, setModelos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selecionadoId, setSelecionadoId] = useState(null)
  const [etapas, setEtapas] = useState([])
  const [carregandoEtapas, setCarregandoEtapas] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [modalNovo, setModalNovo] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [globalNovo, setGlobalNovo] = useState(false)
  const [criando, setCriando] = useState(false)

  useEffect(() => { carregarModelos() }, [activeEmpresaId])

  async function carregarModelos() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('precificacao_modelos').select('id, nome, empresa_id').order('nome')
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

  function podeEditar(m) {
    return m.empresa_id ? m.empresa_id === activeEmpresaId : isProluAdmin
  }

  const modeloSelecionado = modelos.find((m) => m.id === selecionadoId)
  const editavel = modeloSelecionado ? podeEditar(modeloSelecionado) : false

  const grupos = useMemo(() => ({
    prolu: modelos.filter((m) => !m.empresa_id),
    empresa: modelos.filter((m) => m.empresa_id),
  }), [modelos])

  async function criarModelo() {
    if (!nomeNovo.trim()) return
    setCriando(true)
    const { data, error } = await supabase.from('precificacao_modelos')
      .insert({ empresa_id: globalNovo ? null : activeEmpresaId, nome: nomeNovo.trim() })
      .select('id, nome, empresa_id').single()
    setCriando(false)
    if (error || !data) { toast('Erro ao criar modelo'); return }
    setModelos((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    setModalNovo(false)
    setNomeNovo('')
    setGlobalNovo(false)
    selecionar(data.id)
  }

  async function renomear(modeloId, nome) {
    setModelos((prev) => prev.map((m) => m.id === modeloId ? { ...m, nome } : m))
    await supabase.from('precificacao_modelos').update({ nome }).eq('id', modeloId)
    setEditandoId(null)
  }

  async function excluir(modeloId) {
    await supabase.from('precificacao_modelos').delete().eq('id', modeloId)
    const restantes = modelos.filter((m) => m.id !== modeloId)
    setModelos(restantes)
    if (selecionadoId === modeloId) {
      if (restantes.length) selecionar(restantes[0].id)
      else { setSelecionadoId(null); setEtapas([]) }
    }
  }

  // ── Etapas do modelo selecionado ──
  async function refetchEtapas() { setEtapas(await carregarModeloTree(selecionadoId)) }

  async function handleAddEtapa() {
    await supabase.from('precificacao_modelo_etapas').insert({ modelo_id: selecionadoId, nome: 'Nova etapa', ordem: etapas.length })
    refetchEtapas()
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
    await supabase.from('precificacao_modelo_tarefas').insert({ etapa_id: etapaId, nome: 'Nova tarefa', horas_estimadas_soltas: 0, ordem: (etapa?.tarefas || []).length })
    refetchEtapas()
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
    await supabase.from('precificacao_modelo_subtarefas').insert({ tarefa_id: tarefaId, nome: 'Nova subtarefa', horas_estimadas: 0, ordem: subCount })
    refetchEtapas()
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
      <div className="me-breadcrumb">
        <button onClick={() => navigate('/precificacao')}><IconBack /> Precificação</button>
      </div>

      <div className="page-header between">
        <div>
          <div className="page-title">Modelos de etapas</div>
          <div className="page-sub">Estruturas reutilizáveis de etapas e tarefas pra suas precificações.</div>
        </div>
        <button className="btn-primary" onClick={() => setModalNovo(true)}>
          <IconPlus /> Novo modelo
        </button>
      </div>

      {loading ? (
        <p className="me-empty">Carregando…</p>
      ) : modelos.length === 0 ? (
        <p className="me-empty">Nenhum modelo cadastrado ainda.</p>
      ) : (
        <div className="me-layout">
          <div className="me-sidebar">
            {grupos.prolu.length > 0 && (
              <>
                <div className="me-group-label">Modelos Prolu</div>
                {grupos.prolu.map((m) => (
                  <ModeloItem key={m.id} m={m} ativo={m.id === selecionadoId} editavel={podeEditar(m)}
                    editando={editandoId === m.id}
                    onSelect={() => selecionar(m.id)}
                    onEditar={() => setEditandoId(m.id)}
                    onRenomear={(nome) => renomear(m.id, nome)}
                    onExcluir={() => excluir(m.id)} />
                ))}
              </>
            )}
            {grupos.empresa.length > 0 && (
              <>
                <div className="me-group-label">Modelos da empresa</div>
                {grupos.empresa.map((m) => (
                  <ModeloItem key={m.id} m={m} ativo={m.id === selecionadoId} editavel={podeEditar(m)}
                    editando={editandoId === m.id}
                    onSelect={() => selecionar(m.id)}
                    onEditar={() => setEditandoId(m.id)}
                    onRenomear={(nome) => renomear(m.id, nome)}
                    onExcluir={() => excluir(m.id)} />
                ))}
              </>
            )}
          </div>

          <div className="me-content">
            {carregandoEtapas ? (
              <p className="me-empty">Carregando…</p>
            ) : !editavel ? (
              <>
                <p className="me-readonly-note">Modelo Prolu — somente leitura.</p>
                <EtapasEditor etapas={etapas} readOnly />
              </>
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
              />
            )}
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalNovo(false) }}>
          <div className="modal">
            <div className="modal-title">Novo modelo</div>
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
            {isProluAdmin && (
              <label className="me-global-check">
                <input type="checkbox" checked={globalNovo} onChange={(e) => setGlobalNovo(e.target.checked)} />
                Modelo Prolu (visível para todas as empresas)
              </label>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalNovo(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criarModelo} disabled={criando}>
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ModeloItem({ m, ativo, editavel, editando, onSelect, onEditar, onRenomear, onExcluir }) {
  if (editando) {
    return (
      <input
        className="me-item-input"
        autoFocus
        defaultValue={m.nome}
        onBlur={(e) => onRenomear(e.target.value.trim() || m.nome)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
      />
    )
  }
  return (
    <div className={`me-item${ativo ? ' active' : ''}`}>
      <button className="me-item-select" onClick={onSelect}>{m.nome}</button>
      {editavel && (
        <div className="me-item-actions">
          <button onClick={onEditar} aria-label="Renomear"><IconEdit /></button>
          <button onClick={onExcluir} aria-label="Excluir"><IconTrash /></button>
        </div>
      )}
    </div>
  )
}
