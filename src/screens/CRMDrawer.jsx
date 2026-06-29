import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconClose } from '../components/Icons.jsx'
import './CRMDrawer.css'

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function ClientField({ col, value, onChange, clientes, user, onClientCreate }) {
  const [inputVal, setInputVal] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => { setInputVal(value || '') }, [value])

  const suggestions = useMemo(() => {
    const q = inputVal.trim().toLowerCase()
    if (!q) return []
    return (clientes || []).filter(c => c.nome.toLowerCase().includes(q))
  }, [inputVal, clientes])

  function selectClient(nome) {
    setInputVal(nome)
    setOpen(false)
    onChange(col, nome)
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
    <div className="dr-field dr-field-wide" ref={wrapRef}>
      <label className="dr-label">{col.name}</label>
      <div className="dr-client-wrap">
        <input
          className="dr-input"
          value={inputVal}
          placeholder="Nome do cliente…"
          onChange={e => { setInputVal(e.target.value); setOpen(e.target.value.length > 0) }}
          onBlur={() => { setTimeout(() => setOpen(false), 120); onChange(col, inputVal.trim() || null) }}
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
    </div>
  )
}

function TagsField({ col, value, onChange }) {
  const tags = Array.isArray(value) ? value : []
  const [tagInput, setTagInput] = useState('')

  function addTag() {
    const v = tagInput.trim()
    if (!v || tags.includes(v)) { setTagInput(''); return }
    onChange(col, [...tags, v])
    setTagInput('')
  }

  return (
    <div className="dr-field dr-field-wide">
      <label className="dr-label">{col.name}</label>
      <div className="dr-tags-wrap">
        {tags.map(t => (
          <span className="tag-chip" key={t}>
            {t}
            <button className="tag-remove" onClick={() => onChange(col, tags.filter(x => x !== t))} type="button">
              <IconClose />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
          onBlur={addTag}
          placeholder="Adicionar tag…"
        />
      </div>
    </div>
  )
}

function DrawerField({ col, value, onChange, onAddOption, clientes, user, onClientCreate }) {
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => { setLocalVal(value ?? '') }, [value])

  function commit(v) {
    const parsed = col.type === 'money' || col.type === 'number' ? (v === '' ? null : Number(String(v).replace(/\D/g, '')) || null) : v
    if (parsed !== value) onChange(col, parsed)
  }

  // ── date ──
  if (col.type === 'date') {
    return (
      <div className="dr-field">
        <label className="dr-label">{col.name}</label>
        <input
          className="dr-input"
          type="date"
          value={localVal || ''}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={e => commit(e.target.value)}
        />
      </div>
    )
  }

  // ── money ──
  if (col.type === 'money') {
    return (
      <div className="dr-field">
        <label className="dr-label">{col.name}</label>
        <input
          className="dr-input"
          type="number"
          min="0"
          step="100"
          value={localVal ?? ''}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={e => commit(e.target.value)}
          placeholder="R$ 0"
        />
      </div>
    )
  }

  // ── client: delegado ao componente dedicado ──
  if (col.type === 'client') {
    return <ClientField col={col} value={value} onChange={onChange} clientes={clientes} user={user} onClientCreate={onClientCreate} />
  }

  // ── tags: delegado ao componente separado ──
  if (col.type === 'tags') return <TagsField col={col} value={value} onChange={onChange} />

  // ── select ──
  if (col.type === 'select') {
    const opts = col.options || []
    return (
      <div className="dr-field">
        <label className="dr-label">{col.name}</label>
        <div className="dr-select-wrap">
          <select
            className="dr-select"
            value={localVal}
            onChange={e => { setLocalVal(e.target.value); onChange(col, e.target.value) }}
          >
            <option value="">—</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
          </select>
          {col.editableOptions && (
            <button className="dr-select-add" type="button" onClick={() => onAddOption(col)} title="Editar lista de opções">
              <svg viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── text / number ──
  return (
    <div className="dr-field">
      <label className="dr-label">{col.name}</label>
      <input
        className="dr-input"
        type={col.type === 'number' ? 'number' : 'text'}
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={e => commit(e.target.value)}
        placeholder="—"
      />
    </div>
  )
}

export default function CRMDrawer({ row, columns, onClose, onUpdateCell, onAddOption, onDelete, clientes, user, onClientCreate }) {
  const [comments, setComments] = useState([])
  const [commentLoading, setCommentLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const listRef = useRef(null)

  const clienteCol = columns.find(c => c.slug === 'cliente')
  const titulo = (clienteCol ? row[clienteCol.id] : null) || 'Sem nome'

  // Escape fecha o drawer
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Busca comentários
  useEffect(() => {
    if (!supabaseReady || !row?.id || row.id.startsWith('r')) { setComments([]); return }
    setCommentLoading(true)
    supabase
      .from('oportunidade_comentarios')
      .select('id, texto, created_at, usuario:usuarios(nome)')
      .eq('linha_id', row.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setComments(data || []); setCommentLoading(false) })
  }, [row?.id])

  // Scroll ao fundo quando comentários carregam
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [comments.length])

  async function addComment() {
    const texto = newComment.trim()
    if (!texto) return
    if (!supabaseReady || !user?.id) {
      setComments(prev => [...prev, { id: Date.now(), texto, created_at: new Date().toISOString(), usuario: { nome: user?.nome || 'Você' } }])
      setNewComment('')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('oportunidade_comentarios')
      .insert({ linha_id: row.id, usuario_id: user.id, texto })
      .select('id, texto, created_at, usuario:usuarios(nome)')
      .single()
    setSaving(false)
    if (!error && data) {
      setComments(prev => [...prev, data])
      setNewComment('')
    }
  }

  function handleDelete() {
    if (!window.confirm('Excluir esta oportunidade?')) return
    onDelete()
  }

  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="crm-drawer" role="dialog" aria-modal="true" aria-label={titulo}>

        {/* Header fixo */}
        <div className="dr-header">
          <button className="dr-back-btn" onClick={onClose} aria-label="Voltar">
            <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="dr-title">{titulo}</div>
        </div>

        {/* Corpo rolável */}
        <div className="dr-body" ref={listRef}>

          {/* Grid de campos */}
          <div className="dr-fields-grid">
            {columns.map(col => (
              <DrawerField
                key={col.id}
                col={col}
                value={row[col.id]}
                onChange={onUpdateCell}
                onAddOption={onAddOption}
                clientes={clientes}
                user={user}
                onClientCreate={onClientCreate}
              />
            ))}
          </div>

          {/* Histórico */}
          <div className="dr-history-section">
            <div className="dr-section-title">Histórico</div>
            {commentLoading && <div className="dr-comment-empty">Carregando…</div>}
            {!commentLoading && comments.length === 0 && (
              <div className="dr-comment-empty">Nenhum comentário ainda.</div>
            )}
            {comments.map(c => (
              <div className="dr-comment" key={c.id}>
                <div className="dr-comment-meta">
                  <span className="dr-comment-user">{c.usuario?.nome || 'Usuário'}</span>
                  <span className="dr-comment-date">{fmtDateTime(c.created_at)}</span>
                </div>
                <div className="dr-comment-text">{c.texto}</div>
              </div>
            ))}
          </div>

          {/* Excluir */}
          <button className="dr-delete-text-btn" onClick={handleDelete}>
            Excluir este registro
          </button>
        </div>

        {/* Footer fixo — adicionar comentário */}
        <div className="dr-form-footer">
          <textarea
            className="dr-comment-input"
            placeholder="Adicionar comentário…"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComment() } }}
            rows={2}
          />
          <button className="dr-comment-btn" onClick={addComment} disabled={saving || !newComment.trim()}>
            {saving ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
