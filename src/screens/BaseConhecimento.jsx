import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { FOLDERS } from '../data/seed.js'
import {
  IconPlus, IconCheck, IconBack, IconPlay, IconChevronDown,
  IconChevronLeft, IconChevronRight, IconEdit, IconTrash, IconBase, IconPdf,
} from '../components/Icons.jsx'
import RichEditor from '../components/RichEditor.jsx'
import './BaseConhecimento.css'

const COVER_CLASS = { green: 'cover-green', blue: 'cover-blue', orange: 'cover-orange' }

const NIVEIS = [
  { value: 'todos', label: 'Todos' },
  { value: 'gestor', label: 'Gestor e acima' },
  { value: 'master', label: 'Somente Master' },
]

function getYouTubeEmbed(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function pdfStoragePath(url) {
  if (!url || !url.includes('/kb-pdfs/')) return null
  return url.split('/kb-pdfs/')[1]
}

function modulosAbertosKey(pastaId) {
  return `kb_modulos_abertos_${pastaId}`
}

function lerModulosAbertos(pastaId) {
  try {
    const raw = localStorage.getItem(modulosAbertosKey(pastaId))
    const ids = raw ? JSON.parse(raw) : null
    return Array.isArray(ids) ? ids : null
  } catch {
    return null
  }
}

function salvarModulosAbertos(pastaId, ids) {
  try {
    localStorage.setItem(modulosAbertosKey(pastaId), JSON.stringify(ids))
  } catch {
    // localStorage indisponível (modo privado, quota etc) — falha em silêncio
  }
}

function isEmptyHtml(html) {
  if (!html) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() === ''
}

// Conteúdo rico (descrição, aula tipo Doc) vem do Tiptap, mas kb_aulas é
// legível por qualquer usuário autenticado — sanitiza antes de injetar via
// dangerouslySetInnerHTML pra não abrir XSS caso o HTML salvo seja adulterado
// fora da UI (edição direta na tabela, sessão comprometida, etc).
function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '')
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
      tipo: a.tipo || 'video',
      pdf_url: a.pdf_url || '',
      conteudo_doc: a.conteudo_doc || '',
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
      empresa_id: p.empresa_id ?? null,
      nivel_acesso: p.nivel_acesso || 'todos',
      modules: (modulosByPasta[p.id] || []).sort((a, b) => a.ordem - b.ordem),
    }))
    .sort((a, b) => a.ordem - b.ordem)
}

export default function BaseConhecimento() {
  const toast = useToast()
  const { isProluAdmin, isEmpresaMaster, isGestorOuSuperior, activeEmpresaId, user, impersonatedEmpresaId, viewAsUser } = useAuth()

  // Prolu admin "puro" (sem estar impersonando nem em modo visualização de
  // usuário) não tem escritório próprio — só o conteúdo Prolu global. O
  // mesmo critério usado pra decidir a sidebar de admin em AppLayout.jsx.
  // Impersonando uma empresa, ele deve ver e editar o escritório dela
  // normalmente (é para isso que a impersonação existe).
  const isAdminMode = isProluAdmin && !impersonatedEmpresaId && !viewAsUser

  const [pastas, setPastas] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPastaId, setCurrentPastaId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [player, setPlayer] = useState(null)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [aulaUploading, setAulaUploading] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  // pastaModal: null | 'new' | pastaId (editando)
  const [pastaModal, setPastaModal] = useState(null)
  // moduloModal: null | { pastaId, moduloId? }
  const [moduloModal, setModuloModal] = useState(null)
  // aulaModal: null | { moduloId, aulaId? }
  const [aulaModal, setAulaModal] = useState(null)
  // deleteModal: null | { type, id, nome, ctx? }
  const [deleteModal, setDeleteModal] = useState(null)

  const [pastaForm, setPastaForm] = useState({ nome: '', subtitulo: '', cor: 'green', nivel_acesso: 'todos' })
  const [moduloForm, setModuloForm] = useState('')
  const [aulaForm, setAulaForm] = useState({ titulo: '', descricao: '', youtube_url: '', tipo: 'video', pdf_url: '', pdf_nome: '', conteudo_doc: '' })

  // ── permissões de edição de conteúdo ──
  // Conteúdo Prolu (empresa_id null): só prolu_admin.
  const podeEditarProlu = isProluAdmin
  // Conteúdo da empresa: gestor, master da empresa OU prolu_admin.
  const podeEditarEmpresa = isGestorOuSuperior
  // Pode criar/editar/excluir dentro de uma pasta específica?
  function podeEditarPasta(pasta) {
    if (!pasta || pasta.empresa_id == null) return podeEditarProlu
    return podeEditarEmpresa && (pasta.empresa_id === activeEmpresaId || isProluAdmin)
  }

  // Reforço no front do que a RLS já garante no banco — evita que uma
  // pasta sem permissão apareça por um instante em caso de cache/delay
  // (ex: activeEmpresaId ainda não atualizou após trocar de impersonação).
  function podeVerPasta(pasta) {
    if (isProluAdmin) return true
    if (pasta.nivel_acesso === 'todos') return true
    if (pasta.nivel_acesso === 'gestor') return isGestorOuSuperior
    if (pasta.nivel_acesso === 'master') return isEmpresaMaster
    return true
  }

  const pastasVisiveis = pastas.filter(podeVerPasta)
  const pasta = pastasVisiveis.find(p => p.id === currentPastaId)

  async function carregar() {
    if (!supabaseReady || !user?.id) {
      const seed = FOLDERS.map(f => ({
        id: f.id, title: f.title, sub: f.sub, cover: f.cover, ordem: 0,
        empresa_id: f.empresa_id ?? null,
        nivel_acesso: f.nivel_acesso || 'todos',
        modules: (f.modules || []).map(m => ({
          id: m.id, title: m.title, ordem: 0,
          lessons: (m.lessons || []).map(l => ({ ...l, url: l.url || '', tipo: l.tipo || 'video', pdf_url: l.pdf_url || '', conteudo_doc: l.conteudo_doc || '', pdfs: l.pdfs || [] })),
        })),
      }))
      setPastas(seed)
      setLoading(false)
      return
    }
    setLoading(true)
    // Conteúdo Prolu (empresa_id null) e conteúdo do escritório são buscados
    // separadamente — a UI mostra cada grupo em sua própria seção.
    const nested = '*, kb_modulos(*, kb_aulas(*))'
    const [
      { data: pastasProlu },
      { data: pastasEmpresa },
      { data: pdfsData },
      { data: progressoData },
    ] = await Promise.all([
      supabase.from('kb_pastas').select(nested).is('empresa_id', null).order('ordem'),
      activeEmpresaId
        ? supabase.from('kb_pastas').select(nested).eq('empresa_id', activeEmpresaId).order('ordem')
        : Promise.resolve({ data: [] }),
      supabase.from('kb_aula_pdfs').select('*'),
      supabase.from('kb_progresso').select('*').eq('usuario_id', user.id),
    ])

    // Achata a estrutura aninhada para o formato plano que buildPastas espera.
    const pastasRaw = [...(pastasProlu || []), ...(pastasEmpresa || [])]
    const pastasData = pastasRaw.map(({ kb_modulos, ...p }) => p)
    const modulosData = pastasRaw.flatMap(p => (p.kb_modulos || []).map(({ kb_aulas, ...m }) => m))
    const aulasData = pastasRaw.flatMap(p => (p.kb_modulos || []).flatMap(m => m.kb_aulas || []))

    setPastas(buildPastas(pastasData, modulosData, aulasData, pdfsData, progressoData))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [user?.id, activeEmpresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restaura quais módulos estavam abertos/fechados nesta pasta
  // (localStorage, por pasta). Sem nada salvo, abre todos por padrão.
  useEffect(() => {
    if (!pasta) return
    const salvos = lerModulosAbertos(pasta.id)
    const abertosSet = salvos ? new Set(salvos) : new Set(pasta.modules.map(m => m.id))
    setExpanded(Object.fromEntries(pasta.modules.map(m => [m.id, abertosSet.has(m.id)])))
  }, [pasta?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleModulo(moduloId) {
    setExpanded(prev => {
      const next = { ...prev, [moduloId]: !(prev[moduloId] ?? true) }
      if (pasta) {
        const abertos = pasta.modules.filter(m => next[m.id] ?? true).map(m => m.id)
        salvarModulosAbertos(pasta.id, abertos)
      }
      return next
    })
  }

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
  function openNewPasta() { setPastaForm({ nome: '', subtitulo: '', cor: 'green', nivel_acesso: 'todos' }); setPastaModal('new') }
  function openEditPasta(p) { setPastaForm({ nome: p.title, subtitulo: p.sub, cor: p.cover, nivel_acesso: p.nivel_acesso || 'todos' }); setPastaModal(p.id) }

  async function savePasta() {
    const { nome, subtitulo, cor, nivel_acesso } = pastaForm
    if (!nome.trim()) return
    const editing = pastaModal !== 'new'
    // Pasta nova pertence à empresa ativa de quem cria; prolu_admin cria
    // conteúdo global (empresa_id null). Transparente para o usuário no modal.
    const novaEmpresaId = isProluAdmin ? null : activeEmpresaId
    if (!supabaseReady || !user?.id) {
      if (editing) {
        setPastas(prev => prev.map(p => p.id !== pastaModal ? p : { ...p, title: nome.trim(), sub: subtitulo.trim(), cover: cor, nivel_acesso }))
      } else {
        setPastas(prev => [...prev, { id: 'p' + Date.now(), title: nome.trim(), sub: subtitulo.trim(), cover: cor, ordem: prev.length, empresa_id: novaEmpresaId, nivel_acesso, modules: [] }])
      }
      setPastaModal(null)
      toast(editing ? 'Pasta atualizada' : 'Pasta criada')
      return
    }
    if (editing) {
      const { error } = await supabase.from('kb_pastas').update({ titulo: nome.trim(), subtitulo: subtitulo.trim(), cor_capa: cor, nivel_acesso }).eq('id', pastaModal)
      if (error) { toast('Erro ao salvar'); return }
      setPastas(prev => prev.map(p => p.id !== pastaModal ? p : { ...p, title: nome.trim(), sub: subtitulo.trim(), cover: cor, nivel_acesso }))
      toast('Pasta atualizada')
    } else {
      const { data, error } = await supabase.from('kb_pastas')
        .insert({ titulo: nome.trim(), subtitulo: subtitulo.trim(), cor_capa: cor, ordem: pastas.length, empresa_id: novaEmpresaId, nivel_acesso })
        .select('*').single()
      if (error) { toast('Erro ao criar pasta'); return }
      setPastas(prev => [...prev, { id: data.id, title: data.titulo, sub: data.subtitulo || '', cover: data.cor_capa, ordem: data.ordem, empresa_id: data.empresa_id ?? null, nivel_acesso: data.nivel_acesso || 'todos', modules: [] }])
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
      // propaga o empresa_id da pasta pai (null = conteúdo Prolu)
      const { data, error } = await supabase.from('kb_modulos')
        .insert({ pasta_id: pastaId, titulo, ordem, empresa_id: p?.empresa_id ?? null })
        .select('*').single()
      if (error) { toast('Erro ao criar módulo'); return }
      setPastas(prev => prev.map(pa => pa.id !== pastaId ? pa : {
        ...pa, modules: [...pa.modules, { id: data.id, title: data.titulo, ordem: data.ordem, lessons: [] }],
      }))
      toast('Módulo criado')
    }
    setModuloModal(null)
  }

  // ── CRUD aulas ──
  function openNewAula(moduloId) {
    setAulaForm({ titulo: '', descricao: '', youtube_url: '', tipo: 'video', pdf_url: '', pdf_nome: '', conteudo_doc: '' })
    setDescExpanded(false)
    setAulaModal({ moduloId, originalPdfUrl: null })
  }
  function openEditAula(moduloId, aula) {
    setAulaForm({
      titulo: aula.title, descricao: aula.desc, youtube_url: aula.url,
      tipo: aula.tipo || 'video', pdf_url: aula.pdf_url || '', pdf_nome: aula.pdf_url ? 'Arquivo atual' : '',
      conteudo_doc: aula.conteudo_doc || '',
    })
    setDescExpanded(!isEmptyHtml(aula.desc))
    setAulaModal({ moduloId, aulaId: aula.id, originalPdfUrl: aula.pdf_url || null })
  }

  // Substitui o PDF antigo (se houver, e não for só uma preview local em
  // blob:) pelo novo assim que o upload termina — evita acumular arquivo
  // órfão no bucket a cada troca de arquivo antes de salvar.
  async function replaceOldPdf(newUrl) {
    const old = aulaModal?.originalPdfUrl
    setAulaModal(prev => (prev ? { ...prev, originalPdfUrl: newUrl } : prev))
    if (old && old.startsWith('blob:')) { URL.revokeObjectURL(old); return }
    const path = pdfStoragePath(old)
    if (path && supabaseReady) await supabase.storage.from('kb-pdfs').remove([path])
  }

  async function handlePdfSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { toast('Arquivo muito grande. Máximo: 50MB'); return }
    if (!supabaseReady || !user?.id) {
      const blobUrl = URL.createObjectURL(file)
      await replaceOldPdf(blobUrl)
      setAulaForm(f => ({ ...f, pdf_url: blobUrl, pdf_nome: file.name }))
      return
    }
    setAulaUploading(true)
    const filePath = `${activeEmpresaId ?? 'prolu'}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('kb-pdfs').upload(filePath, file, { contentType: 'application/pdf', upsert: false })
    if (error) { toast('Erro ao enviar PDF'); setAulaUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('kb-pdfs').getPublicUrl(filePath)
    await replaceOldPdf(publicUrl)
    setAulaForm(f => ({ ...f, pdf_url: publicUrl, pdf_nome: file.name }))
    setAulaUploading(false)
  }

  async function saveAula() {
    const { titulo, descricao, youtube_url, tipo, pdf_url, conteudo_doc } = aulaForm
    if (!titulo.trim()) return
    const { moduloId, aulaId } = aulaModal
    const editing = Boolean(aulaId)
    const payload = {
      titulo: titulo.trim(),
      descricao: isEmptyHtml(descricao) ? '' : descricao,
      youtube_url: tipo === 'video' ? youtube_url.trim() : '',
      tipo,
      pdf_url: tipo === 'pdf' ? (pdf_url || null) : null,
      conteudo_doc: tipo === 'doc' ? (conteudo_doc || null) : null,
    }
    // Se o tipo virou 'video' (ou o PDF foi limpo) descartando um PDF que
    // já estava salvo no bucket, remove o arquivo órfão.
    if (payload.pdf_url == null) {
      const oldPath = pdfStoragePath(aulaModal?.originalPdfUrl)
      if (oldPath && supabaseReady) await supabase.storage.from('kb-pdfs').remove([oldPath])
    }
    if (!supabaseReady || !user?.id) {
      if (editing) {
        setPastas(prev => prev.map(pa => ({
          ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
            ...m, lessons: m.lessons.map(l => l.id !== aulaId ? l : { ...l, title: payload.titulo, desc: payload.descricao, url: payload.youtube_url, tipo: payload.tipo, pdf_url: payload.pdf_url || '', conteudo_doc: payload.conteudo_doc || '' }),
          }),
        })))
      } else {
        setPastas(prev => prev.map(pa => ({
          ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
            ...m, lessons: [...m.lessons, { id: 'l' + Date.now(), title: payload.titulo, desc: payload.descricao, url: payload.youtube_url, tipo: payload.tipo, pdf_url: payload.pdf_url || '', conteudo_doc: payload.conteudo_doc || '', done: false, pdfs: [], ordem: m.lessons.length }],
          }),
        })))
      }
      setAulaModal(null)
      toast(editing ? 'Aula atualizada' : 'Aula criada')
      return
    }
    if (editing) {
      const { error } = await supabase.from('kb_aulas').update(payload).eq('id', aulaId)
      if (error) { toast('Erro ao salvar'); return }
      setPastas(prev => prev.map(pa => ({
        ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
          ...m, lessons: m.lessons.map(l => l.id !== aulaId ? l : { ...l, title: payload.titulo, desc: payload.descricao, url: payload.youtube_url, tipo: payload.tipo, pdf_url: payload.pdf_url || '', conteudo_doc: payload.conteudo_doc || '' }),
        }),
      })))
      toast('Aula atualizada')
    } else {
      let ordem = 0
      let empresaId = null
      for (const pa of pastas) {
        const m = pa.modules.find(x => x.id === moduloId)
        if (m) { ordem = m.lessons.length; empresaId = pa.empresa_id ?? null; break }
      }
      // propaga o empresa_id da pasta do módulo pai (null = conteúdo Prolu)
      const { data, error } = await supabase.from('kb_aulas')
        .insert({ modulo_id: moduloId, ordem, empresa_id: empresaId, ...payload })
        .select('*').single()
      if (error) { toast('Erro ao criar aula'); return }
      setPastas(prev => prev.map(pa => ({
        ...pa, modules: pa.modules.map(m => m.id !== moduloId ? m : {
          ...m, lessons: [...m.lessons, { id: data.id, title: data.titulo, desc: data.descricao || '', url: data.youtube_url || '', tipo: data.tipo || 'video', pdf_url: data.pdf_url || '', conteudo_doc: data.conteudo_doc || '', done: false, pdfs: [], ordem: data.ordem }],
        }),
      })))
      toast('Aula criada')
    }
    setAulaModal(null)
  }

  // ── deletar ──
  // Junta os PDFs (já salvos no bucket) de uma lista de módulos, pra
  // limpar o Storage antes de um delete em cascata (pasta ou módulo).
  function collectPdfPaths(modules) {
    return modules
      .flatMap(m => m.lessons)
      .map(l => pdfStoragePath(l.pdf_url))
      .filter(Boolean)
  }

  async function confirmDelete() {
    const { type, id, ctx } = deleteModal
    if (type === 'pasta') {
      const alvo = pastas.find(p => p.id === id)
      setPastas(prev => prev.filter(p => p.id !== id))
      if (currentPastaId === id) setCurrentPastaId(null)
      if (supabaseReady && user?.id) {
        const paths = collectPdfPaths(alvo?.modules || [])
        if (paths.length) await supabase.storage.from('kb-pdfs').remove(paths)
        await supabase.from('kb_pastas').delete().eq('id', id)
      }
      toast('Pasta excluída')
    } else if (type === 'modulo') {
      const pa0 = pastas.find(p => p.id === ctx.pastaId)
      const moduloAlvo = pa0?.modules.find(m => m.id === id)
      setPastas(prev => prev.map(pa => pa.id !== ctx.pastaId ? pa : { ...pa, modules: pa.modules.filter(m => m.id !== id) }))
      if (supabaseReady && user?.id) {
        const paths = collectPdfPaths(moduloAlvo ? [moduloAlvo] : [])
        if (paths.length) await supabase.storage.from('kb-pdfs').remove(paths)
        await supabase.from('kb_modulos').delete().eq('id', id)
      }
      toast('Módulo excluído')
    } else if (type === 'aula') {
      let aulaExcluida = null
      for (const pa of pastas) {
        const m = pa.modules.find(x => x.id === ctx.moduloId)
        if (m) { aulaExcluida = m.lessons.find(l => l.id === id); break }
      }
      setPastas(prev => prev.map(pa => ({
        ...pa, modules: pa.modules.map(m => m.id !== ctx.moduloId ? m : { ...m, lessons: m.lessons.filter(l => l.id !== id) }),
      })))
      if (supabaseReady && user?.id) {
        if (aulaExcluida?.pdf_url) {
          const path = aulaExcluida.pdf_url.split('/kb-pdfs/')[1]
          if (path) await supabase.storage.from('kb-pdfs').remove([path])
        }
        await supabase.from('kb_aulas').delete().eq('id', id)
      }
      toast('Aula excluída')
    }
    setDeleteModal(null)
  }

  const playerLesson = player ? findLesson(player) : null
  const embedUrl = playerLesson ? getYouTubeEmbed(playerLesson.url) : null

  if (loading) return <div className="crm-empty">Carregando…</div>

  // ════════ VIEW: PASTAS ════════
  function renderFolder(p) {
    const fprog = pastaProgress(p)
    const isProlu = p.empresa_id == null
    return (
      <div className="folder-card" key={p.id} onClick={() => setCurrentPastaId(p.id)}>
        <div className={`folder-cover ${COVER_CLASS[p.cover] || 'cover-green'}`}>
          {isProlu && <span className="kb-badge-prolu">Prolu</span>}
          <div className="folder-icon"><IconBase /></div>
          <div className="folder-cover-end">
            {podeEditarPasta(p) && (
              <div className="folder-admin-actions" onClick={e => e.stopPropagation()}>
                <button className="folder-admin-btn" onClick={() => openEditPasta(p)} title="Editar pasta"><IconEdit /></button>
                <button className="folder-admin-btn" onClick={() => setDeleteModal({ type: 'pasta', id: p.id, nome: p.title })} title="Excluir pasta"><IconTrash /></button>
              </div>
            )}
            {!isProlu && <div className="folder-count">{p.modules.length} módulos</div>}
          </div>
        </div>
        <div className="folder-body">
          <div className="folder-title-row">
            <div className="folder-title">{p.title}</div>
            {p.nivel_acesso === 'gestor' && (
              <span className="kb-badge-nivel">Gestor+</span>
            )}
            {p.nivel_acesso === 'master' && (
              <span className="kb-badge-nivel">Master</span>
            )}
          </div>
          <div className="folder-sub">{p.sub}</div>
          <div className="folder-progress">
            <div className="folder-progress-head">
              <span><strong>{fprog.done}</strong> de {fprog.total} aulas</span>
              <span>{fprog.pct}%</span>
            </div>
            <div className="folder-progress-track"><div className="folder-progress-fill" style={{ width: `${fprog.pct}%` }} /></div>
          </div>
        </div>
      </div>
    )
  }

  if (!pasta) {
    const pastasProlu = pastasVisiveis.filter(p => p.empresa_id == null)
    const pastasEmpresa = pastasVisiveis.filter(p => p.empresa_id != null)

    // Prolu admin puro: só o conteúdo Prolu, numa lista limpa — sem
    // seções, sem "Seu escritório" (ele não tem um).
    if (isAdminMode) {
      return (
        <>
          <div className="page-header">
            <div className="page-title">Base de Conhecimento</div>
            <div className="page-sub">Tudo que você precisa aprender, organizado por curso.</div>
          </div>

          {pastasProlu.length > 0 ? (
            <div className="folders-grid">
              {pastasProlu.map(renderFolder)}
              <div className="folder-card-add" onClick={openNewPasta}>
                <IconPlus /> Nova pasta
              </div>
            </div>
          ) : (
            <div className="kb-empresa-cta is-clickable" onClick={openNewPasta}>
              <IconPlus />
              <p>Adicione o primeiro curso ou processo da Base de Conhecimento.</p>
            </div>
          )}

          {pastaModal && (
            <PastaModal form={pastaForm} setForm={setPastaForm} editing={pastaModal !== 'new'} onClose={() => setPastaModal(null)} onConfirm={savePasta} />
          )}
          {deleteModal && (
            <DeleteModal {...deleteModal} onClose={() => setDeleteModal(null)} onConfirm={confirmDelete} />
          )}
        </>
      )
    }

    return (
      <>
        <div className="page-header">
          <div className="page-title">Base de Conhecimento</div>
          <div className="page-sub">Tudo que você precisa aprender, organizado por curso.</div>
        </div>

        {pastasProlu.length > 0 && (
          <>
            <div className="kb-section-label">Conteúdo Prolu</div>
            <div className="folders-grid">{pastasProlu.map(renderFolder)}</div>
          </>
        )}

        {(podeEditarEmpresa || pastasEmpresa.length > 0) && (
          <div className="kb-section-label">
            <span>Seu escritório</span>
            {podeEditarEmpresa && (
              <button className="btn-primary kb-new-btn" onClick={openNewPasta}><IconPlus /> Nova pasta</button>
            )}
          </div>
        )}
        {pastasEmpresa.length > 0 ? (
          <div className="folders-grid">
            {pastasEmpresa.map(renderFolder)}
            {podeEditarEmpresa && (
              <div className="folder-card-add" onClick={openNewPasta}>
                <IconPlus /> Nova pasta
              </div>
            )}
          </div>
        ) : podeEditarEmpresa && (
          <div className="kb-empresa-cta is-clickable" onClick={openNewPasta}>
            <IconPlus />
            <p>Adicione seus próprios cursos e processos internos para sua equipe.</p>
          </div>
        )}

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

  // ════════ VIEW: AULA (tela dividida) ════════
  if (playerLesson) {
    const allLessons = pastaLessons(pasta)
    const curIdx = allLessons.findIndex(l => l.id === player)
    const hasPrev = curIdx > 0
    const hasNext = curIdx > -1 && curIdx < allLessons.length - 1
    return (
      <>
        <div className="lesson-view-top">
          <div className="back-link" onClick={() => setPlayer(null)}><IconBack /> Voltar ao curso</div>
          <button className="lesson-mobile-toggle" onClick={() => setMobileSidebar(true)}>Ver aulas</button>
        </div>

        <div className="lesson-view-body">
          <div className="lesson-content">
            {playerLesson.tipo === 'doc' ? (
              <div className="doc-viewer">
                <h2 className="doc-titulo">{playerLesson.title}</h2>
                <div className="doc-conteudo" dangerouslySetInnerHTML={{ __html: sanitizeHtml(playerLesson.conteudo_doc) }} />
              </div>
            ) : playerLesson.tipo === 'pdf' && playerLesson.pdf_url ? (
              <iframe src={playerLesson.pdf_url} className="pdf-viewer" title={playerLesson.title} />
            ) : (
              <div className="youtube-embed">
                {embedUrl
                  ? <iframe src={embedUrl} title={playerLesson.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen />
                  : <div className="player-video-fake">
                      <IconPlay style={{ width: 44, height: 44, stroke: 'rgba(255,255,255,.25)', strokeWidth: 1.2, fill: 'none' }} />
                      Player de vídeo (YouTube embed)
                    </div>
                }
              </div>
            )}

            {(playerLesson.tipo !== 'doc' || playerLesson.pdfs.length > 0) && (
              <div className="player-body">
                {playerLesson.tipo !== 'doc' && <div className="player-title">{playerLesson.title}</div>}
                {playerLesson.tipo !== 'doc' && !isEmptyHtml(playerLesson.desc) && (
                  <div className="aula-descricao" dangerouslySetInnerHTML={{ __html: sanitizeHtml(playerLesson.desc) }} />
                )}
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
              </div>
            )}

            <div className="lesson-footer">
              <button className="nav-lesson-text-btn" onClick={() => navLesson(-1)} disabled={!hasPrev}>
                <IconChevronLeft /> Anterior
              </button>
              <button className={`btn-concluir${playerLesson.done ? ' concluida' : ''}`} onClick={() => toggleLessonDone(playerLesson.id)}>
                <IconCheck /> {playerLesson.done ? 'Concluída' : 'Marcar como concluída'}
              </button>
              <button className="nav-lesson-text-btn" onClick={() => navLesson(1)} disabled={!hasNext}>
                Próxima <IconChevronRight />
              </button>
            </div>
          </div>

          <div className={`lesson-sidebar${mobileSidebar ? ' is-open' : ''}`}>
            <div className="lesson-sidebar-overlay" onClick={() => setMobileSidebar(false)} />
            <div className="lesson-sidebar-sheet">
              <div className="lesson-sidebar-handle" />
              {pasta.modules.map(m => (
                <div className="lesson-sidebar-section" key={m.id}>
                  <div className="lesson-sidebar-section-title">{m.title}</div>
                  {m.lessons.map(l => (
                    <div
                      className={`lesson-sidebar-item${l.id === player ? ' active' : ''}`}
                      key={l.id}
                      onClick={() => { setPlayer(l.id); setMobileSidebar(false) }}
                    >
                      <div className={`lesson-check ${l.done ? 'done' : 'pend'}`}>{l.done && <IconCheck />}</div>
                      <span className="lesson-sidebar-title">{l.title}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">{pasta.title}</div>
          <div className="page-sub">{pasta.sub}</div>
        </div>
        {podeEditarPasta(pasta) && (
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
        {podeEditarPasta(pasta) && (
          <div className="kb-pasta-admin">
            <button className="kb-pasta-admin-btn" onClick={() => openEditPasta(pasta)} title="Editar pasta"><IconEdit /></button>
            <button className="kb-pasta-admin-btn" onClick={() => setDeleteModal({ type: 'pasta', id: pasta.id, nome: pasta.title })} title="Excluir pasta"><IconTrash /></button>
          </div>
        )}
      </div>

      {pasta.modules.map((m, idx) => {
        const mp = moduleProgress(m)
        const isOpen = expanded[m.id] ?? true
        return (
          <div className={`module-card${isOpen ? ' expanded' : ''}`} key={m.id}>
            <div className="module-head" onClick={() => toggleModulo(m.id)}>
              <div className="module-number">{String(idx + 1).padStart(2, '0')}</div>
              <div className="module-info">
                <div className="module-title">{m.title}</div>
                <div className="module-meta">{m.lessons.length} aulas</div>
              </div>
              <div className="module-progress-mini">
                <div className="module-progress-track"><div className="module-progress-fill" style={{ width: `${mp.pct}%` }} /></div>
                <span className="module-progress-pct">{mp.pct}%</span>
              </div>
              {podeEditarPasta(pasta) && (
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
                  {podeEditarPasta(pasta) && (
                    <div className="lesson-admin-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" onClick={() => openEditAula(m.id, l)}><IconEdit /></button>
                      <button className="icon-btn" onClick={() => setDeleteModal({ type: 'aula', id: l.id, nome: l.title, ctx: { moduloId: m.id } })}><IconTrash /></button>
                    </div>
                  )}
                  <div className="lesson-play"><IconPlay /></div>
                </div>
              ))}
              {podeEditarPasta(pasta) && (
                <div className="add-lesson-row" onClick={() => openNewAula(m.id)}>
                  <IconPlus /> Adicionar aula neste módulo
                </div>
              )}
            </div>
          </div>
        )
      })}

      {podeEditarPasta(pasta) && (
        <div className="add-module-row" onClick={() => openNewModulo(pasta.id)}>
          <IconPlus /> Adicionar módulo nesta pasta
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
          <div className="modal kb-aula-modal">
            <div className="modal-title">{aulaModal.aulaId ? 'Editar aula' : 'Nova aula'}</div>
            <div className="modal-field">
              <label className="modal-label">Título da aula</label>
              <input className="modal-input" value={aulaForm.titulo}
                onChange={e => setAulaForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Como precificar por hora" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Tipo de aula</label>
              <div className="icon-color-pills">
                <button type="button" className={`icon-color-pill${aulaForm.tipo === 'video' ? ' selected' : ''}`}
                  onClick={() => setAulaForm(f => ({ ...f, tipo: 'video' }))}>Vídeo</button>
                <button type="button" className={`icon-color-pill${aulaForm.tipo === 'pdf' ? ' selected' : ''}`}
                  onClick={() => setAulaForm(f => ({ ...f, tipo: 'pdf' }))}>PDF</button>
                <button type="button" className={`icon-color-pill${aulaForm.tipo === 'doc' ? ' selected' : ''}`}
                  onClick={() => setAulaForm(f => ({ ...f, tipo: 'doc' }))}>Doc</button>
              </div>
            </div>
            {aulaForm.tipo === 'pdf' ? (
              <div className="modal-field">
                <label className="modal-label">Arquivo PDF</label>
                <label className="kb-file-btn">
                  {aulaUploading ? 'Enviando…' : 'Selecionar arquivo PDF'}
                  <input type="file" accept="application/pdf" hidden disabled={aulaUploading} onChange={handlePdfSelect} />
                </label>
                {aulaForm.pdf_nome && <div className="kb-pdf-selected"><IconPdf /> {aulaForm.pdf_nome}</div>}
                {aulaUploading && <div className="kb-upload-bar"><div className="kb-upload-bar-fill" /></div>}
              </div>
            ) : aulaForm.tipo === 'doc' ? (
              <div className="modal-field">
                <label className="modal-label">Conteúdo</label>
                <RichEditor key={`doc-${aulaModal.aulaId || 'new'}`} content={aulaForm.conteudo_doc}
                  onChange={html => setAulaForm(f => ({ ...f, conteudo_doc: html }))} editable />
              </div>
            ) : (
              <div className="modal-field">
                <label className="modal-label">Link do YouTube (não listado)</label>
                <input className="modal-input" value={aulaForm.youtube_url}
                  onChange={e => setAulaForm(f => ({ ...f, youtube_url: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=…" />
              </div>
            )}
            {aulaForm.tipo !== 'doc' && (
              descExpanded ? (
                <div className="modal-field">
                  <label className="modal-label">Descrição</label>
                  <RichEditor key={`desc-${aulaModal.aulaId || 'new'}`} content={aulaForm.descricao}
                    onChange={html => setAulaForm(f => ({ ...f, descricao: html }))} editable />
                </div>
              ) : (
                <button type="button" className="kb-add-desc-btn" onClick={() => setDescExpanded(true)}>
                  <IconPlus /> Adicionar descrição
                </button>
              )
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setAulaModal(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={saveAula} disabled={aulaUploading}>{aulaModal.aulaId ? 'Salvar' : 'Criar aula'}</button>
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
        <div className="modal-field">
          <label className="modal-label">Quem pode ver</label>
          <div className="icon-color-pills">
            {NIVEIS.map(({ value, label }) => (
              <button key={value} className={`icon-color-pill${form.nivel_acesso === value ? ' selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, nivel_acesso: value }))}>{label}</button>
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
