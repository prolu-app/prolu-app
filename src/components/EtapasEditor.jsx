import { useEffect, useState } from 'react'
import { IconPlus, IconChevronDown, IconGrip, IconTrash } from './Icons.jsx'
import './EtapasEditor.css'

const MOBILE_BREAKPOINT = 860

// Editor de árvore etapa → tarefa → subtarefa, com horas somadas e
// reordenação por drag and drop (HTML5 nativo, só desktop). Controlado
// pelo pai: toda mutação passa por uma callback (o pai grava no Supabase e
// devolve a árvore atualizada via prop `etapas`). onAddEtapa/onAddTarefa/
// onAddSubtarefa devem retornar o id do item recém-criado (ou uma Promise
// que resolve pra ele), pra abrir o nome já em edição com foco automático.
// Usado na aba "Etapas" de PrecificacaoDetalhe, em ModelosEtapas e em
// AdminModelosPrecificacao.
export default function EtapasEditor({
  etapas,
  onAddEtapa, onRenameEtapa, onDeleteEtapa, onReorderEtapas,
  onAddTarefa, onRenameTarefa, onSetTarefaHoras, onDeleteTarefa, onReorderTarefas,
  onAddSubtarefa, onRenameSubtarefa, onSetSubtarefaHoras, onDeleteSubtarefa, onReorderSubtarefas,
  onImportModelo, readOnly = false,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [editando, setEditando] = useState(null) // `${tipo}:${id}`
  const [confirmDeleteEtapa, setConfirmDeleteEtapa] = useState(null) // { id, nome }
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT)
  const [dragEtapa, setDragEtapa] = useState(null)
  const [dragOverEtapa, setDragOverEtapa] = useState(null)
  const [dragOverEtapaPos, setDragOverEtapaPos] = useState(null)
  const [dragTarefa, setDragTarefa] = useState(null)
  const [dragOverTarefa, setDragOverTarefa] = useState(null)
  const [dragOverTarefaPos, setDragOverTarefaPos] = useState(null)
  const [dragSubtarefa, setDragSubtarefa] = useState(null)
  const [dragOverSubtarefa, setDragOverSubtarefa] = useState(null)
  const [dragOverSubtarefaPos, setDragOverSubtarefaPos] = useState(null)

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function toggleCollapse(id) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function subtotalTarefa(t) {
    return (t.horas || 0) + (t.subtarefas || []).reduce((s, st) => s + (st.horas || 0), 0)
  }
  function subtotalEtapa(e) {
    return (e.tarefas || []).reduce((s, t) => s + subtotalTarefa(t), 0)
  }

  function resetEtapaDrag() { setDragEtapa(null); setDragOverEtapa(null); setDragOverEtapaPos(null) }
  function resetTarefaDrag() { setDragTarefa(null); setDragOverTarefa(null); setDragOverTarefaPos(null) }
  function resetSubtarefaDrag() { setDragSubtarefa(null); setDragOverSubtarefa(null); setDragOverSubtarefaPos(null) }

  async function criarEtapa() {
    const novoId = await onAddEtapa()
    if (novoId) setEditando(`etapa:${novoId}`)
  }
  async function criarTarefa(etapaId) {
    const novoId = await onAddTarefa(etapaId)
    if (novoId) setEditando(`tarefa:${novoId}`)
  }
  async function criarSubtarefa(tarefaId) {
    const novoId = await onAddSubtarefa(tarefaId)
    if (novoId) setEditando(`subtarefa:${novoId}`)
  }

  return (
    <div className="ee-wrap">
      {!readOnly && onImportModelo && (
        <div className="ee-toolbar">
          <button className="ee-btn-secondary" onClick={onImportModelo}>Importar modelo</button>
        </div>
      )}

      {etapas.length === 0 && <p className="ee-empty">Nenhuma etapa cadastrada ainda.</p>}

      <div className="ee-etapas">
        {etapas.map((e) => {
          const isCollapsed = collapsed.has(e.id)
          return (
            <div
              key={e.id}
              className={`ee-etapa etapa-row${dragEtapa === e.id ? ' dragging' : ''}${dragOverEtapa === e.id ? ` drag-over-${dragOverEtapaPos}` : ''}`}
              draggable={!readOnly && !isMobile}
              onDragStart={() => setDragEtapa(e.id)}
              onDragOver={(ev) => {
                if (readOnly || isMobile) return
                ev.preventDefault()
                if (e.id === dragEtapa) return
                const rect = ev.currentTarget.getBoundingClientRect()
                setDragOverEtapa(e.id)
                setDragOverEtapaPos(ev.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
              }}
              onDrop={(ev) => { ev.preventDefault(); if (dragEtapa && dragEtapa !== e.id) onReorderEtapas(dragEtapa, e.id, dragOverEtapaPos || 'before'); resetEtapaDrag() }}
              onDragEnd={resetEtapaDrag}
            >
              <div className="ee-etapa-head">
                {!isMobile && <span className="ee-grip"><IconGrip /></span>}
                <button className="ee-collapse-btn" onClick={() => toggleCollapse(e.id)}>
                  <IconChevronDown className={isCollapsed ? 'ee-chevron-collapsed' : ''} />
                </button>
                <span className="ee-etapa-label">ETAPA</span>
                {editando === `etapa:${e.id}` ? (
                  <input
                    className="ee-name-input"
                    autoFocus
                    defaultValue={e.nome}
                    onBlur={(ev) => { onRenameEtapa(e.id, ev.target.value.trim() || e.nome); setEditando(null) }}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') setEditando(null) }}
                  />
                ) : (
                  <span
                    className={`ee-etapa-nome${readOnly ? '' : ' ee-etapa-nome-editable'}`}
                    onClick={() => !readOnly && setEditando(`etapa:${e.id}`)}
                    title={readOnly ? undefined : 'Clique para editar'}
                  >
                    {e.nome}
                  </span>
                )}
                <span className="ee-soma">Σ {subtotalEtapa(e)}h</span>
                {!readOnly && (
                  <button
                    className="ee-del-btn btn-delete"
                    onClick={() => setConfirmDeleteEtapa({ id: e.id, nome: e.nome })}
                    aria-label="Excluir etapa"
                    title="Excluir etapa"
                  >
                    <IconTrash />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="ee-tarefas">
                  {(e.tarefas || []).map((t) => (
                    <div
                      key={t.id}
                      className={`ee-tarefa tarefa-row${dragTarefa === t.id ? ' dragging' : ''}${dragOverTarefa === t.id ? ` drag-over-${dragOverTarefaPos}` : ''}`}
                      draggable={!readOnly && !isMobile}
                      onDragStart={() => setDragTarefa(t.id)}
                      onDragOver={(ev) => {
                        if (readOnly || isMobile) return
                        ev.preventDefault()
                        if (t.id === dragTarefa) return
                        const rect = ev.currentTarget.getBoundingClientRect()
                        setDragOverTarefa(t.id)
                        setDragOverTarefaPos(ev.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
                      }}
                      onDrop={(ev) => { ev.preventDefault(); if (dragTarefa && dragTarefa !== t.id) onReorderTarefas(e.id, dragTarefa, t.id, dragOverTarefaPos || 'before'); resetTarefaDrag() }}
                      onDragEnd={resetTarefaDrag}
                    >
                      <div className="ee-tarefa-head">
                        {!isMobile && <span className="ee-grip"><IconGrip /></span>}
                        <span className="ee-tarefa-label">TAREFA</span>
                        {editando === `tarefa:${t.id}` ? (
                          <input
                            className="ee-name-input"
                            autoFocus
                            defaultValue={t.nome}
                            onBlur={(ev) => { onRenameTarefa(t.id, ev.target.value.trim() || t.nome); setEditando(null) }}
                            onKeyDown={(ev) => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') setEditando(null) }}
                          />
                        ) : (
                          <span
                            className={`ee-tarefa-nome${readOnly ? '' : ' ee-etapa-nome-editable'}`}
                            onClick={() => !readOnly && setEditando(`tarefa:${t.id}`)}
                            title={readOnly ? undefined : 'Clique para editar'}
                          >
                            {t.nome}
                          </span>
                        )}
                        {!readOnly && <button className="ee-add-sub-btn" onClick={() => criarSubtarefa(t.id)}>+ subtarefa</button>}
                        <span className="ee-tarefa-horas">
                          <input
                            type="number" min="0" step="0.5"
                            className="ee-horas-input"
                            defaultValue={t.horas || 0}
                            disabled={readOnly}
                            onBlur={(ev) => onSetTarefaHoras(t.id, Number(ev.target.value) || 0)}
                          />h
                          {(t.subtarefas || []).length > 0 && (
                            <span className="ee-tarefa-sub-total"> + {(t.subtarefas || []).reduce((s, st) => s + (st.horas || 0), 0)}h sub = {subtotalTarefa(t)}h</span>
                          )}
                        </span>
                        {!readOnly && (
                          <button
                            className="ee-del-btn btn-delete"
                            onClick={() => onDeleteTarefa(t.id)}
                            aria-label="Excluir tarefa"
                            title="Excluir tarefa"
                          >
                            <IconTrash />
                          </button>
                        )}
                      </div>

                      {(t.subtarefas || []).length > 0 && (
                        <div className="ee-subtarefas">
                          {t.subtarefas.map((st) => (
                            <div
                              className={`ee-subtarefa subtarefa-row${dragSubtarefa === st.id ? ' dragging' : ''}${dragOverSubtarefa === st.id ? ` drag-over-${dragOverSubtarefaPos}` : ''}`}
                              key={st.id}
                              draggable={!readOnly && !isMobile}
                              onDragStart={() => setDragSubtarefa(st.id)}
                              onDragOver={(ev) => {
                                if (readOnly || isMobile) return
                                ev.preventDefault()
                                if (st.id === dragSubtarefa) return
                                const rect = ev.currentTarget.getBoundingClientRect()
                                setDragOverSubtarefa(st.id)
                                setDragOverSubtarefaPos(ev.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
                              }}
                              onDrop={(ev) => {
                                ev.preventDefault()
                                if (dragSubtarefa && dragSubtarefa !== st.id) onReorderSubtarefas(t.id, dragSubtarefa, st.id, dragOverSubtarefaPos || 'before')
                                resetSubtarefaDrag()
                              }}
                              onDragEnd={resetSubtarefaDrag}
                            >
                              {!isMobile && <span className="ee-grip ee-grip-sub"><IconGrip /></span>}
                              <span className="ee-sub-branch">└──</span>
                              <span className="ee-subtarefa-label">SUBTAREFA</span>
                              {editando === `subtarefa:${st.id}` ? (
                                <input
                                  className="ee-name-input"
                                  autoFocus
                                  defaultValue={st.nome}
                                  onBlur={(ev) => { onRenameSubtarefa(st.id, ev.target.value.trim() || st.nome); setEditando(null) }}
                                  onKeyDown={(ev) => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') setEditando(null) }}
                                />
                              ) : (
                                <span
                                  className={`ee-subtarefa-nome${readOnly ? '' : ' ee-etapa-nome-editable'}`}
                                  onClick={() => !readOnly && setEditando(`subtarefa:${st.id}`)}
                                  title={readOnly ? undefined : 'Clique para editar'}
                                >
                                  {st.nome}
                                </span>
                              )}
                              <input
                                type="number" min="0" step="0.5"
                                className="ee-horas-input"
                                defaultValue={st.horas || 0}
                                disabled={readOnly}
                                onBlur={(ev) => onSetSubtarefaHoras(st.id, Number(ev.target.value) || 0)}
                              />
                              <span className="ee-h-suffix">h</span>
                              {!readOnly && (
                                <button
                                  className="ee-del-btn btn-delete"
                                  onClick={() => onDeleteSubtarefa(st.id)}
                                  aria-label="Excluir subtarefa"
                                  title="Excluir subtarefa"
                                >
                                  <IconTrash />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <button className="ee-add-tarefa-btn" onClick={() => criarTarefa(e.id)}><IconPlus /> Nova tarefa</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <button className="btn-add-etapa" onClick={criarEtapa}>
          + Adicionar etapa
        </button>
      )}

      {confirmDeleteEtapa && (
        <div className="modal-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) setConfirmDeleteEtapa(null) }}>
          <div className="modal">
            <div className="modal-title">Excluir etapa</div>
            <p className="modal-delete-warn">
              Excluir etapa "{confirmDeleteEtapa.nome}"? Todas as tarefas e subtarefas serão removidas.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmDeleteEtapa(null)}>Cancelar</button>
              <button
                className="btn-danger"
                onClick={() => { onDeleteEtapa(confirmDeleteEtapa.id); setConfirmDeleteEtapa(null) }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
