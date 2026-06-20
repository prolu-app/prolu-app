import { useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { FOLDERS } from '../data/seed.js'
import {
  IconPlus, IconCheck, IconClose, IconBack, IconPlay, IconChevronDown,
  IconChevronLeft, IconChevronRight, IconEdit, IconTrash, IconBase, IconPdf,
} from '../components/Icons.jsx'
import './BaseConhecimento.css'

const COVER_CLASS = { green: 'cover-green', blue: 'cover-blue', orange: 'cover-orange' }

export default function BaseConhecimento() {
  const toast = useToast()
  const { isMaster } = useAuth()
  const [folders, setFolders] = useState(FOLDERS)
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [player, setPlayer] = useState(null) // lesson id
  const [folderModal, setFolderModal] = useState(false)
  const [moduleModal, setModuleModal] = useState(false)
  const [lessonModal, setLessonModal] = useState(null) // moduleId
  const [folderForm, setFolderForm] = useState({ name: '', sub: '', cover: 'green' })
  const [moduleForm, setModuleForm] = useState('')
  const [lessonForm, setLessonForm] = useState({ title: '', url: '', desc: '' })

  const folder = folders.find((f) => f.id === currentFolderId)

  // ── helpers ──
  const folderLessons = (f) => f.modules.flatMap((m) => m.lessons)
  const folderProgress = (f) => {
    const all = folderLessons(f)
    const done = all.filter((l) => l.done).length
    return { total: all.length, done, pct: all.length ? Math.round((done / all.length) * 100) : 0 }
  }
  const moduleProgress = (m) => {
    const done = m.lessons.filter((l) => l.done).length
    return { pct: m.lessons.length ? Math.round((done / m.lessons.length) * 100) : 0 }
  }
  function findLesson(id) {
    if (!folder) return null
    for (const m of folder.modules) {
      const l = m.lessons.find((x) => x.id === id)
      if (l) return l
    }
    return null
  }

  // ── ações ──
  function toggleLessonDone(lessonId) {
    setFolders((prev) => prev.map((f) => f.id !== currentFolderId ? f : {
      ...f, modules: f.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => l.id === lessonId ? { ...l, done: !l.done } : l) })),
    }))
    const l = findLesson(lessonId)
    toast(l?.done ? 'Reaberta' : 'Aula concluída 🎉')
  }

  function navLesson(dir) {
    const all = folderLessons(folder)
    const idx = all.findIndex((l) => l.id === player)
    const next = all[idx + dir]
    if (next) setPlayer(next.id)
  }

  function criarFolder() {
    if (!folderForm.name.trim()) return
    setFolders((prev) => [...prev, { id: 'f' + Date.now(), title: folderForm.name.trim(), sub: folderForm.sub.trim() || 'Novo curso', cover: folderForm.cover, modules: [] }])
    setFolderModal(false)
    setFolderForm({ name: '', sub: '', cover: 'green' })
    toast('Pasta criada')
  }
  function criarModule() {
    if (!moduleForm.trim()) return
    setFolders((prev) => prev.map((f) => f.id !== currentFolderId ? f : { ...f, modules: [...f.modules, { id: 'm' + Date.now(), title: moduleForm.trim(), lessons: [] }] }))
    setModuleModal(false)
    setModuleForm('')
    toast('Módulo criado')
  }
  function criarLesson() {
    if (!lessonForm.title.trim()) return
    const mId = lessonModal
    setFolders((prev) => prev.map((f) => f.id !== currentFolderId ? f : {
      ...f, modules: f.modules.map((m) => m.id !== mId ? m : { ...m, lessons: [...m.lessons, { id: 'l' + Date.now(), title: lessonForm.title.trim(), url: lessonForm.url, desc: lessonForm.desc.trim() || 'Sem descrição.', done: false, pdfs: [] }] }),
    }))
    setLessonModal(null)
    setLessonForm({ title: '', url: '', desc: '' })
    toast('Aula criada')
  }

  const playerLesson = player ? findLesson(player) : null

  // ════════ VIEW: PASTAS ════════
  if (!folder) {
    return (
      <>
        <div className="page-header between">
          <div>
            <div className="page-title">Base de Conhecimento</div>
            <div className="page-sub">Tudo que você precisa aprender, organizado por curso.</div>
          </div>
          {isMaster && <button className="btn-primary kb-new-btn" onClick={() => setFolderModal(true)}><IconPlus /> Nova pasta</button>}
        </div>

        <div className="folders-grid">
          {folders.map((f) => {
            const prog = folderProgress(f)
            return (
              <div className="folder-card" key={f.id} onClick={() => setCurrentFolderId(f.id)}>
                <div className={`folder-cover ${COVER_CLASS[f.cover]}`}>
                  <div className="folder-icon"><IconBase /></div>
                  <div className="folder-count">{f.modules.length} módulos</div>
                </div>
                <div className="folder-body">
                  <div className="folder-title">{f.title}</div>
                  <div className="folder-sub">{f.sub}</div>
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
          {isMaster && (
            <div className="folder-card-add" onClick={() => setFolderModal(true)}>
              <IconPlus /> Nova pasta
            </div>
          )}
        </div>

        {folderModal && (
          <FolderModal form={folderForm} setForm={setFolderForm} onClose={() => setFolderModal(false)} onConfirm={criarFolder} />
        )}
      </>
    )
  }

  // ════════ VIEW: DENTRO DA PASTA ════════
  const prog = folderProgress(folder)
  const circ = 150.8
  const dashoffset = circ - (circ * prog.pct) / 100
  const nextLesson = folderLessons(folder).find((l) => !l.done)

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">{folder.title}</div>
          <div className="page-sub">{folder.sub}</div>
        </div>
      </div>

      <div className="back-link" onClick={() => setCurrentFolderId(null)}><IconBack /> Todas as pastas</div>

      <div className="kb-progress">
        <svg className="kb-progress-ring" width="58" height="58" viewBox="0 0 58 58">
          <circle cx="29" cy="29" r="24" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5.5" />
          <circle cx="29" cy="29" r="24" fill="none" stroke="#CBE921" strokeWidth="5.5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={dashoffset} transform="rotate(-90 29 29)" style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
          <text x="29" y="34" textAnchor="middle" fill="white" fontFamily="Abhaya Libre, serif" fontSize="13" fontWeight="600">{prog.pct}%</text>
        </svg>
        <div className="kb-progress-text">
          <div className="kb-progress-label">Progresso neste curso</div>
          <div className="kb-progress-val"><span>{prog.done}</span> de {prog.total} aulas assistidas</div>
          <div className="kb-progress-sub">{nextLesson ? `Continue de onde parou: ${nextLesson.title}` : 'Você concluiu todas as aulas deste curso 🎉'}</div>
        </div>
      </div>

      {folder.modules.map((m, idx) => {
        const mp = moduleProgress(m)
        const isOpen = expanded[m.id] ?? idx === 0
        return (
          <div className={`module-card${isOpen ? ' expanded' : ''}${isMaster ? ' admin-mode' : ''}`} key={m.id}>
            <div className="module-head" onClick={() => setExpanded({ ...expanded, [m.id]: !isOpen })}>
              <div className="module-number">{String(idx + 1).padStart(2, '0')}</div>
              <div className="module-info">
                <div className="module-title">{m.title}</div>
                <div className="module-meta">{m.lessons.length} aulas</div>
              </div>
              <div className="module-progress-mini">
                <div className="module-progress-track"><div className="module-progress-fill" style={{ width: `${mp.pct}%` }} /></div>
                <span className="module-progress-pct">{mp.pct}%</span>
              </div>
              {isMaster && (
                <div className="module-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => toast('Editar módulo')}><IconEdit /></button>
                  <button className="icon-btn" onClick={() => toast('Excluir módulo')}><IconTrash /></button>
                </div>
              )}
              <IconChevronDown className="module-chevron" />
            </div>
            <div className="lessons-list">
              {m.lessons.map((l) => (
                <div className="lesson-row" key={l.id} onClick={() => setPlayer(l.id)}>
                  <div className={`lesson-check ${l.done ? 'done' : 'pend'}`}>{l.done && <IconCheck />}</div>
                  <div className="lesson-info">
                    <div className="lesson-title">{l.title}</div>
                    {l.pdfs.length > 0 && <div className="lesson-meta"><span className="lesson-pdf-tag">📎 {l.pdfs.length} PDF</span></div>}
                  </div>
                  <div className="lesson-play"><IconPlay /></div>
                </div>
              ))}
              {isMaster && (
                <div className="add-lesson-row" onClick={() => setLessonModal(m.id)}>
                  <IconPlus /> Adicionar aula neste módulo
                </div>
              )}
            </div>
          </div>
        )
      })}

      {isMaster && (
        <div className="add-module-row" onClick={() => setModuleModal(true)}>
          <IconPlus /> Adicionar módulo nesta pasta
        </div>
      )}

      {isMaster && <button className="fab" onClick={() => setLessonModal(folder.modules[0]?.id)} aria-label="Nova aula"><IconPlus /></button>}

      {/* player */}
      {playerLesson && (
        <div className="player-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPlayer(null) }}>
          <div className="player-modal">
            <div className="player-video">
              <button className="player-close" onClick={() => setPlayer(null)}><IconClose /></button>
              <div className="player-video-fake">
                <IconPlay style={{ width: 44, height: 44, stroke: 'rgba(255,255,255,.25)', strokeWidth: 1.2, fill: 'none' }} />
                Player de vídeo (YouTube embed)
              </div>
            </div>
            <div className="player-body">
              <div className="player-title">{playerLesson.title}</div>
              <div className="player-desc">{playerLesson.desc}</div>
              {playerLesson.pdfs.length > 0 && (
                <div className="player-pdfs">
                  {playerLesson.pdfs.map((p) => (
                    <a href="#" className="player-pdf-item" key={p} onClick={(e) => { e.preventDefault(); toast(`Baixando ${p}`) }}>
                      <div className="pdf-icon"><IconPdf /></div>
                      <div className="pdf-name">{p}</div>
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

      {/* modais */}
      {moduleModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModuleModal(false) }}>
          <div className="modal">
            <div className="modal-title">Novo módulo</div>
            <div className="modal-field">
              <label className="modal-label">Nome do módulo</label>
              <input className="modal-input" value={moduleForm} onChange={(e) => setModuleForm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criarModule() }} placeholder="Ex: Precificação, Atendimento…" autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModuleModal(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criarModule}>Criar módulo</button>
            </div>
          </div>
        </div>
      )}

      {lessonModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setLessonModal(null) }}>
          <div className="modal">
            <div className="modal-title">Nova aula</div>
            <div className="modal-field">
              <label className="modal-label">Módulo</label>
              <input className="modal-input" value={folder.modules.find((m) => m.id === lessonModal)?.title || ''} readOnly />
            </div>
            <div className="modal-field">
              <label className="modal-label">Título da aula</label>
              <input className="modal-input" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} placeholder="Ex: Como precificar por hora" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Link do YouTube (não listado)</label>
              <input className="modal-input" value={lessonForm.url} onChange={(e) => setLessonForm({ ...lessonForm, url: e.target.value })} placeholder="https://youtube.com/watch?v=…" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Descrição</label>
              <textarea className="modal-input" value={lessonForm.desc} onChange={(e) => setLessonForm({ ...lessonForm, desc: e.target.value })} placeholder="Sobre o que é essa aula…" />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setLessonModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={criarLesson}>Criar aula</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FolderModal({ form, setForm, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-title">Nova pasta</div>
        <div className="modal-field">
          <label className="modal-label">Nome da pasta</label>
          <input className="modal-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Curso de Tráfego Pago" autoFocus />
        </div>
        <div className="modal-field">
          <label className="modal-label">Descrição curta</label>
          <input className="modal-input" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} placeholder="Ex: 6 módulos · do básico ao avançado" />
        </div>
        <div className="modal-field">
          <label className="modal-label">Cor da capa</label>
          <div className="icon-color-pills">
            {[['green', 'Verde'], ['blue', 'Azul'], ['orange', 'Laranja']].map(([c, lbl]) => (
              <button key={c} className={`icon-color-pill${form.cover === c ? ' selected' : ''}`} onClick={() => setForm({ ...form, cover: c })}>{lbl}</button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={onConfirm}>Criar pasta</button>
        </div>
      </div>
    </div>
  )
}
