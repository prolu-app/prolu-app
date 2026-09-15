import { useState } from 'react'
import { IconPlus, IconChevronDown, IconGrip } from './Icons.jsx'
import './EtapasEditor.css'

// Editor de árvore etapa → tarefa → subtarefa, com horas somadas e
// reordenação por drag and drop (HTML5 nativo). Controlado pelo pai: toda
// mutação passa por uma callback (o pai grava no Supabase e devolve a
// árvore atualizada via prop `etapas`). Usado tanto na aba "Etapas" de
// PrecificacaoDetalhe quanto na edição de modelos em ModelosEtapas.
export default function EtapasEditor({
  etapas,
  onAddEtapa, onRenameEtapa, onDeleteEtapa, onReorderEtapas,
  onAddTarefa, onRenameTarefa, onSetTarefaHoras, onDeleteTarefa, onReorderTarefas,
  onAddSubtarefa, onRenameSubtarefa, onSetSubtarefaHoras, onDeleteSubtarefa,
  onImportModelo, readOnly = false,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [menuAberto, setMenuAberto] = useState(null) // `${tipo}:${id}`
  const [editando, setEditando] = useState(null) // `${tipo}:${id}`
  const [dragEtapa, setDragEtapa] = useState(null)
  const [dragOverEtapa, setDragOverEtapa] = useState(null)
  const [dragOverEtapaPos, setDragOverEtapaPos] = useState(null)
  const [dragTarefa, setDragTarefa] = useState(null)
  const [dragOverTarefa, setDragOverTarefa] = useState(null)
  const [dragOverTarefaPos, setDragOverTarefaPos] = useState(null)

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

  return (
    <div className="ee-wrap">
      {!readOnly && (
        <div className="ee-toolbar">
          {onImportModelo && (
            <button className="ee-btn-secondary" onClick={onImportModelo}>Importar modelo</button>
          )}
          <button className="ee-btn-secondary" onClick={onAddEtapa}><IconPlus /> Nova etapa</button>
        </div>
      )}

      {etapas.length === 0 && <p className="ee-empty">Nenhuma etapa cadastrada ainda.</p>}

      <div className="ee-etapas">
        {etapas.map((e) => {
          const isCollapsed = collapsed.has(e.id)
          return (
            <div
              key={e.id}
              className={`ee-etapa${dragEtapa === e.id ? ' dragging' : ''}${dragOverEtapa === e.id ? ` drag-over-${dragOverEtapaPos}` : ''}`}
              draggable={!readOnly}
              onDragStart={() => setDragEtapa(e.id)}
              onDragOver={(ev) => {
                if (readOnly) return
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
                <span className="ee-grip"><IconGrip /></span>
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
                  <RowMenu
                    open={menuAberto === `etapa:${e.id}`}
                    onToggle={() => setMenuAberto(menuAberto === `etapa:${e.id}` ? null : `etapa:${e.id}`)}
                    onClose={() => setMenuAberto(null)}
                    onDelete={() => { onDeleteEtapa(e.id); setMenuAberto(null) }}
                  />
                )}
              </div>

              {!isCollapsed && (
                <div className="ee-tarefas">
                  {(e.tarefas || []).map((t) => (
                    <div
                      key={t.id}
                      className={`ee-tarefa${dragTarefa === t.id ? ' dragging' : ''}${dragOverTarefa === t.id ? ` drag-over-${dragOverTarefaPos}` : ''}`}
                      draggable={!readOnly}
                      onDragStart={() => setDragTarefa(t.id)}
                      onDragOver={(ev) => {
                        if (readOnly) return
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
                        <span className="ee-grip"><IconGrip /></span>
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
                          <span className="ee-tarefa-nome">{t.nome}</span>
                        )}
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
                        {!readOnly && <button className="ee-add-sub-btn" onClick={() => onAddSubtarefa(t.id)}>+ subtarefa</button>}
                        {!readOnly && (
                          <RowMenu
                            open={menuAberto === `tarefa:${t.id}`}
                            onToggle={() => setMenuAberto(menuAberto === `tarefa:${t.id}` ? null : `tarefa:${t.id}`)}
                            onClose={() => setMenuAberto(null)}
                            onEdit={() => { setEditando(`tarefa:${t.id}`); setMenuAberto(null) }}
                            onDelete={() => { onDeleteTarefa(t.id); setMenuAberto(null) }}
                          />
                        )}
                      </div>

                      {(t.subtarefas || []).length > 0 && (
                        <div className="ee-subtarefas">
                          {t.subtarefas.map((st) => (
                            <div className="ee-subtarefa" key={st.id}>
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
                                <span className="ee-subtarefa-nome">{st.nome}</span>
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
                                <RowMenu
                                  open={menuAberto === `subtarefa:${st.id}`}
                                  onToggle={() => setMenuAberto(menuAberto === `subtarefa:${st.id}` ? null : `subtarefa:${st.id}`)}
                                  onClose={() => setMenuAberto(null)}
                                  onEdit={() => { setEditando(`subtarefa:${st.id}`); setMenuAberto(null) }}
                                  onDelete={() => { onDeleteSubtarefa(st.id); setMenuAberto(null) }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <button className="ee-add-tarefa-btn" onClick={() => onAddTarefa(e.id)}><IconPlus /> Nova tarefa</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RowMenu({ open, onToggle, onClose, onEdit, onDelete }) {
  return (
    <div className="ee-menu-wrap">
      <button className="ee-menu-btn" onClick={onToggle} aria-label="Mais opções">⋮</button>
      {open && (
        <>
          <div className="ee-menu-scrim" onClick={onClose} />
          <div className="ee-menu">
            {onEdit && <button onClick={onEdit}>Editar nome</button>}
            <button className="ee-menu-danger" onClick={onDelete}>Excluir</button>
          </div>
        </>
      )}
    </div>
  )
}
