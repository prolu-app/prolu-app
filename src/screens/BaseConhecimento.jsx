import { useState, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { FOLDERS } from '../data/seed.js'
import {
  IconPlus, IconCheck, IconClose, IconBack, IconPlay, IconChevronDown,
  IconChevronLeft, IconChevronRight, IconEdit, IconTrash, IconBase, IconPdf,
} from '../components/Icons.jsx'
import './BaseConhecimento.css'

const COVER_CLASS = { green: 'cover-green', blue: 'cover-blue', orange: 'cover-orange' }

function getYouTubeEmbed(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function buildPastas(pastasData, modulosData, aulasData, pdfsData, progressoData) {
  const doneSet = new Set((progressoData || []).filter(p => p.concluida).map(p => p.aula_id))

  const pdfsByAula = {}
  ;(pdfsData || []).forEach(p => {
    if (!pdfsByAula[p.aula_id]) pdfsByAula[p.aula_id] = []
    pdfsByAula[p.aula_id].push({ id: p.id, nome: p.nome, url: p.arquivo_url })
  })

  const aulasByModulo = {}
  ;(aulasData || []).forEach(a => {
    if (!aulasByModulo[a.modulo_id]) aulasByModulo[a.modulo_id] = []
    aulasByModulo[a.modulo_id].push({
      id: a.id,
      title: a.titulo,
      desc: a.descricao || '',
      url: a.youtube_url || '',
      ordem: a.ordem || 0,
      done: doneSet.has(a.id),
      pdfs: pdfsByAula[a.id] || [],
    })
  })

  const modulosByPasta = {}
  ;(modulosData || []).forEach(m => {
    if (!modulosByPasta[m.pasta_id]) modulosByPasta[m.pasta_id] = []
    modulosByPasta[m.pasta_id].push({
      id: m.id,
      title: m.titulo,
      ordem: m.ordem || 0,
      lessons: (aulasByModulo[m.id] || []).sort((a, b) => a.ordem - b.ordem),
    })
  })

  return (pastasData || [])
    .map(p => ({
      id: p.id,
      title: p.titulo,
      sub: p.subtitulo || '',
      cover: p.cor_capa || 'green',
      ordem: p.ordem || 0,
      modules: (modulosByPasta[p.id] || []).sort((a, b) => a.ordem - b.ordem),
    }))
    .sort((a, b) => a.ordem - b.ordem)
}

export default function BaseConhecimento() {
  const toast = useToast()
  const { isProluAdmin, user } = useAuth()

  const [pastas, setPastas] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPastaId, setCurrentPastaId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [player, setPlayer] = useState(null)

  // pastaModal: null | 'new' | pastaId (editando)
  const [pastaModal, setPastaModal] = useState(null)
  // moduloModal: null | { pastaId, moduloId? }
  const [moduloModal, setModuloModal] = useState(null)
  // aulaModal: null | { moduloId, aulaId? }
  const [aulaModal, setAulaModal] = useState(null)
  // deleteModal: null | { type, id, nome, ctx? }
  const [deleteModal, setDeleteModal] = useState(null)

  const [pastaForm, setPastaForm] = useState({ nome: '', subtitulo: '', cor: 'green' })
  const [moduloForm, setModuloForm] = useState('')
  const [aulaForm, setAulaForm] = useState({ titulo: '', descricao: '', youtube_url: '' })

  const pasta = pastas.find(p => p.id === currentPastaId)

  async function carregar() {
    if (!supabaseReady || !user?.id) {
      const seed = FOLDERS.map(f => ({
        id: f.id, title: f.title, sub: f.sub, cover: f.cover, ordem: 0,
        modules: (f.modules || []).map(m => ({
          id: m.id, title: m.title, ordem: 0,
          lessons: (m.lessons || []).map(l => ({ ...l, url: l.url || '', pdfs: l.pdfs || [] })),
        })),
      }))
      setPastas(seed)
      setLoading(false)
      return
    }
    setLoading(true)
    const [
      { data: pastasData },
      { data: modulosData },
      { data: aulasData },
      { data: pdfsData },
      { data: progressoData },
    ] = await Promise.all([
      supabase.from('kb_pastas').select('*').order('ordem'),
      supabase.from('kb_modulos').select('*').order('ordem'),
      supabase.from('kb_aulas').select('*').order('ordem'),
      supabase.from('kb_aula_pdfs').select('*'),
      supabase.from('kb_progresso').select('*').eq('usuario_id', user.id),
    ])
    setPastas(buildPastas(pastasData, modulosData, aulasData, pdfsData, progressoData))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── helpers ──
  const pastaLessons = p => (p?.modules || []).flatMap(m => m.lessons)
  const pastaProgress = p => {
    const all = pastaLessons(p)
    const done = all.filter(l => l.done).length
    return { total: all.length, done, pct: all.length ? Math.round((done / all.length) * 100) : 0 }
  }
  const moduleProgress = m => {
    const done = m.lessons.filter(l => l.done).length
    return { pct: m.lessons.length ? Math.round((done / m.lessons.length) * 100) : 0 }
  }
  function findLesson(id) {
    for (const m of (pasta?.modules || [])) {
      const l = m.lessons.find(x => x.id === id)
      if (l) return l
    }
    return null
  }

  // ── toggle concluída ──
  async function toggleLessonDone(lessonId) {
    const l = findLesson(lessonId)
    const newDone = !l?.done
    setPastas(prev => prev.map(p => p.id !== currentPastaId ? p : {
      ...p,
      modules: p.modules.map(m => ({
        ...m, lessons: m.lessons.map(x => x.id === lessonId ? { ...x, done: newDone } : x),
      })),
    }))
    toast(newDone ? 'Aula concluída 🎉' : 'Reaberta')
    if (!supabaseReady || !user?.id) return
    await supabase.from('kb_progresso').upsert(
      { usuario_id: user.id, aula_id: lessonId, concluida: newDone, concluida_em: newDone ? new Date().toISOString() : null },
      { onConflict: 'usuario_id,aula_id' },
    )
  }

  function navLesson(dir) {
    const all = pastaLessons(pasta)
    const idx = all.findIndex(l => l.id === player)
    const next = all[idx + dir]
    if (next) setPlayer(next.id)
  }

  // ── CRUD pastas ──
  function openNewPasta() { setPastaForm({ nome: '', subtitulo: '', cor: 'green' }); setPastaModal('new') }
  function openEditPasta(p) { setPastaForm({ nome: p.title, subtitulo: p.sub, cor: p.cover }); setPastaModal(p.id) }

  async function savePasta() {
    const { nome, subtitulo, cor } = pastaForm
    if (!nome.trim()) return
    const editing = pastaModal !== 'new'
    if (!supabaseReady || !user?.id) {
      if (editing) {
        setPastas(prev => prev.map(p => p.id !== pastaModal ? p : { ...p, title: nome.trim(), sub: subtitulo.trim(), cover: cor }))
      } else {
        setPastas(prev => [...prev, { id: 'p' + Date.now(), title: nome.trim(), sub: subtitulo.trim(), cover: cor, ordem: prev.length, modules: [] }])
      }
      setPastaModal(null)
      toast(editing ? 'Pasta atualizada' : 'Pasta criada')
      return
    }
    if (editing) {
      const { error } = await supabase.from('kb_pastas').update({ titulo: nome.trim(), subtitulo: subtitulo.trim(), cor_capa: cor }).eq('id', pastaModal)
      if (error) { toast('Erro ao salvar'); return }
      setPastas(prev => prev.map(p => p.id !== pastaModal ? p : { ...p, title: nome.trim(), sub: subtitulo.trim(), cover: cor }))
      toast('Pasta atualizada')
    } else {
      const { data, error } = await supabase.from('kb_pastas')
        .insert({ titulo: nome.trim(), subtitulo: subtitulo.trim(), cor_capa: cor, ordem: pastas.length })
        .select('*').single()
      if (error) { toast('Erro ao criar pasta'); return }
      setPastas(prev => [...prev, { id: data.id, title: data.titulo, sub: data.subtitulo || '', cover: data.cor_capa, ordem: data.ordem, modules: [] }])
      toast('Pasta criada')
    }
    setPastaModal(null)
  }

  // ── CRUD módulos ──
  function openNewModulo(pastaId) { setModuloForm(''); setModuloModal({ pastaId }) }
  function openEditModulo(pastaId, modulo) { setModuloForm(modulo.title); setModuloModal({ pastaId, moduloId: modulo.id }) }

  async function saveModulo() {
    const titulo = moduloForm.trim()
    if (!titulo) return
    const { pastaId, moduloId } = moduloModal
    const editing = Boolean(moduloId)
    const p = pastas.find(x => x.id === pastaId)
    if (!supabaseReady || !user?.id) {
      if (editing) {
        setPastas(prev => prev.map(pa => pa.id !== pastaId ? pa : {
          ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : { ...m, title: titulo }),
        }))
      } else {
        setPastas(prev => prev.map(pa => pa.id !== pastaId ? pa : {
          ...pa, modules: [...pa.modules, { id: 'm' + Date.now(), title: titulo, ordem: pa.modules.length, lessons: [] }],
        }))
      }
      setModuloModal(null)
      toast(editing ? 'Módulo atualizado' : 'Módulo criado')
      return
    }
    if (editing) {
      const { error } = await supabase.from('kb_modulos').update({ titulo }).eq('id', moduloId)
      if (error) { toast('Erro ao salvar'); return }
      setPastas(prev => prev.map(pa => pa.id !== pastaId ? pa : {
        ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : { ...m, title: titulo }),
      }))
      toast('Módulo atualizado')
    } else {
      const ordem = p ? p.modules.length : 0
      const { data, error } = await supabase.from('kb_modulos').insert({ pasta_id: pastaId, titulo, ordem }).select('*').single()
      if (error) { toast('Erro ao criar módulo'); return }
      setPastas(prev => prev.map(pa => pa.id !== pastaId ? pa : {
        ...pa, modules: [...pa.modules, { id: data.id, title: data.titulo, ordem: data.ordem, lessons: [] }],
      }))
      toast('Módulo criado')
    }
    setModuloModal(null)
  }

  // ── CRUD aulas ──
  function openNewAula(moduloId) { setAulaForm({ titulo: '', descricao: '', youtube_url: '' }); setAulaModal({ moduloId }) }
  function openEditAula(moduloId, aula) { setAulaForm({ titulo: aula.title, descricao: aula.desc, youtube_url: aula.url }); setAulaModal({ moduloId, aulaId: aula.id }) }

  async function saveAula() {
    const { titulo, descricao, youtube_url } = aulaForm
    if (!titulo.trim()) return
    const { moduloId, aulaId } = aulaModal
    const editing = Boolean(aulaId)
    if (!supabaseReady || !user?.id) {
      if (editing) {
        setPastas(prev => prev.map(pa => ({
          ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
            ...m, lessons: m.lessons.map(l => l.id !== aulaId ? l : { ...l, title: titulo.trim(), desc: descricao.trim(), url: youtube_url.trim() }),
          }),
        })))
      } else {
        setPastas(prev => prev.map(pa => ({
          ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
            ...m, lessons: [...m.lessons, { id: 'l' + Date.now(), title: titulo.trim(), desc: descricao.trim(), url: youtube_url.trim(), done: false, pdfs: [], ordem: m.lessons.length }],
          }),
        })))
      }
      setAulaModal(null)
      toast(editing ? 'Aula atualizada' : 'Aula criada')
      return
    }
    if (editing) {
      const { error } = await supabase.from('kb_aulas').update({ titulo: titulo.trim(), descricao: descricao.trim(), youtube_url: youtube_url.trim() }).eq('id', aulaId)
      if (error) { toast('Erro ao salvar'); return }
      setPastas(prev => prev.map(pa => ({
        ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
          ...m, lessons: m.lessons.map(l => l.id !== aulaId ? l : { ...l, title: titulo.trim(), desc: descricao.trim(), url: youtube_url.trim() }),
        }),
      })))
      toast('Aula atualizada')
    } else {
      let ordem = 0
      for (const pa of pastas) {
        const m = pa.modules.find(x => x.id === moduloId)
        if (m) { ordem = m.lessons.length; break }
      }
      const { data, error } = await supabase.from('kb_aulas')
        .insert({ modulo_id: moduloId, titulo: titulo.trim(), descricao: descricao.trim(), youtube_url: youtube_url.trim(), ordem })
        .select('*').single()
      if (error) { toast('Erro ao criar aula'); return }
      setPastas(prev => prev.map(pa => ({
        ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
          ...m, lessons: [...m.lessons, { id: data.id, title: data.titulo, desc: data.descricao || '', url: data.youtube_url || '', done: false, pdfs: [], ordem: data.ordem }],
        }),
      })))
      toast('Aula criada')
    }
    setAulaModal(null)
  }

  // ── deletar ──
  async function confirmDelete() {
    const { type, id, ctx } = deleteModal
    if (type === 'pasta') {
      setPastas(prev => prev.filter(p => p.id !== id))
      if (currentPastaId === id) setCurrentPastaId(null)
      if (supabaseReady && user?.id) await supabase.from('kb_pastas').delete().eq('id', id)
      toast('Pasta excluída')
    } else if (type === 'modulo') {
      setPastas(prev => prev.map(pa => pa.id !== ctx.pastaId ? pa : { ...pa, modules: pa.modules.filter(m => m.id !== id) }))
      if (supabaseReady && user?.id) await supabase.from('kb_modulos').delete().eq('id', id)
      toast('Módulo excluído')
    } else if (type === 'aula') {
      setPastas(prev => prev.map(pa => ({
        ...pa, modules: pa.modules.map(m => m.id !== ctx.moduloId ? m : { ...m, lessons: m.lessons.filter(l => l.id !== id) }),
      })))
      if (supabaseReady && user?.id) await supabase.from('kb_aulas').delete().eq('id', id)
      toast('Aula excluída')
    }
    setDeleteModal(null)
  }

  const playerLesson = player ? findLesson(player) : null
  const embedUrl = playerLesson ? getYouTubeEmbed(playerLesson.url) : null

  if (loading) return <div className="crm-empty">Carregando…</div>

  // ════════ VIEW: PASTAS ════════
  if (!pasta) {
    return (
      <>
        <div className="page-header between">
          <div>
            <div className="page-title">Base de Conhecimento</div>
            <div className="page-sub">Tudo que você precisa aprender, organizado por curso.</div>
          </div>
          {isProluAdmin && <button className="btn-primary kb-new-btn" onClick={openNewPasta}><IconPlus /> Nova pasta</button>}
        </div>

        <div className="folders-grid">
          {pastas.map(p => {
            const prog = pastaProgress(p)
            return (
              <div className="folder-card" key={p.id} onClick={() => setCurrentPastaId(p.id)}>
                <div className={`folder-cover ${COVER_CLASS[p.cover] || 'cover-green'}`}>
                  <div className="folder-icon"><IconBase /></div>
                  <div className="folder-cover-end">
                    {isProluAdmin && (
                      <div className="folder-admin-actions" onClick={e => e.stopPropagation()}>
                        <button className="folder-admin-btn" onClick={() => openEditPasta(p)} title="Editar pasta"><IconEdit /></button>
                        <button className="folder-admin-btn" onClick={() => setDeleteModal({ type: 'pasta', id: p.id, nome: p.title })} title="Excluir pasta"><IconTrash /></button>
                      </div>
                    )}
                    <div className="folder-count">{p.modules.length} módulos</div>
                  </div>
                </div>
                <div className="folder-body">
                  <div className="folder-title">{p.title}</div>
                  <div className="folder-sub">{p.sub}</div>
                  <div className="folder-progress">
                    <div className="folder-progress-head">
                      <span><strong>{prog.done}</strong> de {prog.total} aulas</span>
                      <span>{prog.pct}%</span>
                    </div>
                    <div className="folder-progress-track"><div className="folder-progress-fill" style={{ width: `${prog.pct}%` }} /></div>
                  </div>
                </div>
              </div>
            )
          })}
          {isProluAdmin && (
            <div className="folder-card-add" onClick={openNewPasta}>
              <IconPlus /> Nova pasta
            </div>
          )}
        </div>

        {pastaModal && (
          <PastaModal form={pastaForm} setForm={setPastaForm} editing={pastaModal !== 'new'} onClose={() => setPastaModal(null)} onConfirm={savePasta} />
        )}
        {deleteModal && (
          <DeleteModal {...deleteModal} onClose={() => setDeleteModal(null)} onConfirm={confirmDelete} />
        )}
      </>
    )
  }

  // ════════ VIEW: DENTRO DA PASTA ════════
  const prog = pastaProgress(pasta)
  const circ = 150.8
  const dashoffset = circ - (circ * prog.pct) / 100
  const nextLesson = pastaLessons(pasta).find(l => !l.done)

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">{pasta.title}</div>
          <div className="page-sub">{pasta.sub}</div>
        </div>
        {isProluAdmin && (
          <button className="btn-primary kb-new-btn" onClick={() => openNewModulo(pasta.id)}>
            <IconPlus /> Novo módulo
          </button>
        )}
      </div>

      <div className="back-link" onClick={() => setCurrentPastaId(null)}><IconBack /> Todas as pastas</div>

      <div className="kb-progress">
        <svg className="kb-progress-ring" width="58" height="58" viewBox="0 0 58 58">
          <circle cx="29" cy="29" r="24" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5.5" />
          <circle cx="29" cy="29" r="24" fill="none" stroke="#CBE921" strokeWidth="5.5" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={dashoffset} transform="rotate(-90 29 29)"
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
          <text x="29" y="34" textAnchor="middle" fill="white" fontFamily="Abhaya Libre, serif" fontSize="13" fontWeight="600">{prog.pct}%</text>
        </svg>
        <div className="kb-progress-text">
          <div className="kb-progress-label">Progresso neste curso</div>
          <div className="kb-progress-val"><span>{prog.done}</span> de {prog.total} aulas assistidas</div>
          <div className="kb-progress-sub">
            {nextLesson ? `Continue de onde parou: ${nextLesson.title}` : 'Você concluiu todas as aulas deste curso 🎉'}
          </div>
        </div>
        {isProluAdmin && (
          <div className="kb-pasta-admin">
            <button className="kb-pasta-admin-btn" onClick={() => openEditPasta(pasta)} title="Editar pasta"><IconEdit /></button>
            <button className="kb-pasta-admin-btn" onClick={() => setDeleteModal({ type: 'pasta', id: pasta.id, nome: pasta.title })} title="Excluir pasta"><IconTrash /></button>
          </div>
        )}
      </div>

      {pasta.modules.map((m, idx) => {
        const mp = moduleProgress(m)
        const isOpen = expanded[m.id] ?? idx === 0
        return (
          <div className={`module-card${isOpen ? ' expanded' : ''}`} key={m.id}>
            <div className="module-head" onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !isOpen }))}>
              <div className="module-number">{String(idx + 1).padStart(2, '0')}</div>
              <div className="module-info">
                <div className="module-title">{m.title}</div>
                <div className="module-meta">{m.lessons.length} aulas</div>
              </div>
              <div className="module-progress-mini">
                <div className="module-progress-track"><div className="module-progress-fill" style={{ width: `${mp.pct}%` }} /></div>
                <span className="module-progress-pct">{mp.pct}%</span>
              </div>
              {isProluAdmin && (
                <div className="module-actions" onClick={e => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => openEditModulo(pasta.id, m)}><IconEdit /></button>
                  <button className="icon-btn" onClick={() => setDeleteModal({ type: 'modulo', id: m.id, nome: m.title, ctx: { pastaId: pasta.id } })}><IconTrash /></button>
                </div>
              )}
              <IconChevronDown className="module-chevron" />
            </div>
            <div className="lessons-list">
              {m.lessons.map(l => (
                <div className="lesson-row" key={l.id} onClick={() => setPlayer(l.id)}>
                  <div className={`lesson-check ${l.done ? 'done' : 'pend'}`}>{l.done && <IconCheck />}</div>
                  <div className="lesson-info">
                    <div className="lesson-title">{l.title}</div>
                    {l.pdfs.length > 0 && <div className="lesson-meta"><span className="lesson-pdf-tag">📎 {l.pdfs.length} PDF</span></div>}
                  </div>
                  {isProluAdmin && (
                    <div className="lesson-admin-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" onClick={() => openEditAula(m.id, l)}><IconEdit /></button>
                      <button className="icon-btn" onClick={() => setDeleteModal({ type: 'aula', id: l.id, nome: l.title, ctx: { moduloId: m.id } })}><IconTrash /></button>
                    </div>
                  )}
                  <div className="lesson-play"><IconPlay /></div>
                </div>
              ))}
              {isProluAdmin && (
                <div className="add-lesson-row" onClick={() => openNewAula(m.id)}>
                  <IconPlus /> Adicionar aula neste módulo
                </div>
              )}
            </div>
          </div>
        )
      })}

      {isProluAdmin && (
        <div className="add-module-row" onClick={() => openNewModulo(pasta.id)}>
          <IconPlus /> Adicionar módulo nesta pasta
        </div>
      )}

      {/* player */}
      {playerLesson && (
        <div className="player-overlay" onClick={e => { if (e.target === e.currentTarget) setPlayer(null) }}>
          <div className="player-modal">
            <div className="player-video">
              <button className="player-close" onClick={() => setPlayer(null)}><IconClose /></button>
              {embedUrl
                ? <iframe src={embedUrl} title={playerLesson.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen style={{ width: '100%', height: '100%', border: 'none' }} />
                : <div className="player-video-fake">
                    <IconPlay style={{ width: 44, height: 44, stroke: 'rgba(255,255,255,.25)', strokeWidth: 1.2, fill: 'none' }} />
                    Player de vídeo (YouTube embed)
                  </div>
              }
            </div>
            <div className="player-body">
              <div className="player-title">{playerLesson.title}</div>
              <div className="player-desc">{playerLesson.desc}</div>
              {playerLesson.pdfs.length > 0 && (
                <div className="player-pdfs">
                  {playerLesson.pdfs.map(p => (
                    <a href={p.url} className="player-pdf-item" key={p.id} target="_blank" rel="noreferrer">
                      <div className="pdf-icon"><IconPdf /></div>
                      <div className="pdf-name">{p.nome}</div>
                      <div className="pdf-dl">Baixar ↓</div>
                    </a>
                  ))}
                </div>
              )}
              <div className="player-footer">
                <button className={`mark-done-btn${playerLesson.done ? ' is-done' : ''}`} onClick={() => toggleLessonDone(playerLesson.id)}>
                  <IconCheck /> {playerLesson.done ? 'Concluída' : 'Marcar como concluída'}
                </button>
                <div className="nav-lessons">
                  <button className="nav-lesson-btn" onClick={() => navLesson(-1)}><IconChevronLeft /></button>
                  <button className="nav-lesson-btn" onClick={() => navLesson(1)}><IconChevronRight /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {moduloModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModuloModal(null) }}>
          <div className="modal">
            <div className="modal-title">{moduloModal.moduloId ? 'Editar módulo' : 'Novo módulo'}</div>
            <div className="modal-field">
              <label className="modal-label">Nome do módulo</label>
              <input className="modal-input" value={moduloForm} onChange={e => setModuloForm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveModulo() }}
                placeholder="Ex: Precificação, Atendimento…" autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModuloModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={saveModulo}>{moduloModal.moduloId ? 'Salvar' : 'Criar módulo'}</button>
            </div>
          </div>
        </div>
      )}

      {aulaModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAulaModal(null) }}>
          <div className="modal">
            <div className="modal-title">{aulaModal.aulaId ? 'Editar aula' : 'Nova aula'}</div>
            <div className="modal-field">
              <label className="modal-label">Título da aula</label>
              <input className="modal-input" value={aulaForm.titulo}
                onChange={e => setAulaForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Como precificar por hora" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Link do YouTube (não listado)</label>
              <input className="modal-input" value={aulaForm.youtube_url}
                onChange={e => setAulaForm(f => ({ ...f, youtube_url: e.target.value }))}
                placeholder="https://youtube.com/watch?v=…" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Descrição</label>
              <textarea className="modal-input" value={aulaForm.descricao}
                onChange={e => setAulaForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Sobre o que é essa aula…" />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setAulaModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={saveAula}>{aulaModal.aulaId ? 'Salvar' : 'Criar aula'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && <DeleteModal {...deleteModal} onClose={() => setDeleteModal(null)} onConfirm={confirmDelete} />}
      {pastaModal && <PastaModal form={pastaForm} setForm={setPastaForm} editing={pastaModal !== 'new'} onClose={() => setPastaModal(null)} onConfirm={savePasta} />}
    </>
  )
}

function PastaModal({ form, setForm, editing, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-title">{editing ? 'Editar pasta' : 'Nova pasta'}</div>
        <div className="modal-field">
          <label className="modal-label">Nome da pasta</label>
          <input className="modal-input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Curso de Tráfego Pago" autoFocus />
        </div>
        <div className="modal-field">
          <label className="modal-label">Descrição curta</label>
          <input className="modal-input" value={form.subtitulo} onChange={e => setForm(f => ({ ...f, subtitulo: e.target.value }))}
            placeholder="Ex: 6 módulos · do básico ao avançado" />
        </div>
        <div className="modal-field">
          <label className="modal-label">Cor da capa</label>
          <div className="icon-color-pills">
            {[['green', 'Verde'], ['blue', 'Azul'], ['orange', 'Laranja']].map(([c, lbl]) => (
              <button key={c} className={`icon-color-pill${form.cor === c ? ' selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, cor: c }))}>{lbl}</button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={onConfirm}>{editing ? 'Salvar' : 'Criar pasta'}</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ type, nome, onClose, onConfirm }) {
  const labels = { pasta: 'pasta', modulo: 'módulo', aula: 'aula' }
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-title">Excluir {labels[type]}</div>
        <p className="modal-delete-name">{nome}</p>
        <p className="modal-delete-warn">Essa ação não pode ser desfeita.</p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirm}>Excluir</button>
        </div>
      </div>
    </div>
  )
}
