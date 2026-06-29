import { useState, useEffect, useMemo } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { CRM_COLUMNS, CRM_ROWS } from '../data/seed.js'
import { IconPlus, IconSearch, IconEdit, IconClose } from '../components/Icons.jsx'
import CRMDrawer from './CRMDrawer.jsx'
import './CRM.css'

const COLOR_OPTS = ['gray', 'blue', 'green', 'orange', 'violet', 'red']
const COLOR_VARS = {
  gray: 'var(--ink-40)', blue: 'var(--blue-ink)', green: 'var(--green-deep)',
  orange: 'var(--orange)', violet: 'var(--violet-ink)', red: 'var(--red)',
}
const TYPE_LABELS = { text: 'Texto', number: 'Número', money: 'Dinheiro (R$)', date: 'Data', select: 'Seleção' }

const FIXED_COLS_DEF = [
  { nome: 'Data de entrada',   tipo: 'date',   slug: 'data_entrada',   ordem: 0 },
  { nome: 'Cliente',           tipo: 'client', slug: 'cliente',         ordem: 1 },
  { nome: 'Cidade',            tipo: 'text',   slug: 'cidade',          ordem: 2 },
  { nome: 'Segmento',          tipo: 'select', slug: 'segmento',        ordem: 3, editableOptions: true, items: [
    { value: 'Residencial', color: 'blue'   },
    { value: 'Comercial',   color: 'orange' },
    { value: 'Corporativo', color: 'violet' },
  ]},
  { nome: 'Tipo de projeto',   tipo: 'select', slug: 'tipo_projeto',    ordem: 4, editableOptions: true, items: [
    { value: 'Interiores',                  color: 'green'  },
    { value: 'Arquitetônico',               color: 'blue'   },
    { value: 'Arquitetônico + Interiores',  color: 'violet' },
    { value: 'Projeto Executivo',           color: 'gray'   },
  ]},
  { nome: 'Origem',            tipo: 'select', slug: 'origem',          ordem: 5, editableOptions: true, items: [
    { value: 'Indicação', color: 'green' }, { value: 'Instagram', color: 'violet' },
    { value: 'Google',    color: 'blue'  }, { value: 'Site',      color: 'orange' },
  ]},
  { nome: 'Valor da proposta', tipo: 'money',  slug: 'valor',           ordem: 6 },
  { nome: 'Recebeu proposta?', tipo: 'select', slug: 'proposta',        ordem: 7, editableOptions: false, items: [
    { value: 'Sim', color: 'green' }, { value: 'Não', color: 'red' }, { value: 'Pendente', color: 'orange' },
  ]},
  { nome: 'Status',            tipo: 'select', slug: 'status',          ordem: 8, editableOptions: false, items: [
    { value: 'Pedido de orçamento', color: 'blue'   },
    { value: 'Aguardando',          color: 'orange' },
    { value: 'Proposta enviada',    color: 'violet' },
    { value: 'Fechado',             color: 'green'  },
    { value: 'Perdido',             color: 'gray'   },
  ]},
  { nome: 'Data de fechamento', tipo: 'date',  slug: 'data_fechamento', ordem: 9 },
]

function todayISO() { return new Date().toISOString().split('T')[0] }

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

function parseCol(c) {
  const isObj = c.opcoes != null && !Array.isArray(c.opcoes)
  const fixed = c.fixo === true || (isObj && c.opcoes.fixed === true)
  return {
    id: c.id, name: c.nome, type: c.tipo, width: 150,
    fixed, slug: isObj ? (c.opcoes.slug || null) : null,
    // colunas fixas inseridas via SQL têm opcoes como array simples → editableOptions true por padrão
    editableOptions: fixed ? (isObj ? c.opcoes.editableOptions !== false : true) : true,
    options: fixed
      ? (isObj ? (c.opcoes.items || []) : (Array.isArray(c.opcoes) ? c.opcoes : []))
      : (Array.isArray(c.opcoes) ? c.opcoes : []),
    ordem: c.ordem ?? 999,
  }
}

function flattenRow(dbRow) { return { id: dbRow.id, ...dbRow.valores } }

function pillClass(col, value) {
  const opt = col?.options?.find(o => o.value === value)
  return `pill-${opt?.color || 'gray'}`
}

function renderCellValue(row, col) {
  const v = row[col.id]
  if (col.type === 'money') return v ? fmtMoney(v) : <span className="cell-empty">—</span>
  if (col.type === 'date')  return v ? fmtDate(v)  : <span className="cell-empty">—</span>
  if (col.type === 'tags') {
    const tags = Array.isArray(v) ? v : []
    if (!tags.length) return <span className="cell-empty">—</span>
    return <span className="tags-ro">{tags.map(t => <span key={t} className="tag-ro">{t}</span>)}</span>
  }
  if (col.type === 'select') {
    return v
      ? <span className={`pill ${pillClass(col, v)}`}><span className="dot" />{v}</span>
      : <span className="cell-empty">—</span>
  }
  return v || <span className="cell-empty">—</span>
}

// ── Edição inline de célula ──
function InlineCell({ row, col, isEditing, onActivate, onCommit, onSaveImmediate, clientes }) {
  const [localVal, setLocalVal] = useState('')

  useEffect(() => {
    if (isEditing) setLocalVal(row[col.id] ?? '') // eslint-disable-line react-hooks/exhaustive-deps
  }, [isEditing])

  function commit(v) {
    let parsed = v
    if (col.type === 'money' || col.type === 'number') {
      parsed = (v === '' || v == null) ? null : Number(String(v).replace(/[^\d]/g, '')) || null
    }
    onCommit(parsed)
  }

  if (!isEditing) {
    return (
      <div className="cell-display cell-clickable" onClick={onActivate}>
        {renderCellValue(row, col)}
      </div>
    )
  }

  if (col.type === 'date') {
    return (
      <input
        className="cell-input"
        type="date"
        autoFocus
        value={localVal || ''}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={e => commit(e.target.value)}
      />
    )
  }

  if (col.type === 'select') {
    return (
      <select
        className="cell-input cell-select"
        autoFocus
        value={localVal}
        onChange={e => commit(e.target.value)}
      >
        <option value="">—</option>
        {(col.options || []).map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
      </select>
    )
  }

  if (col.type === 'client') {
    return (
      <>
        <input
          className="cell-input"
          list="crm-clientes-inline"
          autoFocus
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        />
        <datalist id="crm-clientes-inline">
          {(clientes || []).map(c => <option key={c.id} value={c.nome} />)}
        </datalist>
      </>
    )
  }

  if (col.type === 'tags') {
    const tags = Array.isArray(row[col.id]) ? row[col.id] : []
    return (
      <div
        className="cell-tags-edit"
        tabIndex={-1}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onCommit(row[col.id]) }}
      >
        {tags.map(t => (
          <span className="tag-chip" key={t}>
            {t}
            <button type="button" className="tag-remove" onClick={() => onSaveImmediate(tags.filter(x => x !== t))}>
              <IconClose />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          autoFocus
          placeholder="+ tag"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              const v = e.target.value.trim()
              if (v && !tags.includes(v)) { onSaveImmediate([...tags, v]); e.target.value = '' }
            }
          }}
        />
      </div>
    )
  }

  // text, number, money
  return (
    <input
      className="cell-input"
      type={col.type === 'number' || col.type === 'money' ? 'number' : 'text'}
      min={col.type === 'money' ? 0 : undefined}
      step={col.type === 'money' ? 100 : undefined}
      autoFocus
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
    />
  )
}

export default function CRM() {
  const toast = useToast()
  const { user } = useAuth()
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [drawerRowId, setDrawerRowId] = useState(null)
  const [activeCell, setActiveCell] = useState(null) // { rowId, colId }
  const [colModal, setColModal] = useState(null)
  const [colForm, setColForm] = useState({ name: '', type: 'text', options: [] })

  const statusCol      = useMemo(() => columns.find(c => c.slug === 'status'), [columns])
  const clienteCol     = useMemo(() => columns.find(c => c.slug === 'cliente'), [columns])
  const dataEntradaCol = useMemo(() => columns.find(c => c.slug === 'data_entrada'), [columns])
  const dataFechCol    = useMemo(() => columns.find(c => c.slug === 'data_fechamento'), [columns])
  const drawerRow      = useMemo(() => rows.find(r => r.id === drawerRowId) || null, [rows, drawerRowId])

  useEffect(() => { carregar() }, [user?.empresaId])
  useEffect(() => { if (supabaseReady && user?.empresaId) loadClientes() }, [user?.empresaId])

  async function loadClientes() {
    const { data } = await supabase.from('clientes').select('id, nome').eq('empresa_id', user.empresaId).order('nome')
    setClientes(data || [])
  }

  async function carregar() {
    if (!supabaseReady || !user?.empresaId) {
      setColumns(CRM_COLUMNS)
      setRows(CRM_ROWS)
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: cols, error: colErr }, { data: lin, error: linErr }] = await Promise.all([
      supabase.from('crm_colunas').select('*').eq('empresa_id', user.empresaId).order('ordem', { ascending: true }),
      supabase.from('crm_linhas').select('*').eq('empresa_id', user.empresaId).order('created_at', { ascending: true }),
    ])
    if (colErr || linErr) { toast('Não foi possível carregar o CRM'); setLoading(false); return }

    const hasFixed = (cols || []).some(c =>
      c.fixo === true || (c.opcoes != null && !Array.isArray(c.opcoes) && c.opcoes.fixed === true)
    )
    if (!cols || cols.length === 0 || !hasFixed) {
      await seedColunasPadrao(cols || [])
      const { data: lin2 } = await supabase.from('crm_linhas').select('*').eq('empresa_id', user.empresaId).order('created_at', { ascending: true })
      setRows((lin2 || []).map(flattenRow))
      return
    }
    setColumns((cols || []).map(parseCol).sort((a, b) => a.ordem - b.ordem))
    setRows((lin || []).map(flattenRow))
    setLoading(false)
  }

  async function seedColunasPadrao(existingCols) {
    if (existingCols.length > 0) {
      await supabase.from('crm_colunas').delete().in('id', existingCols.map(c => c.id))
    }
    const basePayload = FIXED_COLS_DEF.map(c => ({
      empresa_id: user.empresaId, nome: c.nome, tipo: c.tipo, ordem: c.ordem,
      opcoes: { fixed: true, slug: c.slug, editableOptions: c.editableOptions !== false, items: c.items || [] },
    }))
    let { data: created, error } = await supabase
      .from('crm_colunas')
      .insert(basePayload.map(c => ({ ...c, fixo: true })))
      .select('*')
    if (error) {
      ;({ data: created, error } = await supabase
        .from('crm_colunas')
        .insert(basePayload)
        .select('*'))
    }
    if (error) { toast('Não foi possível preparar o CRM'); setLoading(false); return }
    setColumns(created.map(parseCol).sort((a, b) => a.ordem - b.ordem))
    setLoading(false)
  }

  async function updateCell(rowId, col, value) {
    let extra = {}
    if (col.slug === 'status' && value === 'Fechado' && dataFechCol) {
      const row = rows.find(r => r.id === rowId)
      if (row && !row[dataFechCol.id]) extra[dataFechCol.id] = todayISO()
    }
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [col.id]: value, ...extra } : r))
    if (!supabaseReady || !user?.empresaId) return
    const row = rows.find(r => r.id === rowId)
    const novosValores = { ...row, [col.id]: value, ...extra }
    delete novosValores.id
    const { error } = await supabase
      .from('crm_linhas')
      .update({ valores: novosValores, updated_at: new Date().toISOString() })
      .eq('id', rowId)
    if (error) toast('Não foi possível salvar')
    else toast('Salvo automaticamente')
  }

  async function addRow() {
    const novosValores = {}
    columns.forEach(c => {
      if (c.slug === 'data_entrada') novosValores[c.id] = todayISO()
      else if (c.type === 'tags') novosValores[c.id] = []
      else if (c.type === 'money' || c.type === 'number') novosValores[c.id] = null
      else novosValores[c.id] = ''
    })
    if (!supabaseReady || !user?.empresaId) {
      const id = 'r' + Date.now()
      setRows(prev => [...prev, { id, ...novosValores }])
      setDrawerRowId(id)
      return
    }
    const { data, error } = await supabase
      .from('crm_linhas')
      .insert({ empresa_id: user.empresaId, valores: novosValores, created_by: user.id })
      .select('*').single()
    if (error) { toast('Não foi possível criar a linha'); return }
    setRows(prev => [...prev, flattenRow(data)])
    setDrawerRowId(data.id)
    toast('Linha criada')
  }

  async function removeRow(id) {
    if (drawerRowId === id) setDrawerRowId(null)
    setRows(prev => prev.filter(r => r.id !== id))
    if (!supabaseReady || !user?.empresaId) return
    const { error } = await supabase.from('crm_linhas').delete().eq('id', id)
    if (error) { toast('Não foi possível remover'); carregar() }
    else toast('Linha removida')
  }

  async function addSelectOption(col) {
    const value = prompt(`Nova opção para "${col.name}":`)
    if (!value) return
    const newOption = { value, color: COLOR_OPTS[(col.options || []).length % COLOR_OPTS.length] }
    const newOptions = [...(col.options || []), newOption]
    setColumns(prev => prev.map(c => c.id !== col.id ? c : { ...c, options: newOptions }))
    if (!supabaseReady || !user?.empresaId) return
    const opcoes = col.fixed
      ? { fixed: true, slug: col.slug, editableOptions: col.editableOptions, items: newOptions }
      : newOptions
    await supabase.from('crm_colunas').update({ opcoes }).eq('id', col.id)
  }

  function openNewColumn() { setColForm({ name: '', type: 'text', options: [] }); setColModal('new') }

  async function confirmNewColumn() {
    if (!colForm.name.trim()) return
    const opcoes = colForm.type === 'select'
      ? (colForm.options.length ? colForm.options : [{ value: 'Nova opção', color: 'gray' }])
      : []
    if (!supabaseReady || !user?.empresaId) {
      const id = 'c_' + Date.now()
      setColumns(prev => [...prev, { id, name: colForm.name.trim(), type: colForm.type, width: 150, fixed: false, slug: null, editableOptions: true, options: opcoes, ordem: prev.length }])
      setColModal(null); return
    }
    const { data, error } = await supabase.from('crm_colunas').insert({
      empresa_id: user.empresaId, nome: colForm.name.trim(), tipo: colForm.type, ordem: columns.length, opcoes,
    }).select('*').single()
    if (error) { toast('Não foi possível criar a coluna'); return }
    setColumns(prev => [...prev, { id: data.id, name: data.nome, type: data.tipo, width: 150, fixed: false, slug: null, editableOptions: true, options: Array.isArray(data.opcoes) ? data.opcoes : [], ordem: data.ordem }])
    setColModal(null)
    toast('Coluna criada')
  }

  function openEditColumn(col) {
    if (col.fixed) return
    setColForm({ name: col.name, type: col.type, options: col.options || [] })
    setColModal(col.id)
  }

  async function confirmEditColumn() {
    const colId = colModal
    if (!colForm.name.trim()) return
    const opcoes = colForm.type === 'select' ? colForm.options : []
    setColumns(prev => prev.map(c => c.id === colId ? { ...c, name: colForm.name.trim(), type: colForm.type, options: opcoes } : c))
    setColModal(null)
    if (!supabaseReady || !user?.empresaId) return
    const { error } = await supabase.from('crm_colunas').update({ nome: colForm.name.trim(), tipo: colForm.type, opcoes }).eq('id', colId)
    if (error) toast('Não foi possível salvar a coluna')
    else toast('Coluna atualizada')
  }

  async function removeColumn(colId) {
    const col = columns.find(c => c.id === colId)
    if (col?.fixed) return
    if (!window.confirm('Excluir esta coluna? Os dados dela em todos os registros serão perdidos.')) return
    setColumns(prev => prev.filter(c => c.id !== colId))
    setColModal(null)
    if (!supabaseReady || !user?.empresaId) return
    await supabase.from('crm_colunas').delete().eq('id', colId)
    toast('Coluna excluída')
  }

  function addOptionToForm() {
    const value = prompt('Nome da nova opção:')
    if (!value) return
    setColForm(f => ({ ...f, options: [...f.options, { value, color: COLOR_OPTS[f.options.length % COLOR_OPTS.length] }] }))
  }
  function removeOptionFromForm(value) {
    setColForm(f => ({ ...f, options: f.options.filter(o => o.value !== value) }))
  }

  const isEditingColumn = colModal && colModal !== 'new'

  const sorted = useMemo(() => {
    if (!dataEntradaCol) return rows
    return [...rows].sort((a, b) => {
      const aD = a[dataEntradaCol.id] || ''
      const bD = b[dataEntradaCol.id] || ''
      return aD < bD ? -1 : aD > bD ? 1 : 0
    })
  }, [rows, dataEntradaCol])

  const filtered = useMemo(() => sorted.filter(r => {
    if (search) {
      const hay = Object.values(r).map(v => Array.isArray(v) ? v.join(' ') : String(v ?? '')).join(' ').toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    if (statusFilter !== 'all' && statusCol && r[statusCol.id] !== statusFilter) return false
    return true
  }), [sorted, search, statusFilter, statusCol])

  if (loading) return (
    <div className="page-header">
      <div className="page-title">CRM</div>
      <div className="page-sub">Carregando seus registros…</div>
    </div>
  )

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
          <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="crm-filters">
          <button className={`crm-filter-chip${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>Todos</button>
          {statusCol?.options.map(o => (
            <button key={o.value} className={`crm-filter-chip${statusFilter === o.value ? ' active' : ''}`} onClick={() => setStatusFilter(o.value)}>
              <span className="dot" style={{ background: COLOR_VARS[o.color] || COLOR_VARS.gray }} />
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
              {columns.map(c => (
                <th key={c.id} style={{ minWidth: c.width }}>
                  {c.fixed ? (
                    <span className="th-label th-fixed">{c.name}</span>
                  ) : (
                    <span className="th-label" onClick={e => { e.stopPropagation(); openEditColumn(c) }}>
                      {c.name}
                      <IconEdit className="th-edit-icon" />
                    </span>
                  )}
                </th>
              ))}
              <th style={{ width: 68 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id}>
                {columns.map(col => (
                  <td key={col.id}>
                    <InlineCell
                      row={row}
                      col={col}
                      isEditing={activeCell?.rowId === row.id && activeCell?.colId === col.id}
                      onActivate={() => setActiveCell({ rowId: row.id, colId: col.id })}
                      onCommit={v => { updateCell(row.id, col, v); setActiveCell(null) }}
                      onSaveImmediate={v => updateCell(row.id, col, v)}
                      clientes={clientes}
                    />
                  </td>
                ))}
                <td>
                  <div className="row-actions">
                    <button
                      className="row-open-btn"
                      onClick={() => setDrawerRowId(row.id)}
                      aria-label="Abrir detalhes"
                      title="Abrir detalhes"
                    >
                      <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    <button
                      className="row-del-btn"
                      onClick={e => {
                        e.stopPropagation()
                        const nome = clienteCol ? row[clienteCol.id] : null
                        if (window.confirm(`Excluir${nome ? ` "${nome}"` : ' este registro'}?`)) removeRow(row.id)
                      }}
                      aria-label="Excluir"
                    >
                      <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {/* Linha fantasma */}
            {statusFilter === 'all' && !search && (
              <tr className="crm-phantom-row" onClick={addRow} title="Clique para adicionar registro">
                {columns.map(col => (
                  <td key={col.id}>
                    {col.slug === 'data_entrada' && (
                      <span className="cell-phantom">{fmtDate(todayISO())}</span>
                    )}
                  </td>
                ))}
                <td />
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="crm-empty">Nenhum registro encontrado.</div>}
      </div>

      {/* MOBILE: cards */}
      <div className="crm-cards">
        {filtered.map(row => (
          <div className="crm-card" key={row.id} onClick={() => setDrawerRowId(row.id)} style={{ cursor: 'pointer' }}>
            <div className="crm-card-top">
              <div className="crm-card-title">{(clienteCol ? row[clienteCol.id] : null) || 'Sem nome'}</div>
              <button
                className="row-del-btn"
                onClick={e => { e.stopPropagation(); removeRow(row.id) }}
                aria-label="Excluir"
              >
                <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
              </button>
            </div>
            <div className="crm-card-fields">
              {columns.filter(c => c.slug !== 'cliente').map(col => (
                <div className="crm-card-field" key={col.id}>
                  <span className="crm-card-label">{col.name}</span>
                  <span>{renderCellValue(row, col)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="crm-empty">Nenhum registro encontrado.</div>}
      </div>

      <button className="fab" onClick={addRow} aria-label="Novo registro"><IconPlus /></button>

      {/* Drawer de detalhe */}
      {drawerRow && (
        <CRMDrawer
          row={drawerRow}
          columns={columns}
          onClose={() => setDrawerRowId(null)}
          onUpdateCell={(col, value) => updateCell(drawerRow.id, col, value)}
          onAddOption={addSelectOption}
          onDelete={() => removeRow(drawerRow.id)}
          clientes={clientes}
          user={user}
          onClientCreate={newClient => setClientes(prev => [...prev, newClient].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}

      {/* Modal coluna */}
      {colModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setColModal(null) }}>
          <div className="modal">
            <div className="modal-title">{isEditingColumn ? 'Editar coluna' : 'Nova coluna'}</div>
            <div className="modal-field">
              <label className="modal-label">Nome da coluna</label>
              <input className="modal-input" value={colForm.name} onChange={e => setColForm({ ...colForm, name: e.target.value })} placeholder="Ex: Telefone, Responsável…" autoFocus />
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
                  {colForm.options.map(o => (
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
                  <button className="btn-cancel col-delete-btn" onClick={() => removeColumn(colModal)}>
                    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', strokeWidth: 2, fill: 'none' }}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
                  </button>
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
