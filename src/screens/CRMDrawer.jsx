import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconClose, IconArrowRight, IconPlus } from '../components/Icons.jsx'
import { SelectDropdown } from '../components/SelectDropdown.jsx'
import { DatePicker } from '../components/DatePicker.jsx'
import { calcularPrecificacao } from '../hooks/usePrecificacaoCalculo.js'
import './CRMDrawer.css'

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtMoney(v) {
  const n = Number(v) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// Total de horas e valor final não são colunas — são sempre calculados na
// hora a partir de etapas/tarefas/subtarefas + custos extras (mesma lógica
// de src/hooks/usePrecificacaoCalculo.js). Aqui é uma lista pequena (só as
// precificações vinculadas a este registro do CRM), então buscar a árvore
// de cada uma por request é aceitável.
async function carregarCalculoPrecificacao(precificacaoId, cabecalho) {
  const [etapasRes, custosRes] = await Promise.all([
    supabase.from('precificacao_etapas').select('id').eq('precificacao_id', precificacaoId),
    supabase.from('precificacao_custos_extras').select('valor_estimado').eq('precificacao_id', precificacaoId),
  ])
  const etapaIds = (etapasRes.data || []).map((e) => e.id)

  let tarefas = []
  if (etapaIds.length) {
    const { data } = await supabase.from('precificacao_tarefas').select('id, horas_estimadas_soltas').in('etapa_id', etapaIds)
    tarefas = data || []
  }
  const tarefaIds = tarefas.map((t) => t.id)

  let subtarefas = []
  if (tarefaIds.length) {
    const { data } = await supabase.from('precificacao_subtarefas').select('tarefa_id, horas_estimadas').in('tarefa_id', tarefaIds)
    subtarefas = data || []
  }

  return calcularPrecificacao({
    etapas: [{
      tarefas: tarefas.map((t) => ({
        horas_estimadas_soltas: t.horas_estimadas_soltas || 0,
        subtarefas: subtarefas.filter((s) => s.tarefa_id === t.id).map((s) => ({ horas_estimadas: s.horas_estimadas || 0 })),
      })),
    }],
    custos_extras: (custosRes.data || []).map((c) => ({ valor_estimado: c.valor_estimado || 0 })),
    valor_hora: cabecalho.valor_hora || 0,
    margem_pct: cabecalho.margem_pct || 0,
    nf_pct: cabecalho.nf_pct || 0,
    nf_ativo: cabecalho.nf_ativo || false,
  })
}

function ClientField({ col, value, onChange, clientes, activeEmpresaId, onClientCreate, autoFocus }) {
  const [inputVal, setInputVal] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setInputVal(value || '') }, [value])
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

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
    if (!supabaseReady || !activeEmpresaId) { selectClient(nome); return }
    setCreating(true)
    const { data, error } = await supabase
      .from('clientes')
      .insert({ empresa_id: activeEmpresaId, nome })
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
          ref={inputRef}
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

function DrawerField({ col, value, onChange, onAddOption, clientes, activeEmpresaId, onClientCreate, autoFocus }) {
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
        <DatePicker
          value={value || ''}
          onChange={v => commit(v)}
          className="dp-field"
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
    return <ClientField col={col} value={value} onChange={onChange} clientes={clientes} activeEmpresaId={activeEmpresaId} onClientCreate={onClientCreate} autoFocus={autoFocus} />
  }

  // ── tags: delegado ao componente separado ──
  if (col.type === 'tags') return <TagsField col={col} value={value} onChange={onChange} />

  // ── select ──
  if (col.type === 'select') {
    return (
      <div className="dr-field">
        <label className="dr-label">{col.name}</label>
        <SelectDropdown
          col={col}
          value={value || ''}
          onChange={v => onChange(col, v)}
          onEditOptions={onAddOption}
          variant="field"
        />
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

export default function CRMDrawer({ row, columns, onClose, onSave, onUpdateCell, onAddOption, onDelete, clientes, user, activeEmpresaId, onClientCreate, isNew }) {
  const navigate = useNavigate()
  const [comments, setComments] = useState([])
  const [commentLoading, setCommentLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [precificacoes, setPrecificacoes] = useState([])
  const [precifLoading, setPrecifLoading] = useState(false)
  const [criandoPrecif, setCriandoPrecif] = useState(false)
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
    if (!supabaseReady || !row?.id || isNew || row.id.startsWith('r')) { setComments([]); return }
    setCommentLoading(true)
    supabase
      .from('oportunidade_comentarios')
      .select('id, texto, created_at, usuario:usuarios(nome)')
      .eq('linha_id', row.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setComments(data || []); setCommentLoading(false) })
  }, [row?.id])

  // Busca precificações vinculadas a esse registro do CRM (com o cálculo
  // de cada uma, já que total de horas e valor não são persistidos)
  useEffect(() => {
    if (!supabaseReady || !row?.id || isNew || row.id.startsWith('r')) { setPrecificacoes([]); return }
    setPrecifLoading(true)
    supabase
      .from('precificacoes')
      .select('id, nome, valor_hora, margem_pct, nf_pct, nf_ativo')
      .eq('crm_linha_id', row.id)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const lista = data || []
        const comCalculo = await Promise.all(lista.map(async (p) => {
          const calc = await carregarCalculoPrecificacao(p.id, p)
          return { id: p.id, nome: p.nome, totalHoras: calc.totalHoras, valorFinal: calc.valorFinal }
        }))
        setPrecificacoes(comCalculo)
        setPrecifLoading(false)
      })
  }, [row?.id])

  async function novaPrecificacao() {
    if (!supabaseReady || !activeEmpresaId) return
    setCriandoPrecif(true)
    const { data, error } = await supabase
      .from('precificacoes')
      .insert({ empresa_id: activeEmpresaId, crm_linha_id: row.id, nome: 'Nova precificação', status: 'orcamento' })
      .select('id')
      .single()
    setCriandoPrecif(false)
    if (error || !data) return
    navigate(`/precificacao/${data.id}?origem=crm&linha_id=${row.id}`)
  }

  // Drawer abre sempre com o scroll no topo (não no fim, por causa dos comentários)
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [row?.id])

  function scrollCommentsToBottom() {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
  }

  async function addComment() {
    const texto = newComment.trim()
    if (!texto) return
    if (!supabaseReady || !user?.id) {
      setComments(prev => [...prev, { id: Date.now(), texto, created_at: new Date().toISOString(), usuario: { nome: user?.nome || 'Você' } }])
      setNewComment('')
      scrollCommentsToBottom()
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
      scrollCommentsToBottom()
    }
  }

  function handleDelete() {
    setConfirmDelete(true)
  }

  return createPortal(
    <>
      {confirmDelete && (
        <div className="modal-overlay" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(false) }}>
          <div className="modal">
            <div className="modal-title">Excluir registro</div>
            <p className="modal-delete-name">{titulo}</p>
            <p className="modal-delete-warn">Essa ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="btn-danger" onClick={() => { onDelete(); setConfirmDelete(false) }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="crm-drawer" role="dialog" aria-modal="true" aria-label={titulo}>

        {/* Header fixo */}
        <div className="dr-header">
          <button className="dr-back-btn" onClick={onClose} aria-label="Voltar">
            <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="dr-title">{titulo}</div>
          <button className="dr-delete-btn" onClick={handleDelete} aria-label="Excluir registro" title="Excluir registro">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
          </button>
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
                activeEmpresaId={activeEmpresaId}
                onClientCreate={onClientCreate}
                autoFocus={isNew && col.slug === 'cliente'}
              />
            ))}
          </div>

          {/* Histórico — não faz sentido antes do registro existir no banco */}
          {!isNew && (
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
          )}

          {/* Precificações — vinculadas a esse registro do CRM */}
          {!isNew && (
            <div className="dr-precif-section">
              <div className="dr-section-title">Precificações</div>
              {precifLoading && <div className="dr-comment-empty">Carregando…</div>}
              {!precifLoading && precificacoes.length === 0 && (
                <div className="dr-comment-empty">Nenhuma precificação ainda.</div>
              )}
              {!precifLoading && precificacoes.map((p) => (
                <div className="dr-precif-item" key={p.id}>
                  <div className="dr-precif-info">
                    <span className="dr-precif-nome">{p.nome}</span>
                    <span className="dr-precif-meta">{p.totalHoras ? `${p.totalHoras}h` : '—'} · {fmtMoney(p.valorFinal)}</span>
                  </div>
                  <button className="dr-precif-abrir" onClick={() => navigate(`/precificacao/${p.id}?origem=crm&linha_id=${row.id}`)}>
                    Abrir <IconArrowRight />
                  </button>
                </div>
              ))}
              <button className="dr-precif-nova" onClick={novaPrecificacao} disabled={criandoPrecif}>
                <IconPlus /> {criandoPrecif ? 'Criando…' : 'Nova precificação'}
              </button>
            </div>
          )}

          {/* Excluir — discreto, ao final do conteúdo rolável (mobile) */}
          <button className="dr-delete-inline" onClick={handleDelete} type="button">
            {isNew ? 'Descartar registro' : 'Excluir registro'}
          </button>

        </div>

        {/* Footer fixo — adicionar comentário */}
        {!isNew && (
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
        )}

        {/* Botão salvar — fixo no rodapé (mobile) */}
        <div className="dr-save-footer">
          <button className="btn-primary dr-save-btn" onClick={onSave} type="button">Salvar</button>
        </div>
      </div>
    </>,
    document.body
  )
}
