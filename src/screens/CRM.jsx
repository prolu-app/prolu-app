import { useState, useRef, useEffect, useCallback } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { CRM_COLUMNS, CRM_ROWS } from '../data/seed.js'
import { IconPlus, IconSearch, IconTrash, IconEdit, IconClose } from '../components/Icons.jsx'
import './CRM.css'

const COLOR_OPTS = ['gray', 'blue', 'green', 'orange', 'violet', 'red']
const TYPE_LABELS = { text: 'Texto', number: 'Número', money: 'Dinheiro (R$)', date: 'Data', select: 'Seleção' }

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

// Converte uma linha do banco (id + valores jsonb) para o formato plano
// que as telas usam: { id, c_data: ..., c_cliente: ..., ... }
function flattenRow(dbRow) {
  return { id: dbRow.id, ...dbRow.valores }
}

export default function CRM() {
  const toast = useToast()
  const { user } = useAuth()
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null) // { rowId, colId }
  const [colModal, setColModal] = useState(null) // null | 'new' | columnId (editando)
  const [colForm, setColForm] = useState({ name: '', type: 'text', options: [] })
  const [statusMenu, setStatusMenu] = useState(null) // { rowId, colId, x, y }
  const inputRef = useRef(null)

  const statusCol = columns.find((c) => c.id === 'c_status')

  // ── carregamento inicial ──
  useEffect(() => { carregar() }, [user?.empresaId])

  async function carregar() {
    if (!supabaseReady || !user?.empresaId) {
      // Modo demonstração: usa os dados de seed, sem persistência real.
      setColumns(CRM_COLUMNS)
      setRows(CRM_ROWS)
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: cols, error: colErr }, { data: lin, error: linErr }] = await Promise.all([
      supabase.from('crm_colunas').select('*').eq('empresa_id', user.empresaId).order('ordem', { ascending: true }),
      supabase.from('crm_linhas').select('*').eq('empresa_id', user.empresaId).order('created_at', { ascending: false }),
    ])

    if (colErr || linErr) {
      toast('Não foi possível carregar o CRM')
      setLoading(false)
      return
    }

    // Primeira vez que essa empresa acessa o CRM: ainda não tem colunas
    // cadastradas no banco. Semeamos com as colunas padrão.
    if (!cols || cols.length === 0) {
      await seedColunasPadrao()
      return
    }

    setColumns(cols.map((c) => ({ id: c.id, name: c.nome, type: c.tipo, width: 150, options: c.opcoes || [], ordem: c.ordem })))
    setRows((lin || []).map(flattenRow))
    setLoading(false)
  }

  // Cria as colunas padrão no banco na primeira vez que a empresa abre o CRM.
  async function seedColunasPadrao() {
    const payload = CRM_COLUMNS.map((c, i) => ({
      empresa_id: user.empresaId, nome: c.name, tipo: c.type, ordem: i, opcoes: c.options || [],
    }))
    const { data: created, error } = await supabase.from('crm_colunas').insert(payload).select('*')
    if (error) { toast('Não foi possível preparar o CRM'); setLoading(false); return }
    setColumns(created.map((c) => ({ id: c.id, name: c.nome, type: c.tipo, width: 150, options: c.opcoes || [], ordem: c.ordem })))
    setRows([])
    setLoading(false)
  }

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

  // ── persistência de células ──
  async function updateCell(rowId, colId, value) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [colId]: value } : r)))
    setEditing(null)

    if (!supabaseReady || !user?.empresaId) { toast('Salvo (modo demonstração)'); return }

    const row = rows.find((r) => r.id === rowId)
    const novosValores = { ...row, [colId]: value }
    delete novosValores.id
    const { error } = await supabase.from('crm_linhas').update({ valores: novosValores, updated_at: new Date().toISOString() }).eq('id', rowId)
    if (error) { toast('Não foi possível salvar'); return }
    toast('Salvo automaticamente')
  }

  // ── linhas ──
  async function addRow() {
    const novosValores = {}
    columns.forEach((c) => { novosValores[c.id] = c.type === 'money' || c.type === 'number' ? null : '' })

    if (!supabaseReady || !user?.empresaId) {
      setRows((prev) => [{ id: 'r' + Date.now(), ...novosValores }, ...prev])
      toast('Linha criada (modo demonstração)')
      return
    }

    const { data, error } = await supabase.from('crm_linhas').insert({ empresa_id: user.empresaId, valores: novosValores, created_by: user.id }).select('*').single()
    if (error) { toast('Não foi possível criar a linha'); return }
    setRows((prev) => [flattenRow(data), ...prev])
    toast('Linha criada')
  }

  async function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (!supabaseReady || !user?.empresaId) { toast('Linha removida (modo demonstração)'); return }
    const { error } = await supabase.from('crm_linhas').delete().eq('id', id)
    if (error) { toast('Não foi possível remover'); carregar(); return }
    toast('Linha removida')
  }

  // ── colunas: criar ──
  function openNewColumn() {
    setColForm({ name: '', type: 'text', options: [] })
    setColModal('new')
  }

  async function confirmNewColumn() {
    if (!colForm.name.trim()) return
    const opcoes = colForm.type === 'select' ? (colForm.options.length ? colForm.options : [{ value: 'Novo status', color: 'gray' }]) : []

    if (!supabaseReady || !user?.empresaId) {
      const id = 'c_' + Date.now()
      setColumns((prev) => [...prev, { id, name: colForm.name.trim(), type: colForm.type, width: 150, options: opcoes }])
      setColModal(null)
      toast('Coluna criada (modo demonstração)')
      return
    }

    const { data, error } = await supabase.from('crm_colunas').insert({
      empresa_id: user.empresaId, nome: colForm.name.trim(), tipo: colForm.type, ordem: columns.length, opcoes,
    }).select('*').single()
    if (error) { toast('Não foi possível criar a coluna'); return }
    setColumns((prev) => [...prev, { id: data.id, name: data.nome, type: data.tipo, width: 150, options: data.opcoes || [] }])
    setColModal(null)
    toast('Coluna criada')
  }

  // ── colunas: editar ──
  function openEditColumn(col) {
    setColForm({ name: col.name, type: col.type, options: col.options || [] })
    setColModal(col.id)
  }

  async function confirmEditColumn() {
    const colId = colModal
    if (!colForm.name.trim()) return
    const opcoes = colForm.type === 'select' ? colForm.options : []

    setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, name: colForm.name.trim(), type: colForm.type, options: opcoes } : c))
    setColModal(null)

    if (!supabaseReady || !user?.empresaId) { toast('Coluna atualizada (modo demonstração)'); return }
    const { error } = await supabase.from('crm_colunas').update({ nome: colForm.name.trim(), tipo: colForm.type, opcoes }).eq('id', colId)
    if (error) { toast('Não foi possível salvar a coluna'); return }
    toast('Coluna atualizada')
  }

  async function removeColumn(colId) {
    if (!window.confirm('Excluir esta coluna? Os dados dela em todos os registros serão perdidos.')) return
    setColumns((prev) => prev.filter((c) => c.id !== colId))
    setColModal(null)

    if (!supabaseReady || !user?.empresaId) { toast('Coluna excluída (modo demonstração)'); return }
    await supabase.from('crm_colunas').delete().eq('id', colId)
    toast('Coluna excluída')
  }

  function addOptionToForm() {
    const value = prompt('Nome da nova opção:')
    if (!value) return
    setColForm((f) => ({ ...f, options: [...f.options, { value, color: COLOR_OPTS[f.options.length % COLOR_OPTS.length] }] }))
  }
  function removeOptionFromForm(value) {
    setColForm((f) => ({ ...f, options: f.options.filter((o) => o.value !== value) }))
  }

  // ── status inline (dropdown na célula) ──
  async function addStatusOption(colId) {
    const value = prompt('Nome do novo status:')
    if (!value) return
    const col = columns.find((c) => c.id === colId)
    const novasOpcoes = [...(col.options || []), { value, color: COLOR_OPTS[(col.options || []).length % COLOR_OPTS.length] }]
    setColumns((prev) => prev.map((c) => c.id !== colId ? c : { ...c, options: novasOpcoes }))
    if (!supabaseReady || !user?.empresaId) return
    await supabase.from('crm_colunas').update({ opcoes: novasOpcoes }).eq('id', colId)
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

  const isEditingColumn = colModal && colModal !== 'new'

  if (loading) {
    return (
      <div className="page-header">
        <div className="page-title">CRM</div>
        <div className="page-sub">Carregando seus registros…</div>
      </div>
    )
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
        <button className="crm-addcol-btn" onClick={openNewColumn}><IconPlus /> Nova coluna</button>
      </div>

      {/* DESKTOP: tabela */}
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id} style={{ minWidth: c.width }}>
                  <span className="th-label" onClick={() => openEditColumn(c)}>
                    {c.name}
                    <IconEdit className="th-edit-icon" />
                  </span>
                </th>
              ))}
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
                          type={col.type === 'money' || col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          defaultValue={row[col.id] ?? ''}
                          onBlur={(e) => updateCell(row.id, col.id, (col.type === 'money' || col.type === 'number') ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
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

      {/* modal coluna (criar ou editar) */}
      {colModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setColModal(null) }}>
          <div className="modal">
            <div className="modal-title">{isEditingColumn ? 'Editar coluna' : 'Nova coluna'}</div>
            <div className="modal-field">
              <label className="modal-label">Nome da coluna</label>
              <input className="modal-input" value={colForm.name} onChange={(e) => setColForm({ ...colForm, name: e.target.value })} placeholder="Ex: Telefone, Responsável…" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Tipo de dado</label>
              <div className="col-type-pills">
                {Object.entries(TYPE_LABELS).map(([t, lbl]) => (
                  <button key={t} className={`unit-pill${colForm.type === t ? ' selected' : ''}`} onClick={() => setColForm({ ...colForm, type: t })}>{lbl}</button>
                ))}
              </div>
            </div>

            {colForm.type === 'select' && (
              <div className="modal-field">
                <label className="modal-label">Opções</label>
                <div className="col-options-list">
                  {colForm.options.map((o) => (
                    <span key={o.value} className={`pill pill-${o.color} col-option-pill`}>
                      <span className="dot" />{o.value}
                      <button onClick={() => removeOptionFromForm(o.value)}><IconClose /></button>
                    </span>
                  ))}
                  <button className="col-option-add" onClick={addOptionToForm}><IconPlus /> Opção</button>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {isEditingColumn ? (
                <>
                  <button className="btn-cancel col-delete-btn" onClick={() => removeColumn(colModal)}><IconTrash /></button>
                  <button className="btn-cancel" onClick={() => setColModal(null)}>Cancelar</button>
                  <button className="btn-confirm" onClick={confirmEditColumn}>Salvar</button>
                </>
              ) : (
                <>
                  <button className="btn-cancel" onClick={() => setColModal(null)}>Cancelar</button>
                  <button className="btn-confirm" onClick={confirmNewColumn}>Criar coluna</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

