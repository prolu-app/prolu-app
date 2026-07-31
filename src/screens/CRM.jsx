import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { CRM_COLUMNS, CRM_ROWS } from '../data/seed.js'
import { IconPlus, IconSearch, IconEdit, IconClose, IconGrip, IconEye, IconEyeOff, IconFilter, IconDensityCompact, IconDensityDefault } from '../components/Icons.jsx'
import { SelectDropdown } from '../components/SelectDropdown.jsx'
import { DatePicker } from '../components/DatePicker.jsx'
import CRMDrawer from './CRMDrawer.jsx'
import './CRM.css'

const COLOR_OPTS = ['gray', 'blue', 'green', 'orange', 'violet', 'red']
const COLOR_VARS = {
  gray: 'var(--ink-40)', blue: 'var(--blue-ink)', green: 'var(--green-deep)',
  orange: 'var(--orange)', violet: 'var(--violet-ink)', red: 'var(--red)',
}
const TYPE_LABELS = { text: 'Texto', number: 'Número', money: 'Dinheiro (R$)', date: 'Data', select: 'Seleção' }

// ── filtros por coluna ──
const SELECT_FILTER_SLUGS = ['segmento', 'tipo_projeto', 'origem', 'icp', 'proposta', 'status']
const DATE_FILTER_SLUGS = ['data_entrada', 'data_fechamento']

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
    { value: 'Arquitetônico',               color: 'blue'   },
    { value: 'Interiores',                  color: 'green'  },
    { value: 'Arquitetônico + Interiores',  color: 'violet' },
    { value: 'Reforma',                     color: 'orange' },
    { value: 'Reforma + Interiores',        color: 'gray'   },
    { value: 'Interiores + Acomp',          color: 'green'  },
    { value: 'Arquitetônico + Acomp',       color: 'blue'   },
    { value: 'Arq + Int + Acomp',           color: 'violet' },
  ]},
  { nome: 'Origem',            tipo: 'select', slug: 'origem',          ordem: 5, editableOptions: true, items: [
    { value: 'Indicação', color: 'green' }, { value: 'Instagram', color: 'violet' },
    { value: 'Google',    color: 'blue'  }, { value: 'Site',      color: 'orange' },
  ]},
  { nome: 'ICP',               tipo: 'select', slug: 'icp',            ordem: 6, editableOptions: false, items: [
    { value: 'Sim', color: 'green' }, { value: 'Não', color: 'red' },
  ]},
  { nome: 'Valor da proposta', tipo: 'money',  slug: 'valor',           ordem: 7 },
  { nome: 'Recebeu proposta?', tipo: 'select', slug: 'proposta',        ordem: 8, editableOptions: false, items: [
    { value: 'Sim', color: 'green' }, { value: 'Não', color: 'red' }, { value: 'Pendente', color: 'orange' },
  ]},
  { nome: 'Status',            tipo: 'select', slug: 'status',          ordem: 9, editableOptions: false, items: [
    { value: 'Pedido de orçamento', color: 'blue'   },
    { value: 'Aguardando',          color: 'orange' },
    { value: 'Proposta enviada',    color: 'violet' },
    { value: 'Fechado',             color: 'green'  },
    { value: 'Perdido',             color: 'gray'   },
  ]},
  { nome: 'Data de fechamento', tipo: 'date',  slug: 'data_fechamento', ordem: 10 },
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

function parseDateStr(s) {
  if (!s) return null
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}
function inPeriod(dateStr, [start, end]) {
  const d = parseDateStr(dateStr)
  return d ? d >= start && d <= end : false
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

// No modo compacto, células de seleção (pill + chevron) não podem truncar com
// ellipsis — cortaria o ícone. Só texto simples trunca.
function cellTypeClass(col) {
  return col.type === 'select' ? 'cell-select' : 'cell-text'
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

function InlineClientField({ value, col, onCommit, clientes, user, onClientCreate }) {
  const [inputVal, setInputVal] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => { setInputVal(value || '') }, [value])

  const suggestions = useMemo(() => {
    const q = inputVal.trim().toLowerCase()
    if (!q) return []
    return (clientes || []).filter(c => c.nome.toLowerCase().includes(q))
  }, [inputVal, clientes])

  function selectClient(nome) {
    setInputVal(nome)
    setOpen(false)
    onCommit(nome)
  }

  async function createAndSelect() {
    const nome = inputVal.trim()
    if (!nome) return
    if (!supabaseReady || !user?.empresaId) { selectClient(nome); return }
    setCreating(true)
    const { data, error } = await supabase
      .from('clientes')
      .insert({ empresa_id: user.empresaId, nome })
      .select('id, nome')
      .single()
    setCreating(false)
    if (!error && data) { onClientCreate?.(data); selectClient(data.nome) }
  }

  return (
    <div className="cell-client-wrap">
      <input
        className="cell-input"
        autoFocus
        value={inputVal}
        placeholder="Nome do cliente…"
        onChange={e => { setInputVal(e.target.value); setOpen(e.target.value.length > 0) }}
        onBlur={() => { setTimeout(() => setOpen(false), 120); onCommit(inputVal.trim() || null) }}
      />
      {open && (
        <div className="dr-client-dropdown">
          {suggestions.length > 0
            ? suggestions.map(c => (
                <button key={c.id} className="dr-client-option" type="button"
                  onMouseDown={e => { e.preventDefault(); selectClient(c.nome) }}>
                  {c.nome}
                </button>
              ))
            : (
                <button className="dr-client-option dr-client-create" type="button"
                  onMouseDown={e => { e.preventDefault(); createAndSelect() }}
                  disabled={creating}>
                  {creating ? 'Criando…' : `Criar cliente: "${inputVal.trim()}"`}
                </button>
              )
          }
        </div>
      )}
    </div>
  )
}

// ── Edição inline de célula ──
function InlineCell({ row, col, isEditing, onActivate, onCommit, onSaveImmediate, clientes, user, onClientCreate, onEditOptions }) {
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

  // Select e date: sempre renderizam sem precisar de isEditing
  if (col.type === 'select') {
    return (
      <SelectDropdown
        col={col}
        value={row[col.id] || ''}
        onChange={v => onCommit(v)}
        onEditOptions={onEditOptions}
        variant="cell"
      />
    )
  }

  if (col.type === 'date') {
    return (
      <DatePicker
        value={row[col.id] || ''}
        onChange={v => onCommit(v)}
        placeholder="—"
        className="dp-cell"
      />
    )
  }

  if (!isEditing) {
    return (
      <div className="cell-display cell-clickable" onClick={onActivate}>
        {renderCellValue(row, col)}
      </div>
    )
  }

  if (col.type === 'client') {
    return <InlineClientField value={row[col.id]} col={col} onCommit={onCommit} clientes={clientes} user={user} onClientCreate={onClientCreate} />
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

// Dropdown de filtro de coluna renderizado via portal em document.body, para nunca
// ser cortado pelo overflow:auto de .crm-table-wrap. Posição recalculada a partir do
// botão âncora e mantida em sincronia em scroll (inclusive da própria tabela) e resize.
function ColFilterPortal({ anchorRef, onClose, children }) {
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    function updatePos() {
      const btn = anchorRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [anchorRef])

  if (!pos) return null

  return createPortal(
    <>
      <div className="crm-col-vis-scrim" onClick={onClose} />
      <div className="crm-col-vis-dropdown crm-colfilter-portal" style={{ top: pos.top, right: pos.right }}>
        {children}
      </div>
    </>,
    document.body
  )
}

// Botão de filtro de coluna: precisa do próprio ref (âncora do portal),
// por isso vive em componente separado em vez de dentro do .map() do CRM.
// Renderizado inline no th, ao lado do nome da coluna.
function ColFilterButton({
  col, isSelectFilter, isDateFilter, active, isOpen, options, selectedSet, draft,
  onToggleOpen, onClose, onClearSelect, onToggleValue, onDraftChange, onApplyDate,
}) {
  const btnRef = useRef(null)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`col-filter-btn${active ? ' active' : ''}`}
        onClick={e => { e.stopPropagation(); onToggleOpen() }}
        aria-label={`Filtrar ${col.name}`}
        aria-pressed={active}
      >
        <IconFilter />
      </button>
      {isOpen && (
        <ColFilterPortal anchorRef={btnRef} onClose={onClose}>
          {isSelectFilter ? (
            <>
              <label className="crm-col-vis-item">
                <input type="checkbox" checked={!(selectedSet?.size > 0)} onChange={onClearSelect} />
                <span>Todos</span>
              </label>
              {options.map(o => (
                <label key={o.value} className="crm-col-vis-item">
                  <input type="checkbox" checked={!!selectedSet?.has(o.value)} onChange={() => onToggleValue(o.value)} />
                  <span className="dot" style={{ background: COLOR_VARS[o.color] || COLOR_VARS.gray }} />
                  <span>{o.value}</span>
                </label>
              ))}
            </>
          ) : (
            <div className="crm-period-custom">
              <DatePicker
                value={draft.start}
                onChange={v => onDraftChange({ ...draft, start: v })}
                placeholder="Data inicial"
                className="crm-period-input"
                max={draft.end || undefined}
              />
              <DatePicker
                value={draft.end}
                onChange={v => onDraftChange({ ...draft, end: v })}
                placeholder="Data final"
                className="crm-period-input"
                min={draft.start || undefined}
              />
              {draft.start && draft.end && (
                <button className="btn-primary crm-period-apply" onClick={onApplyDate}>Aplicar</button>
              )}
            </div>
          )}
        </ColFilterPortal>
      )}
    </>
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
  const [drawerRowId, setDrawerRowId] = useState(null)
  const [activeCell, setActiveCell] = useState(null) // { rowId, colId }
  const [colModal, setColModal] = useState(null)
  const [colForm, setColForm] = useState({ name: '', type: 'text', options: [] })
  const [optionsModal, setOptionsModal] = useState(null)
  const [optionsForm, setOptionsForm] = useState([])
  const [newOptName, setNewOptName] = useState('')
  const [hiddenCols, setHiddenCols] = useState(new Set())
  const [colVisOpen, setColVisOpen] = useState(false)
  const [dragColId, setDragColId] = useState(null)
  const [dragOverColId, setDragOverColId] = useState(null)
  const [dragOverPos, setDragOverPos] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type:'row'|'col', id, nome }
  const [addOptInput, setAddOptInput] = useState('')
  const [addOptColor, setAddOptColor] = useState(COLOR_OPTS[0])
  const [density, setDensity] = useState(() => {
    try { return localStorage.getItem('crm_density') === 'compact' ? 'compact' : 'default' } catch { return 'default' }
  })
  const [openColFilter, setOpenColFilter] = useState(null) // colId com dropdown de filtro aberto
  const [colSelectFilters, setColSelectFilters] = useState({}) // { [colId]: Set<string> }
  const [colDateFilters, setColDateFilters] = useState({}) // { [colId]: { start, end } } aplicado
  const [colDateDraft, setColDateDraft] = useState({}) // { [colId]: { start, end } } rascunho
  const tableRef = useRef(null)
  const shouldScrollRef = useRef(true)

  const clienteCol     = useMemo(() => columns.find(c => c.slug === 'cliente'), [columns])
  const dataEntradaCol = useMemo(() => columns.find(c => c.slug === 'data_entrada'), [columns])
  const dataFechCol    = useMemo(() => columns.find(c => c.slug === 'data_fechamento'), [columns])
  const valorCol       = useMemo(() => columns.find(c => c.slug === 'valor'), [columns])
  const drawerRow      = useMemo(() => rows.find(r => r.id === drawerRowId) || null, [rows, drawerRowId])

  useEffect(() => { carregar() }, [user?.empresaId])
  useEffect(() => { if (supabaseReady && user?.empresaId) loadClientes() }, [user?.empresaId])
  useEffect(() => {
    const key = `crm_hidden_cols_${user?.empresaId || 'demo'}`
    try { const s = localStorage.getItem(key); if (s) setHiddenCols(new Set(JSON.parse(s))) } catch {}
  }, [user?.empresaId])

  async function loadClientes() {
    const { data } = await supabase.from('clientes').select('id, nome').eq('empresa_id', user.empresaId).order('nome')
    setClientes(data || [])
  }

  async function carregar() {
    shouldScrollRef.current = true
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

    // Insere colunas fixas que estejam faltando (adicionadas ao FIXED_COLS_DEF depois do seed inicial)
    let parsedCols = (cols || []).map(parseCol)
    const missing = FIXED_COLS_DEF.filter(def => !parsedCols.some(c => c.slug === def.slug || c.name === def.nome))
    if (missing.length > 0) {
      const payload = missing.map(c => ({
        empresa_id: user.empresaId, nome: c.nome, tipo: c.tipo, ordem: c.ordem, fixo: true,
        opcoes: { fixed: true, slug: c.slug, editableOptions: c.editableOptions !== false, items: c.items || [] },
      }))
      const { data: newCols } = await supabase.from('crm_colunas').insert(payload).select('*')
      if (newCols) parsedCols = [...parsedCols, ...newCols.map(parseCol)]
    }

    setColumns(parsedCols.sort((a, b) => a.ordem - b.ordem))
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
      return
    }
    const { data, error } = await supabase
      .from('crm_linhas')
      .insert({ empresa_id: user.empresaId, valores: novosValores, created_by: user.id })
      .select('*').single()
    if (error) { toast('Não foi possível criar a linha'); return }
    setRows(prev => [...prev, flattenRow(data)])
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

  function openOptionsModal(col) {
    setOptionsModal(col)
    setOptionsForm([...(col.options || [])])
    setNewOptName('')
  }

  function addToOptionsForm() {
    const v = newOptName.trim()
    if (!v || optionsForm.find(o => o.value === v)) return
    setOptionsForm(f => [...f, { value: v, color: COLOR_OPTS[f.length % COLOR_OPTS.length] }])
    setNewOptName('')
  }

  async function confirmSaveOptions() {
    const col = optionsModal
    const newOptions = optionsForm
    setColumns(prev => prev.map(c => c.id !== col.id ? c : { ...c, options: newOptions }))
    setOptionsModal(null)
    setNewOptName('')
    if (!supabaseReady || !user?.empresaId) return
    const opcoes = col.fixed
      ? { fixed: true, slug: col.slug, editableOptions: true, items: newOptions }
      : newOptions
    const { error } = await supabase.from('crm_colunas').update({ opcoes }).eq('id', col.id)
    if (error) toast('Não foi possível salvar as opções')
    else toast('Opções salvas')
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
    setColumns(prev => prev.filter(c => c.id !== colId))
    setColModal(null)
    if (!supabaseReady || !user?.empresaId) return
    await supabase.from('crm_colunas').delete().eq('id', colId)
    toast('Coluna excluída')
  }

  function addOptionToForm() {
    const v = addOptInput.trim()
    if (!v) return
    setColForm(f => ({ ...f, options: [...f.options, { value: v, color: addOptColor }] }))
    setAddOptInput('')
    setAddOptColor(c => COLOR_OPTS[(COLOR_OPTS.indexOf(c) + 1) % COLOR_OPTS.length])
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

  function toggleColFilterOpen(colId, isDate) {
    setOpenColFilter(prev => {
      const next = prev === colId ? null : colId
      if (next && isDate) {
        setColDateDraft(d => ({ ...d, [colId]: colDateFilters[colId] || { start: '', end: '' } }))
      }
      return next
    })
  }

  function toggleColSelectValue(colId, value) {
    shouldScrollRef.current = true
    setColSelectFilters(prev => {
      const set = new Set(prev[colId] || [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [colId]: set }
    })
  }

  function clearColSelectFilter(colId) {
    shouldScrollRef.current = true
    setColSelectFilters(prev => {
      const next = { ...prev }
      delete next[colId]
      return next
    })
  }

  function applyColDateFilter(colId) {
    shouldScrollRef.current = true
    setColDateFilters(prev => ({ ...prev, [colId]: colDateDraft[colId] }))
    setOpenColFilter(null)
  }

  function clearColFilters() {
    shouldScrollRef.current = true
    setColSelectFilters({})
    setColDateFilters({})
    setColDateDraft({})
  }

  // Opções de filtro por coluna: só os valores que de fato aparecem nos dados, mantendo cor/ordem configuradas.
  const colFilterOptions = useMemo(() => {
    const map = {}
    SELECT_FILTER_SLUGS.forEach(slug => {
      const col = columns.find(c => c.slug === slug)
      if (!col) return
      const found = new Set()
      rows.forEach(r => { const v = r[col.id]; if (v) found.add(v) })
      const ordered = (col.options || []).filter(o => found.has(o.value))
      const extra = [...found].filter(v => !ordered.some(o => o.value === v)).map(v => ({ value: v, color: 'gray' }))
      map[col.id] = [...ordered, ...extra]
    })
    return map
  }, [rows, columns])

  const hasColFilters = Object.values(colSelectFilters).some(s => s && s.size > 0)
    || Object.values(colDateFilters).some(r => r && r.start && r.end)

  const filtered = useMemo(() => sorted.filter(r => {
    if (search) {
      const hay = Object.values(r).map(v => Array.isArray(v) ? v.join(' ') : String(v ?? '')).join(' ').toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    for (const colId in colSelectFilters) {
      const set = colSelectFilters[colId]
      if (set && set.size > 0 && !set.has(r[colId])) return false
    }
    for (const colId in colDateFilters) {
      const range = colDateFilters[colId]
      if (!range || !range.start || !range.end) continue
      const s = parseDateStr(range.start)
      const e = parseDateStr(range.end)
      if (!s || !e) continue
      const eod = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999)
      if (!inPeriod(r[colId], [s, eod])) return false
    }
    return true
  }), [sorted, search, colSelectFilters, colDateFilters])

  const summary = useMemo(() => {
    const count = filtered.length
    let total = 0
    let filledCount = 0
    if (valorCol) {
      filtered.forEach(r => {
        const raw = r[valorCol.id]
        if (raw === null || raw === undefined || raw === '') return
        const n = Number(raw)
        if (!isNaN(n)) { total += n; filledCount++ }
      })
    }
    return {
      count,
      total: count > 0 ? total : null,
      avg: filledCount > 0 ? total / filledCount : null,
    }
  }, [filtered, valorCol])

  useEffect(() => {
    if (!shouldScrollRef.current) return
    tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'instant' })
    shouldScrollRef.current = false
  }, [filtered])

  const visibleCols = useMemo(() => columns.filter(c => !hiddenCols.has(c.id)), [columns, hiddenCols])

  function toggleColVis(colId) {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      localStorage.setItem(`crm_hidden_cols_${user?.empresaId || 'demo'}`, JSON.stringify([...next]))
      return next
    })
  }

  function changeDensity(d) {
    setDensity(d)
    try { localStorage.setItem('crm_density', d) } catch {}
  }

  function reorderColumns(draggedId, targetId, position) {
    if (draggedId === targetId) return
    const fromIdx = columns.findIndex(c => c.id === draggedId)
    if (fromIdx === -1 || !columns.some(c => c.id === targetId)) return
    const list = [...columns]
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex(c => c.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((c, i) => ({ ...c, ordem: i }))
    setColumns(reordered)
    if (supabaseReady && user?.empresaId) {
      reordered.forEach(c => {
        supabase.from('crm_colunas').update({ ordem: c.ordem }).eq('id', c.id)
      })
    }
  }

  function resetColDrag() {
    setDragColId(null)
    setDragOverColId(null)
    setDragOverPos(null)
  }

  function handleColDragStart(e, colId) {
    setDragColId(colId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', colId)
  }

  function handleColDragOver(e, colId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (colId === dragColId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOverColId(colId)
    setDragOverPos(position)
  }

  function handleColDrop(e, colId) {
    e.preventDefault()
    if (dragColId && dragColId !== colId) reorderColumns(dragColId, colId, dragOverPos || 'before')
    resetColDrag()
  }

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
        <div className="crm-toolbar-left">
          <div className="crm-search">
            <IconSearch />
            <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {hasColFilters && (
            <button className="crm-clear-filters-btn" onClick={clearColFilters}>
              <IconClose /> Limpar filtros
            </button>
          )}
        </div>
        <div className="crm-toolbar-right">
          <div className="crm-col-vis-wrap">
            <button className={`crm-addcol-btn crm-col-vis-btn${colVisOpen ? ' active' : ''}`} onClick={() => setColVisOpen(v => !v)}>
              <svg viewBox="0 0 24 24"><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>
              Colunas{hiddenCols.size > 0 ? ` (${columns.length - hiddenCols.size}/${columns.length})` : ''}
            </button>
            {colVisOpen && (
              <>
                <div className="crm-col-vis-scrim" onClick={() => setColVisOpen(false)} />
                <div className="crm-col-vis-dropdown">
                  <div className="crm-col-vis-title">Colunas visíveis</div>
                  {columns.map(c => {
                    const visible = !hiddenCols.has(c.id)
                    return (
                      <div
                        key={c.id}
                        className={[
                          'crm-colpanel-row',
                          visible ? '' : 'hidden-col',
                          dragColId === c.id ? 'dragging' : '',
                          dragOverColId === c.id && dragOverPos === 'before' ? 'drag-over-before' : '',
                          dragOverColId === c.id && dragOverPos === 'after' ? 'drag-over-after' : '',
                        ].filter(Boolean).join(' ')}
                        draggable
                        onDragStart={e => handleColDragStart(e, c.id)}
                        onDragOver={e => handleColDragOver(e, c.id)}
                        onDrop={e => handleColDrop(e, c.id)}
                        onDragEnd={resetColDrag}
                      >
                        <span className="crm-col-vis-grip" aria-hidden="true"><IconGrip /></span>
                        <span className="crm-col-vis-name">{c.name}</span>
                        <button
                          type="button"
                          className="crm-col-vis-eye"
                          onClick={() => toggleColVis(c.id)}
                          aria-label={visible ? 'Ocultar coluna' : 'Mostrar coluna'}
                        >
                          {visible ? <IconEye /> : <IconEyeOff />}
                        </button>
                      </div>
                    )
                  })}
                  {hiddenCols.size > 0 && (
                    <button className="crm-col-vis-reset" onClick={() => {
                      setHiddenCols(new Set())
                      localStorage.removeItem(`crm_hidden_cols_${user?.empresaId || 'demo'}`)
                    }}>Mostrar todas</button>
                  )}
                </div>
              </>
            )}
          </div>
          <button className="crm-addcol-btn" onClick={openNewColumn}><IconPlus /> Nova coluna</button>
          <div className="crm-density-toggle" role="group" aria-label="Densidade da tabela">
            {[['compact', 'Compacto', IconDensityCompact], ['default', 'Padrão', IconDensityDefault]].map(([d, lbl, Icon]) => (
              <button
                key={d}
                type="button"
                className={`crm-density-btn${density === d ? ' active' : ''}`}
                onClick={() => changeDensity(d)}
                aria-pressed={density === d}
                title={lbl}
              >
                <Icon />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DESKTOP: tabela */}
      <div className={`crm-table-wrap density-${density}`} ref={tableRef}>
        <table className="crm-table">
          <thead>
            <tr>
              {visibleCols.map(c => {
                const isSelectFilter = SELECT_FILTER_SLUGS.includes(c.slug)
                const isDateFilter = DATE_FILTER_SLUGS.includes(c.slug)
                const hasFilter = isSelectFilter || isDateFilter
                const active = isSelectFilter
                  ? (colSelectFilters[c.id]?.size > 0)
                  : !!(colDateFilters[c.id]?.start && colDateFilters[c.id]?.end)
                return (
                  <th key={c.id} data-col={c.slug || undefined} style={density === 'compact' ? undefined : { minWidth: c.width }}>
                    <div className="th-content">
                      {c.fixed ? (
                        <span className="th-label th-fixed">{c.name}</span>
                      ) : (
                        <span className="th-label" onClick={e => { e.stopPropagation(); openEditColumn(c) }}>
                          {c.name}
                          <IconEdit className="th-edit-icon" />
                        </span>
                      )}
                      {hasFilter && (
                        <ColFilterButton
                          col={c}
                          isSelectFilter={isSelectFilter}
                          isDateFilter={isDateFilter}
                          active={active}
                          isOpen={openColFilter === c.id}
                          options={colFilterOptions[c.id] || []}
                          selectedSet={colSelectFilters[c.id]}
                          draft={colDateDraft[c.id] || { start: '', end: '' }}
                          onToggleOpen={() => toggleColFilterOpen(c.id, isDateFilter)}
                          onClose={() => setOpenColFilter(null)}
                          onClearSelect={() => clearColSelectFilter(c.id)}
                          onToggleValue={value => toggleColSelectValue(c.id, value)}
                          onDraftChange={next => setColDateDraft(d => ({ ...d, [c.id]: next }))}
                          onApplyDate={() => applyColDateFilter(c.id)}
                        />
                      )}
                    </div>
                  </th>
                )
              })}
              <th className="th-actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id}>
                {visibleCols.map(col => (
                  <td key={col.id} data-col={col.slug || undefined} className={cellTypeClass(col)}>
                    <InlineCell
                      row={row}
                      col={col}
                      isEditing={activeCell?.rowId === row.id && activeCell?.colId === col.id}
                      onActivate={() => setActiveCell({ rowId: row.id, colId: col.id })}
                      onCommit={v => { updateCell(row.id, col, v); setActiveCell(null) }}
                      onSaveImmediate={v => updateCell(row.id, col, v)}
                      clientes={clientes}
                      user={user}
                      onClientCreate={newClient => setClientes(prev => [...prev, newClient].sort((a, b) => a.nome.localeCompare(b.nome)))}
                      onEditOptions={col => { setActiveCell(null); openOptionsModal(col) }}
                    />
                  </td>
                ))}
                <td className="td-actions">
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
                        setDeleteConfirm({ type: 'row', id: row.id, nome })
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
            {!search && !hasColFilters && (
              <tr className="crm-phantom-row" onClick={addRow} title="Clique para adicionar registro">
                {visibleCols.map(col => (
                  <td key={col.id} data-col={col.slug || undefined} className={cellTypeClass(col)}>
                    {col.slug === 'data_entrada' && (
                      <span className="cell-phantom">{fmtDate(todayISO())}</span>
                    )}
                  </td>
                ))}
                <td className="td-actions" />
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="crm-empty">Nenhum registro encontrado.</div>}
      </div>

      {/* Resumo dos registros visíveis */}
      <div className="crm-summary-card">
        <div className="crm-summary-item">
          <span className="crm-summary-label">Pedidos</span>
          <span className="crm-summary-dot">·</span>
          <span className="crm-summary-value">{summary.count}</span>
        </div>
        <div className="crm-summary-item">
          <span className="crm-summary-label">Valor total</span>
          <span className="crm-summary-dot">·</span>
          <span className="crm-summary-value">{summary.total !== null ? fmtMoney(summary.total) : '—'}</span>
        </div>
        <div className="crm-summary-item">
          <span className="crm-summary-label">Ticket médio</span>
          <span className="crm-summary-dot">·</span>
          <span className="crm-summary-value">{summary.avg !== null ? fmtMoney(summary.avg) : '—'}</span>
        </div>
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
          onAddOption={openOptionsModal}
          onDelete={() => removeRow(drawerRow.id)}
          clientes={clientes}
          user={user}
          onClientCreate={newClient => setClientes(prev => [...prev, newClient].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}

      {/* Modal editar opções de select */}
      {optionsModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setOptionsModal(null) }}>
          <div className="modal">
            <div className="modal-title">Opções — {optionsModal.name}</div>
            <div className="modal-field">
              <label className="modal-label">Opções atuais</label>
              <div className="col-options-list">
                {optionsForm.length === 0 && (
                  <span style={{ color: 'var(--ink-40)', fontSize: 13 }}>Nenhuma opção</span>
                )}
                {optionsForm.map((o, i) => (
                  <span key={i} className={`pill pill-${o.color} col-option-pill`}>
                    <span className="dot" />{o.value}
                    <button onClick={() => setOptionsForm(f => f.filter((_, j) => j !== i))}><IconClose /></button>
                  </span>
                ))}
              </div>
            </div>
            <div className="modal-field">
              <label className="modal-label">Adicionar opção</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="modal-input"
                  placeholder="Nome da opção…"
                  value={newOptName}
                  onChange={e => setNewOptName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addToOptionsForm() }}
                  style={{ flex: 1 }}
                />
                <button className="col-option-add" onClick={addToOptionsForm} style={{ flexShrink: 0 }}>
                  <IconPlus /> Adicionar
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setOptionsModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={confirmSaveOptions}>Salvar</button>
            </div>
          </div>
        </div>
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
                </div>
                <div className="col-opt-adder">
                  <div className="col-opt-colors">
                    {COLOR_OPTS.map(c => (
                      <button key={c} type="button"
                        className={`col-opt-dot${addOptColor === c ? ' sel' : ''}`}
                        style={{ background: COLOR_VARS[c] }}
                        onClick={() => setAddOptColor(c)}
                        title={c}
                      />
                    ))}
                  </div>
                  <div className="col-opt-row">
                    <input
                      className="modal-input col-opt-input"
                      placeholder="Nome da opção…"
                      value={addOptInput}
                      onChange={e => setAddOptInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOptionToForm() } }}
                    />
                    <button className="btn-confirm col-opt-add-btn" type="button" onClick={addOptionToForm} disabled={!addOptInput.trim()}>
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="modal-actions">
              {isEditingColumn ? (
                <>
                  <button className="btn-cancel col-delete-btn" onClick={() => setDeleteConfirm({ type: 'col', id: colModal, nome: colForm.name })}>
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

      {/* Modal de confirmação de exclusão (linha ou coluna) */}
      {deleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="modal">
            <div className="modal-title">
              {deleteConfirm.type === 'row' ? 'Excluir registro' : 'Excluir coluna'}
            </div>
            {deleteConfirm.nome && (
              <p className="modal-delete-name">{deleteConfirm.nome}</p>
            )}
            <p className="modal-delete-warn">
              {deleteConfirm.type === 'col'
                ? 'Todos os dados desta coluna em todos os registros serão perdidos.'
                : 'Essa ação não pode ser desfeita.'}
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => {
                if (deleteConfirm.type === 'row') removeRow(deleteConfirm.id)
                else removeColumn(deleteConfirm.id)
                setDeleteConfirm(null)
              }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
