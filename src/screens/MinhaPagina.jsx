// Editor da Minha Página v2 (/minha-pagina, migration_056): três áreas
// (Conteúdo, Aparência, Publicação) à esquerda e a prévia 9:16 do RASCUNHO à
// direita — o mesmo render da página pública (PaginaRender).
// Editar salva o rascunho sozinho (usePaginaRascunho); a página pública só
// muda ao Publicar. "Descartar alterações" volta o rascunho ao publicado.
// Sair da tela com alterações não publicadas pergunta se quer publicar (o
// rascunho fica salvo de qualquer jeito).
// prolu_admin visitando outro escritório só lê (RLS da migration_056).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { useConta } from '../contexts/ContaContext.jsx'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import PaginaRender from '../components/minhapagina/render/PaginaRender.jsx'
import { urlPaginaPublica } from '../utils/paginaConfig.js'
import { capaSemImagem, normalizarDoc } from '../utils/pagina/modelo.js'
import usePaginaRascunho from './minhapagina/usePaginaRascunho.js'
import AreaConteudo from './minhapagina/AreaConteudo.jsx'
import AreaAparencia, { gifNaCapa } from './minhapagina/AreaAparencia.jsx'
import AreaPublicacao from './minhapagina/AreaPublicacao.jsx'
import { PreviaCelular } from './minhapagina/comum.jsx'
import './Formularios.css'
import './MinhaPagina.css'

const AREAS = [
  { id: 'conteudo', label: 'Conteúdo' },
  { id: 'aparencia', label: 'Aparência' },
  { id: 'publicacao', label: 'Publicação' },
]

const STATUS_SALVAMENTO = {
  salvo: 'Rascunho salvo',
  pendente: 'Salvando…',
  salvando: 'Salvando…',
  erro: 'Não foi possível salvar o rascunho',
  conflito: 'Alterada em outra aba',
}

function Modal({ id, titulo, children, acoes, onFechar }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && onFechar) onFechar() }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <div className="modal-title" id={`${id}-titulo`}>{titulo}</div>
        <p className="fm-confirmar-texto">{children}</p>
        <div className="modal-actions">{acoes}</div>
      </div>
    </div>
  )
}

export default function MinhaPagina() {
  const { activeEmpresaId, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const area = AREAS.some(a => a.id === params.get('area')) ? params.get('area') : 'conteudo'
  const podeEditar = activeEmpresaId != null && activeEmpresaId === user?.empresaId
  const off = !podeEditar
  // Starter: selo fixo (o servidor também impõe, em pagina_publica)
  const { planoLibera } = useConta()
  const seloFixo = !planoLibera('selo_removivel')

  const r = usePaginaRascunho({ empresaId: activeEmpresaId, podeEditar, toast })
  const { estado, doc, empresa, formularios, servidor, salvamento } = r
  const docNormal = useMemo(() => (doc ? normalizarDoc(doc) : null), [doc])
  // prévia: formulário vira slug só se estiver ativo (como em pagina_publica)
  const docPrevia = useMemo(() => {
    if (!docNormal) return null
    const ativos = new Map(formularios.filter(f => f.ativo).map(f => [f.id, f.slug]))
    return { ...docNormal, itens: docNormal.itens.map(it => (it.tipo === 'formulario' && ativos.has(it.formulario_id) ? { ...it, slug_formulario: ativos.get(it.formulario_id) } : it)) }
  }, [docNormal, formularios])

  const [publicando, setPublicando] = useState(false)
  const [modal, setModal] = useState(null) // descartar | conflito | fora_do_ar | saida
  const [saida, setSaida] = useState(null) // destino pedido com alterações não publicadas

  const pendente = !!servidor?.pendente && podeEditar
  const precisaSalvar = podeEditar && ['pendente', 'salvando', 'erro'].includes(salvamento)
  // sair pergunta só se já existe rascunho salvo diferente do publicado (abrir e
  // sair sem mexer numa página ainda não salva neste editor não pergunta nada)
  const perguntarAoSair = (pendente && !!servidor?.existe) || precisaSalvar

  useEffect(() => { if (salvamento === 'conflito') setModal('conflito') }, [salvamento])

  // Ctrl+S / Cmd+S: salva o rascunho na hora
  const salvarRef = useRef(r.salvarAgora)
  salvarRef.current = r.salvarAgora
  useEffect(() => {
    const atalho = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvarRef.current() } }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  // fechar/recarregar a aba com salvamento pendente: aviso do navegador
  useEffect(() => {
    if (!precisaSalvar) return
    const aviso = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [precisaSalvar])
  // links do app (menu etc.) com alterações não publicadas: pergunta antes
  // (o app usa <BrowserRouter>, sem useBlocker — o clique é interceptado)
  useEffect(() => {
    if (!perguntarAoSair) return
    const clique = e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const destino = new URL(a.href, window.location.href)
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      setSaida(destino.pathname + destino.search + destino.hash)
      setModal('saida')
    }
    document.addEventListener('click', clique, true)
    return () => document.removeEventListener('click', clique, true)
  }, [perguntarAoSair])

  if (!activeEmpresaId) return null
  if (estado === 'carregando') return <div className="fm-empty">Carregando…</div>
  if (estado === 'erro') return <div className="fm-empty">Não foi possível carregar a Minha Página. <button className="fm-link-btn" onClick={r.carregar}>Tentar de novo</button></div>

  const trocarArea = id => setParams(id === 'conteudo' ? {} : { area: id }, { replace: true })
  function irParaCapa() {
    trocarArea('aparencia')
    setTimeout(() => document.getElementById('mpe-capa')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function publicar() {
    if (publicando) return false
    if (capaSemImagem(docNormal)) { toast('A capa escolhida precisa de imagem — envie uma ou escolha "Sem capa"'); irParaCapa(); return false }
    if (gifNaCapa(docNormal.capa)) { toast('GIF não é aceito em Capa e Hero — envie JPG, PNG ou WEBP'); irParaCapa(); return false }
    setPublicando(true)
    const res = await r.publicar()
    setPublicando(false)
    if (res.erro === 'capa_sem_imagem') { toast('A capa escolhida precisa de imagem'); irParaCapa(); return false }
    if (res.erro === 'conflito_revisao') { setModal('conflito'); return false }
    if (res.erro) { toast('Não foi possível publicar — tente de novo'); return false }
    if (!res.noAr) setModal('fora_do_ar')
    else toast('Página publicada')
    return true
  }

  async function sair(destino, comPublicar) {
    if (comPublicar && !(await publicar())) return
    await r.salvarAgora()
    setModal(null)
    setSaida(null)
    navigate(destino)
  }

  const url = urlPaginaPublica(empresa.slug)
  const noAr = servidor.temPublicado ? servidor.noAr : servidor.legado.noAr
  const podePublicar = podeEditar && salvamento !== 'conflito' && (pendente || !servidor.temPublicado)

  return (
    <PageContainer>
      <PageHeader
        titulo="Minha Página"
        descricao="Página pública do escritório com os seus links — para a bio do Instagram, o WhatsApp e onde mais quiser."
        acoes={(
          <>
            {noAr && <a className="btn-cancel mp-abrir" href={url} target="_blank" rel="noopener noreferrer">Abrir página</a>}
            {podeEditar && servidor.temPublicado && pendente && (
              <button type="button" className="btn-cancel" onClick={() => setModal('descartar')}>Descartar alterações</button>
            )}
            {podeEditar && (
              <button type="button" className="btn-primary mp-salvar" onClick={publicar} disabled={!podePublicar || publicando}>
                {publicando ? 'Publicando…' : 'Publicar'}
              </button>
            )}
          </>
        )}
      />

      {!podeEditar && <p className="fm-readonly-note">Página de outro escritório — somente leitura.</p>}
      {podeEditar && pendente && (
        <div className="mpe-faixa" role="status">
          {servidor.temPublicado
            ? 'Alterações não publicadas — a página pública continua como estava até você publicar.'
            : 'Ainda não publicada neste editor. ' + (noAr ? 'A página atual continua no ar até você publicar.' : 'Publique para colocar a página no ar.')}
        </div>
      )}

      <div className="mp-editor">
        <div className="mp-editor-config">
          <div className="fm-abas" role="tablist" aria-label="Áreas da Minha Página">
            {AREAS.map(a => (
              <button
                key={a.id} type="button" role="tab" id={`mpe-aba-${a.id}`}
                aria-selected={area === a.id} aria-controls={`mpe-painel-${a.id}`}
                className={`fm-aba${area === a.id ? ' on' : ''}`} onClick={() => trocarArea(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`mpe-painel-${area}`} aria-labelledby={`mpe-aba-${area}`} className="mpe-painel">
            {area === 'conteudo' && (
              <AreaConteudo doc={doc} docNormal={docNormal} alterar={r.alterar} alterarDoc={r.alterarDoc} empresa={empresa}
                empresaId={activeEmpresaId} formularios={formularios} off={off} toast={toast} />
            )}
            {area === 'aparencia' && (
              <AreaAparencia doc={doc} docNormal={docNormal} alterar={r.alterar} alterarDoc={r.alterarDoc} empresa={empresa}
                empresaId={activeEmpresaId} off={off} />
            )}
            {area === 'publicacao' && (
              <AreaPublicacao docNormal={docNormal} alterar={r.alterar} empresa={empresa} servidor={servidor} off={off}
                seloFixo={seloFixo} toast={toast} onDefinirNoAr={r.definirNoAr} />
            )}
          </div>
        </div>

        <aside className="mp-editor-previa" aria-label="Prévia da página">
          <div className="mp-previa-rotulo">Prévia do rascunho</div>
          <PreviaCelular>
            {alturaTela => (
              <PaginaRender doc={docPrevia} selo={seloFixo || docPrevia.selo} escritorio={empresa.nome} slug={empresa.slug} modo="previa" alturaTela={alturaTela} />
            )}
          </PreviaCelular>
          {podeEditar && (
            <div className={`mp-status ${salvamento === 'salvo' ? 'salvo' : 'pendente'}`} role="status">
              {salvamento === 'salvo' ? '✓ ' : '● '}{STATUS_SALVAMENTO[salvamento]}
              {salvamento === 'erro' && <button type="button" className="fm-link-btn" onClick={r.salvarAgora}>Tentar de novo</button>}
            </div>
          )}
        </aside>
      </div>

      {modal === 'descartar' && (
        <Modal id="mpe-descartar" titulo="Descartar as alterações?" onFechar={() => setModal(null)} acoes={(
          <>
            <button className="btn-cancel" onClick={() => setModal(null)} autoFocus>Cancelar</button>
            <button className="btn-danger" onClick={async () => { setModal(null); if (await r.descartar()) toast('Alterações descartadas') }}>Descartar</button>
          </>
        )}>
          O rascunho volta a ser igual à página publicada. O que foi alterado desde a última publicação se perde.
        </Modal>
      )}

      {modal === 'conflito' && (
        <Modal id="mpe-conflito" titulo="Página alterada em outra aba" acoes={(
          <button className="btn-confirm" onClick={async () => { setModal(null); await r.carregar() }} autoFocus>Recarregar</button>
        )}>
          Esta página foi salva em outra aba ou dispositivo. Para não sobrescrever nada, recarregue e continue a partir da versão mais recente.
        </Modal>
      )}

      {modal === 'fora_do_ar' && (
        <Modal id="mpe-foradoar" titulo="Publicado — mas a página está fora do ar" onFechar={() => setModal(null)} acoes={(
          <>
            <button className="btn-cancel" onClick={() => setModal(null)} autoFocus>Deixar fora do ar</button>
            <button className="btn-confirm" onClick={async () => { setModal(null); if (await r.definirNoAr(true)) toast('Página no ar') }}>Colocar no ar</button>
          </>
        )}>
          O conteúdo foi publicado, mas quem abrir o link ainda vê "página não disponível".
        </Modal>
      )}

      {modal === 'saida' && saida && (
        <Modal id="mpe-saida" titulo="Alterações não publicadas" onFechar={() => setModal(null)} acoes={(
          <>
            <button className="btn-cancel" onClick={() => { setModal(null); setSaida(null) }} autoFocus>Continuar editando</button>
            <button className="btn-cancel" onClick={() => sair(saida, false)}>Sair (fica salvo)</button>
            <button className="btn-confirm" onClick={() => sair(saida, true)} disabled={publicando}>{publicando ? 'Publicando…' : 'Publicar e sair'}</button>
          </>
        )}>
          O rascunho fica salvo, mas a página pública só muda quando você publicar.
        </Modal>
      )}
    </PageContainer>
  )
}
