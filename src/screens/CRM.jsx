import { useState, useRef, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { CRM_COLUMNS, CRM_ROWS } from '../data/seed.js'
import { IconPlus, IconSearch, IconTrash } from '../components/Icons.jsx'
import './CRM.css'

const COLOR_OPTS = ['gray', 'blue', 'green', 'orange', 'violet', 'red']

function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (isNaN(n)) return v
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtDate(v) {
  if (!v) return ''
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export default function CRM() {
  const toast = useToast()
  const [columns, setColumns] = useState(CRM_COLUMNS)
  const [rows, setRows] = useState(CRM_ROWS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null) // { rowId, colId }
  const [colModal, setColModal] = useState(false)
  const [colForm, setColForm] = useState({ name: '', type: 'text' })
  const [statusMenu, setStatusMenu] = useState(null) // { rowId, colId, x, y }
  const inputRef = useRef(null)

  const statusCol = columns.find((c) => c.id === 'c_status')

  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select?.() } }, [editing])
  useEffect(() => {
    const close = () => setStatusMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const filtered = rows.filter((r) => {
    const matchSearch = !search || Object.values(r).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || r.c_status === statusFilter
    return matchSearch && matchStatus
  })

  function updateCell(rowId, colId, value) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [colId]: value } : r)))
    setEditing(null)
    toast('Salvo automaticamente')
  }

  function addRow() {
    const newRow = { id: 'r' + Date.now() }
    columns.forEach((c) => { newRow[c.id] = c.type === 'money' ? 0 : '' })
    setRows((prev) => [newRow, ...prev])
    toast('Linha criada')
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    toast('Linha removida')
  }

  function addColumn() {
    if (!colForm.name.trim()) return
    const id = 'c_' + Date.now()
    const base = { id, name: colForm.name.trim(), type: colForm.type, width: 150 }
    if (colForm.type === 'select') base.options = [{ value: 'Novo status', color: 'gray' }]
    setColumns((prev) => [...prev, base])
    setRows((prev) => prev.map((r) => ({ ...r, [id]: colForm.type === 'money' ? 0 : '' })))
    setColModal(false)
    setColForm({ name: '', type: 'text' })
    toast('Coluna criada')
  }

  function addStatusOption(colId) {
    const value = prompt('Nome do novo status:')
    if (!value) return
    setColumns((prev) => prev.map((c) => c.id !== colId ? c : { ...c, options: [...c.options, { value, color: COLOR_OPTS[c.options.length % COLOR_OPTS.length] }] }))
  }

  function pillClass(colId, value) {
    const col = columns.find((c) => c.id === colId)
    const opt = col?.options?.find((o) => o.value === value)
    return `pill-${opt?.color || 'gray'}`
  }

  function renderCellValue(row, col) {
    const v = row[col.id]
    if (col.type === 'money') return v ? fmtMoney(v) : <span className="cell-empty">—</span>
    if (col.type === 'date') return v ? fmtDate(v) : <span className="cell-empty">—</span>
    if (col.type === 'select') return v ? <span className={`pill ${pillClass(col.id, v)}`}><span className="dot" />{v}</span> : <span className="cell-empty">—</span>
    return v || <span className="cell-empty">—</span>
  }

  function openStatusMenu(e, rowId, colId) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setStatusMenu({ rowId, colId, x: r.left, y: r.bottom + 6 })
  }

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">CRM</div>
          <div className="page-sub">Todo pedido de orçamento, em um lugar só.</div>
        </div>
        <button className="btn-primary crm-new-btn" onClick={addRow}><IconPlus /> Novo registro</button>
      </div>

      <div className="crm-toolbar">
        <div className="crm-search">
          <IconSearch />
          <input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="crm-filters">
          <button className={`crm-filter-chip${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>Todos</button>
          {statusCol?.options.map((o) => (
            <button key={o.value} className={`crm-filter-chip${statusFilter === o.value ? ' active' : ''}`} onClick={() => setStatusFilter(o.value)}>
              <span className={`dot pill-${o.color}-dot`} style={{ background: `var(--${o.color === 'gray' ? 'ink-40' : o.color === 'blue' ? 'blue-ink' : o.color === 'green' ? 'green-deep' : o.color === 'orange' ? 'orange' : 'violet-ink'})` }} />
              {o.value}
            </button>
          ))}
        </div>
        <button className="crm-addcol-btn" onClick={() => setColModal(true)}><IconPlus /> Nova coluna</button>
      </div>

      {/* DESKTOP: tabela */}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.id} style={{ minWidth: c.width }}>{c.name}</th>)}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => {
                  const isEditing = editing?.rowId === row.id && editing?.colId === col.id
                  return (
                    <td key={col.id} onClick={() => col.type !== 'select' && setEditing({ rowId: row.id, colId: col.id })}>
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="cell-input"
                          type={col.type === 'money' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          defaultValue={row[col.id]}
                          onBlur={(e) => updateCell(row.id, col.id, col.type === 'money' ? Number(e.target.value) : e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null) }}
                        />
                      ) : col.type === 'select' ? (
                        <div onClick={(e) => openStatusMenu(e, row.id, col.id)} style={{ cursor: 'pointer' }}>
                          {renderCellValue(row, col)}
                        </div>
                      ) : (
                        <div className="cell-display">{renderCellValue(row, col)}</div>
                      )}
                    </td>
                  )
                })}
                <td>
                  <button className="row-del-btn" onClick={() => removeRow(row.id)}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="crm-empty">Nenhum registro encontrado.</div>}
      </div>

      {/* MOBILE: cards */}
      <div className="crm-cards">
        {filtered.map((row) => (
          <div className="crm-card" key={row.id}>
            <div className="crm-card-top">
              <div className="crm-card-title">{row.c_cliente || 'Sem nome'}</div>
              <button className="row-del-btn" onClick={() => removeRow(row.id)}><IconTrash /></button>
            </div>
            <div className="crm-card-fields">
              {columns.filter((c) => c.id !== 'c_cliente').map((col) => (
                <div className="crm-card-field" key={col.id}>
                  <span className="crm-card-label">{col.name}</span>
                  <span>{renderCellValue(row, col)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="fab" onClick={addRow} aria-label="Novo registro"><IconPlus /></button>

      {/* dropdown status */}
      {statusMenu && (
        <div className="status-dropdown" style={{ top: statusMenu.y, left: statusMenu.x }} onClick={(e) => e.stopPropagation()}>
          {columns.find((c) => c.id === statusMenu.colId)?.options.map((o) => (
            <button key={o.value} className="status-option" onClick={() => { updateCell(statusMenu.rowId, statusMenu.colId, o.value); setStatusMenu(null) }}>
              <span className={`pill pill-${o.color}`}><span className="dot" />{o.value}</span>
            </button>
          ))}
          <button className="status-option add-new" onClick={() => addStatusOption(statusMenu.colId)}><IconPlus /> Novo status</button>
        </div>
      )}

      {/* modal nova coluna */}
      {colModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setColModal(false) }}>
          <div className="modal">
            <div className="modal-title">Nova coluna</div>
            <div className="modal-field">
              <label className="modal-label">Nome da coluna</label>
              <input className="modal-input" value={colForm.name} onChange={(e) => setColForm({ ...colForm, name: e.target.value })} placeholder="Ex: Telefone, Responsável…" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Tipo de dado</label>
              <div className="col-type-pills">
                {[['text', 'Texto'], ['number', 'Número'], ['money', 'Dinheiro (R$)'], ['date', 'Data'], ['select', 'Seleção']].map(([t, lbl]) => (
                  <button key={t} className={`unit-pill${colForm.type === t ? ' selected' : ''}`} onClick={() => setColForm({ ...colForm, type: t })}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setColModal(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={addColumn}>Criar coluna</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
