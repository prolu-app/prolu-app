import { useState, useRef, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { PLANO_TAGS, PLANO_ACOES } from '../data/seed.js'
import { IconPlus, IconCheck, IconGrip, IconTrash } from '../components/Icons.jsx'
import { DatePicker } from '../components/DatePicker.jsx'
import './PlanoPratico.css'

const TAG_COLORS = ['#CBE921', '#FF6B2B', '#3a6ea5', '#8050a0', '#e05454', '#4CAF82', '#e5a020', '#5f5f58']
const STATUS = {
  pend: { label: 'Pendente', cls: 'pill-gray' },
  prog: { label: 'Em andamento', cls: 'pill-blue' },
  done: { label: 'Concluído', cls: 'pill-green' },
}

// Seed inicial de uma empresa nova (primeira vez que abre o Plano Prático).
const DEFAULT_TAGS = [
  { name: 'Estrutura comercial', color: '#3a6ea5' },
  { name: 'Posicionamento', color: '#8050a0' },
  { name: 'Metas e indicadores', color: '#4CAF82' },
]

const DEFAULT_ACOES = [
  { text: 'Começar a usar o CRM para registrar todo pedido de orçamento', tag: 'Estrutura comercial', status: 'pend' },
  { text: 'Criar rotina de atualizar o CRM uma vez por semana', tag: 'Estrutura comercial', status: 'pend' },
  { text: 'Definir o Processo de Atendimento, do primeiro contato à proposta', tag: 'Estrutura comercial', status: 'prog' },
  { text: 'Elaborar apresentação para usar na primeira reunião com o cliente', tag: 'Estrutura comercial', status: 'pend' },
  { text: 'Definir o Perfil de Cliente Ideal do escritório', tag: 'Posicionamento', status: 'pend' },
  { text: 'Produzir conteúdos focados no Cliente Ideal definido', tag: 'Posicionamento', status: 'pend' },
  { text: 'Criar formulário de qualificação para o Instagram', tag: 'Posicionamento', status: 'pend' },
  { text: 'Definir metas de faturamento e número de projetos fechados', tag: 'Metas e indicadores', status: 'pend' },
  { text: 'Revisar indicadores de desempenho a cada trimestre', tag: 'Metas e indicadores', status: 'pend' },
  { text: 'Estudar precificação por horas e definir valor da hora', tag: 'Metas e indicadores', status: 'pend' },
  { text: 'Elaborar proposta usando o Modelo Prolu', tag: 'Estrutura comercial', status: 'pend' },
]

function parseTag(row) {
  return { id: row.id, name: row.nome, color: row.cor }
}

function parseAcao(row) {
  return { id: row.id, text: row.texto, tag: row.tag_id, status: row.status, prazo: row.prazo || '', ordem: row.ordem ?? 0 }
}

function fmtPrazo(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export default function PlanoPratico() {
  const toast = useToast()
  const { user, activeEmpresaId } = useAuth()
  const [tags, setTags] = useState([])
  const [acoes, setAcoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTag, setActiveTag] = useState('all')
  const [activeStatus, setActiveStatus] = useState('all')
  const [menu, setMenu] = useState(null) // { id, x, y }
  const [tagModal, setTagModal] = useState(false)
  const [tagForm, setTagForm] = useState({ name: '', color: TAG_COLORS[0] })
  const lastAddedRef = useRef(null)
  const initial = (user?.nome || 'A').charAt(0).toUpperCase()

  useEffect(() => { carregar() }, [activeEmpresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) {
      setTags(PLANO_TAGS)
      setAcoes(PLANO_ACOES)
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: tagsData, error: tagsErr }, { data: acoesData, error: acoesErr }] = await Promise.all([
      supabase.from('plano_tags').select('*').eq('empresa_id', activeEmpresaId).order('created_at', { ascending: true }),
      supabase.from('plano_acoes').select('*').eq('empresa_id', activeEmpresaId).order('ordem', { ascending: true }),
    ])
    if (tagsErr || acoesErr) { toast('Não foi possível carregar o Plano Prático'); setLoading(false); return }

    if (!acoesData || acoesData.length === 0) {
      await seedPadrao()
      return
    }

    setTags((tagsData || []).map(parseTag))
    setAcoes(acoesData.map(parseAcao))
    setLoading(false)
  }

  async function seedPadrao() {
    const { data: newTags, error: tagErr } = await supabase
      .from('plano_tags')
      .insert(DEFAULT_TAGS.map((t) => ({ empresa_id: activeEmpresaId, nome: t.name, cor: t.color })))
      .select('*')
    if (tagErr) { toast('Não foi possível preparar o Plano Prático'); setLoading(false); return }

    const tagIdByName = Object.fromEntries(newTags.map((t) => [t.nome, t.id]))
    const payload = DEFAULT_ACOES.map((a, i) => ({
      empresa_id: activeEmpresaId,
      tag_id: tagIdByName[a.tag],
      texto: a.text,
      status: a.status,
      ordem: i,
    }))
    const { data: newAcoes, error: acoesErr } = await supabase.from('plano_acoes').insert(payload).select('*')
    if (acoesErr) { toast('Não foi possível preparar o Plano Prático'); setLoading(false); return }

    setTags(newTags.map(parseTag))
    setAcoes(newAcoes.map(parseAcao).sort((a, b) => a.ordem - b.ordem))
    setLoading(false)
  }

  const filtered = acoes.filter((a) => {
    const tagOk = activeTag === 'all' || a.tag === activeTag
    const statusOk = activeStatus === 'all' || a.status === activeStatus
    return tagOk && statusOk
  })

  const doneCount = acoes.filter((a) => a.status === 'done').length
  const pct = acoes.length ? Math.round((doneCount / acoes.length) * 100) : 0
  const circ = 175.9
  const dashoffset = circ - (circ * pct) / 100

  function tagCount(tagId) {
    return acoes.filter((a) => (tagId === 'all' || a.tag === tagId) && (activeStatus === 'all' || a.status === activeStatus)).length
  }

  function persistAcao(id, changes) {
    if (!supabaseReady || !activeEmpresaId) return
    supabase.from('plano_acoes').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if (error) toast('Não foi possível salvar') })
  }

  function toggleDone(id) {
    const atual = acoes.find((a) => a.id === id)
    if (!atual) return
    const novoStatus = atual.status === 'done' ? 'pend' : 'done'
    setAcoes((prev) => prev.map((a) => (a.id === id ? { ...a, status: novoStatus } : a)))
    toast(novoStatus === 'done' ? 'Ação concluída 🎉' : 'Reaberta')
    persistAcao(id, { status: novoStatus })
  }

  function setStatus(id, status) {
    setAcoes((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    setMenu(null)
    toast('Status atualizado')
    persistAcao(id, { status })
  }

  function updateText(id, text) {
    setAcoes((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)))
    persistAcao(id, { texto: text })
  }

  function updatePrazo(id, prazo) {
    setAcoes((prev) => prev.map((a) => (a.id === id ? { ...a, prazo } : a)))
    persistAcao(id, { prazo: prazo || null })
  }

  async function addAction() {
    const tagId = activeTag === 'all' ? tags[0]?.id : activeTag
    if (!supabaseReady || !activeEmpresaId) {
      const id = 'a' + Date.now()
      setAcoes((prev) => [...prev, { id, text: '', tag: tagId, status: 'pend', prazo: '' }])
      setActiveTag(tagId)
      setActiveStatus('all')
      lastAddedRef.current = id
      return
    }
    const { data, error } = await supabase.from('plano_acoes').insert({
      empresa_id: activeEmpresaId, tag_id: tagId, texto: '', status: 'pend', ordem: acoes.length,
    }).select('*').single()
    if (error) { toast('Não foi possível criar a ação'); return }
    setAcoes((prev) => [...prev, parseAcao(data)])
    setActiveTag(tagId)
    setActiveStatus('all')
    lastAddedRef.current = data.id
  }

  async function removeAction(id) {
    setAcoes((prev) => prev.filter((a) => a.id !== id))
    if (!supabaseReady || !activeEmpresaId) return
    const { error } = await supabase.from('plano_acoes').delete().eq('id', id)
    if (error) { toast('Não foi possível excluir'); carregar() }
    else toast('Ação excluída')
  }

  // foca no card recém-criado
  useEffect(() => {
    if (lastAddedRef.current) {
      const el = document.querySelector(`[data-action="${lastAddedRef.current}"] .action-text`)
      if (el) {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
      lastAddedRef.current = null
    }
  })

  async function criarTag() {
    const nome = tagForm.name.trim()
    if (!nome) return
    if (!supabaseReady || !activeEmpresaId) {
      const id = 't' + Date.now()
      setTags((prev) => [...prev, { id, name: nome, color: tagForm.color }])
      setActiveTag(id)
      setTagModal(false)
      setTagForm({ name: '', color: TAG_COLORS[0] })
      toast('Tag criada')
      return
    }
    const { data, error } = await supabase.from('plano_tags').insert({
      empresa_id: activeEmpresaId, nome, cor: tagForm.color,
    }).select('*').single()
    if (error) { toast('Não foi possível criar a tag'); return }
    setTags((prev) => [...prev, parseTag(data)])
    setActiveTag(data.id)
    setTagModal(false)
    setTagForm({ name: '', color: TAG_COLORS[0] })
    toast('Tag criada')
  }

  function openMenu(e, id) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    let x = r.left
    if (x + 200 > window.innerWidth - 12) x = window.innerWidth - 212
    setMenu({ id, x, y: r.bottom + 6 })
  }

  useEffect(() => {
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const tagOf = (id) => tags.find((t) => t.id === id)

  if (loading) return (
    <div className="page-header">
      <div className="page-title">Plano Prático</div>
      <div className="page-sub">Carregando suas ações…</div>
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div className="page-title">Plano Prático</div>
        <div className="page-sub">As ações que tiram a gestão comercial do papel.</div>
      </div>

      {/* progresso */}
      <div className="progress-card">
        <svg className="progress-ring" width="68" height="68" viewBox="0 0 68 68">
          <circle cx="34" cy="34" r="28" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
          <circle cx="34" cy="34" r="28" fill="none" stroke="#CBE921" strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={dashoffset} transform="rotate(-90 34 34)" style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
          <text x="34" y="39" textAnchor="middle" fill="white" fontFamily="Abhaya Libre, serif" fontSize="16" fontWeight="600">{pct}%</text>
        </svg>
        <div className="progress-text">
          <div className="progress-label">Progresso geral</div>
          <div className="progress-value"><span>{doneCount}</span> de {acoes.length} ações concluídas</div>
          <div className="progress-sub">Continue — cada ação concluída te aproxima de vender com consistência.</div>
        </div>
      </div>

      {/* toolbar: tags */}
      <div className="toolbar">
        <div className="tags-scroll">
          <button className={`tag-chip ${activeTag === 'all' ? 'active' : 'inactive'}`} onClick={() => setActiveTag('all')}>
            Todas <span className="tag-count">{tagCount('all')}</span>
          </button>
          {tags.map((t) => (
            <button key={t.id} className={`tag-chip ${activeTag === t.id ? 'active' : 'inactive'}`} onClick={() => setActiveTag(t.id)}>
              <span className="tag-dot" style={{ background: t.color }} />
              {t.name}
              <span className="tag-count">{tagCount(t.id)}</span>
            </button>
          ))}
        </div>
        <button className="btn-new-tag" onClick={() => setTagModal(true)}><IconPlus /> Nova tag</button>
        <button className="btn-primary plano-new-btn" onClick={addAction}><IconPlus /> Nova ação</button>
      </div>

      {/* filtro status */}
      <div className="filter-bar">
        {[['all', 'Todas', null], ['pend', 'Pendente', 'var(--ink-40)'], ['prog', 'Em andamento', 'var(--blue-ink)'], ['done', 'Concluído', 'var(--green-deep)']].map(([f, lbl, dot]) => (
          <button key={f} className={`status-filter${activeStatus === f ? ' active' : ''}`} onClick={() => setActiveStatus(f)}>
            {dot && <span className="dot" style={{ background: dot }} />}{lbl}
          </button>
        ))}
        <span className="filter-count"><strong>{filtered.length}</strong> de {acoes.length}</span>
      </div>

      {/* lista */}
      <div className="action-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <IconCheck style={{ width: 40, height: 40, stroke: 'var(--ink-40)', strokeWidth: 1.5, fill: 'none' }} />
            <p>Nenhuma ação com esses filtros.<br />Crie uma nova ou mude os filtros.</p>
          </div>
        ) : filtered.map((a) => {
          const tag = tagOf(a.tag)
          const st = STATUS[a.status]
          return (
            <div className={`action-card${a.status === 'done' ? ' done' : ''}`} data-action={a.id} key={a.id}>
              <div className={`checkbox${a.status === 'done' ? ' checked' : ''}`} onClick={() => toggleDone(a.id)}>
                <IconCheck />
              </div>
              <div className="action-body">
                <div
                  className="action-text"
                  contentEditable
                  suppressContentEditableWarning
                  data-ph="Descreva a ação…"
                  onBlur={(e) => updateText(a.id, e.currentTarget.textContent)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
                >{a.text}</div>
                <DatePicker
                  value={a.prazo || ''}
                  onChange={(iso) => updatePrazo(a.id, iso)}
                  placeholder="+ Definir prazo"
                  className={`dp-plano${a.prazo ? '' : ' dp-plano-empty'}`}
                  renderValue={(v) => v ? `Prazo: ${fmtPrazo(v)}` : <span className="dp-placeholder">+ Definir prazo</span>}
                />
                <div className="action-meta">
                  <span className={`pill ${st.cls} sp-click`} onClick={(e) => openMenu(e, a.id)}><span className="dot" />{st.label}</span>
                  {tag && <span className="tag-pill"><span className="d" style={{ background: tag.color }} />{tag.name}</span>}
                  <span className="resp-pill"><span className="resp-avatar">{initial}</span>{(user?.nome || 'André').split(' ')[0]}</span>
                </div>
              </div>
              <button className="action-del" onClick={() => removeAction(a.id)} aria-label="Excluir ação"><IconTrash /></button>
              <div className="action-drag"><IconGrip /></div>
            </div>
          )
        })}
      </div>

      <button className="fab" onClick={addAction} aria-label="Nova ação"><IconPlus /></button>

      {/* dropdown status */}
      {menu && (
        <div className="status-menu open" style={{ top: menu.y, left: menu.x }} onClick={(e) => e.stopPropagation()}>
          {Object.entries(STATUS).map(([key, s]) => (
            <button key={key} className="menu-item" onClick={() => setStatus(menu.id, key)}>
              <span className={`pill ${s.cls}`}><span className="dot" />{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* modal nova tag */}
      {tagModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTagModal(false) }}>
          <div className="modal">
            <div className="modal-title">Nova tag</div>
            <div className="modal-field">
              <label className="modal-label">Nome da tag</label>
              <input className="modal-input" value={tagForm.name} onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') criarTag() }} placeholder="Ex: Conteúdo, Proposta, Financeiro…" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Cor</label>
              <div className="color-picks">
                {TAG_COLORS.map((c) => (
                  <div key={c} className={`color-pick${tagForm.color === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setTagForm({ ...tagForm, color: c })} />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setTagModal(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criarTag}>Criar tag</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
