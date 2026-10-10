// Editor da Minha Página (/minha-pagina, migration_041): à esquerda a
// configuração em abas, à direita a prévia ao vivo (o mesmo PaginaView da
// página pública, com os dados da tela).
// Salvamento manual: tudo fica só na tela até clicar em "Salvar" (ou Ctrl+S).
// Aí grava empresas.pagina_config e, em pagina_links, só o que mudou —
// inclui os novos, altera os editados, exclui os removidos e acerta a ordem.
// Sair com alterações pendentes pede confirmação (fechar/recarregar a aba e
// clicar em links do app, como o menu).
// prolu_admin visitando outro escritório só lê (RLS da migration_041).

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { FmSwitch } from './Formularios.jsx'
import { Linha, Segmentos } from './FormularioAparencia.jsx'
import PaginaView from '../components/minhapagina/PaginaView.jsx'
import FundoSelector from '../components/minhapagina/FundoSelector.jsx'
import ColorPicker from '../components/minhapagina/ColorPicker.jsx'
import { IconChevronDown, IconCopy, IconGrip, IconPlus, IconTrash } from '../components/Icons.jsx'
import { comprimirCapa, comprimirFoto } from '../utils/comprimirImagem.js'
import {
  PAGINA_PADRAO, NOME_MAX, BIO_MAX, TITULO_LINK_MAX, FONTES,
  normalizarPagina, completarUrlLink, urlPaginaPublica,
} from '../utils/paginaConfig.js'
import './Formularios.css'
import './MinhaPagina.css'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'

const ABAS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'links', label: 'Links' },
  { id: 'botoes', label: 'Botões' },
  { id: 'fundo', label: 'Fundo' },
  { id: 'texto', label: 'Texto' },
  { id: 'geral', label: 'Publicação' },
]

const FORMATO_FOTO = [{ value: 'quadrado', label: 'Quadrado' }, { value: 'arredondado', label: 'Arredondado' }, { value: 'redondo', label: 'Redondo' }]
const ESTILO_BOTAO = [{ value: 'solido', label: 'Sólido' }, { value: 'contorno', label: 'Contorno' }]
const ARREDONDAMENTO = [{ value: 'none', label: 'Reto' }, { value: 'sm', label: 'P' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'G' }, { value: 'full', label: 'Pílula' }]
const SOMBRA = [{ value: 'none', label: 'Nenhuma' }, { value: 'soft', label: 'Suave' }, { value: 'strong', label: 'Forte' }, { value: 'hard', label: 'Marcada' }]
const ESPESSURA = [{ value: 1, label: '1px' }, { value: 2, label: '2px' }, { value: 3, label: '3px' }]
const MODO_IMAGEM = [{ value: 'icone', label: 'Ícone' }, { value: 'banner', label: 'Banner' }]

// colunas de pagina_links que o editor altera (ordem vem da posição na lista)
const CAMPOS_LINK = ['tipo', 'titulo', 'url', 'formulario_id', 'ativo', 'imagem_url', 'imagem_modo']
const camposDoLink = (l, ordem) => ({ ordem, ...Object.fromEntries(CAMPOS_LINK.map(k => [k, l[k] ?? (k === 'ativo' ? true : k === 'titulo' ? '' : null)])) })
const linkMudou = (a, b) => CAMPOS_LINK.some(k => (a[k] ?? null) !== (b[k] ?? null))
function linksMudaram(atuais, salvos) {
  return atuais.length !== salvos.length || atuais.some((l, i) => l.id !== salvos[i].id || linkMudou(l, salvos[i]))
}
let seqNovo = 0

const BUCKET = 'pagina-assets'
const TIPOS_IMAGEM = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
function caminhoNoBucket(url) {
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const i = (url || '').indexOf(marca)
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split('?')[0]) : null
}
function apagarDoBucket(urls) {
  const caminhos = [...new Set(urls.map(caminhoNoBucket).filter(Boolean))]
  if (caminhos.length) supabase.storage.from(BUCKET).remove(caminhos) // melhor esforço
}

// valida, comprime e envia para <empresa>/<prefixo>-<data>.<ext>; devolve a URL pública
// (ou null, já avisando). O arquivo sobe na hora (para a prévia); a página só
// passa a usá-lo depois de salvar.
async function enviarImagem(file, { empresaId, prefixo, comprimir, toast }) {
  if (!TIPOS_IMAGEM[file.type]) { toast('Use uma imagem JPG, PNG, WEBP ou GIF'); return null }
  if (file.size > 10 * 1024 * 1024) { toast('Imagem muito grande — máximo 10 MB'); return null }
  const pronto = await comprimir(file).catch(() => file)
  const caminho = `${empresaId}/${prefixo}-${Date.now()}.${TIPOS_IMAGEM[pronto.type]}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, pronto, { contentType: pronto.type, cacheControl: '31536000', upsert: false })
  if (error) { console.error('[minha-pagina] upload', error); toast('Não foi possível enviar a imagem'); return null }
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
}

// Prévia fiel ao celular: a página é desenhada com 390px de largura (um
// celular comum) e reduzida com transform: scale até caber na moldura 9:16.
// A escala acompanha o tamanho da moldura (ResizeObserver); a tela interna tem
// a altura da moldura ÷ escala, então nada é cortado — o conteúdo rola dentro.
const PREVIA_LARGURA_BASE = 390

function PreviaCelular({ children }) {
  const molduraRef = useRef(null)
  const [medida, setMedida] = useState({ escala: 1, altura: 0 })

  useEffect(() => {
    const el = molduraRef.current
    if (!el) return
    const medir = () => {
      const escala = el.clientWidth / PREVIA_LARGURA_BASE
      if (escala > 0) setMedida({ escala, altura: el.clientHeight / escala })
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="mp-previa-moldura" ref={molduraRef}>
      <div
        className="mp-previa-tela"
        style={{ width: PREVIA_LARGURA_BASE, height: medida.altura || undefined, transform: `scale(${medida.escala})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  )
}

function UploadPagina({ url, rotulo, empresaId, prefixo, comprimir, redonda, off, onMudar, onEnviada }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [enviando, setEnviando] = useState(false)

  async function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviando(true)
    const publicUrl = await enviarImagem(file, { empresaId, prefixo, comprimir, toast })
    setEnviando(false)
    if (!publicUrl) return
    onEnviada(publicUrl)
    onMudar(publicUrl)
  }

  return (
    <div className="fm-upload">
      <div className={`fm-upload-previa${redonda ? ' redonda' : ''}`}>
        {url ? <img src={url} alt={rotulo} /> : <span>Sem imagem</span>}
      </div>
      {!off && (
        <div className="fm-upload-acoes">
          <input ref={inputRef} type="file" accept={Object.keys(TIPOS_IMAGEM).join(',')} hidden onChange={escolher} aria-label={rotulo} />
          <button type="button" className="fm-embed-btn" onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? 'Enviando…' : url ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {url && <button type="button" className="fm-link-btn" onClick={() => onMudar(null)} disabled={enviando}>Remover</button>}
        </div>
      )}
    </div>
  )
}

export default function MinhaPagina() {
  const { activeEmpresaId, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(a => a.id === params.get('aba')) ? params.get('aba') : 'perfil'
  const podeEditar = activeEmpresaId != null && activeEmpresaId === user?.empresaId
  const off = !podeEditar

  const [estado, setEstado] = useState('carregando') // carregando | pronto | erro
  const [empresa, setEmpresa] = useState(null) // { nome, slug }
  const [config, setConfig] = useState(PAGINA_PADRAO)
  const [configSalva, setConfigSalva] = useState(PAGINA_PADRAO)
  const [links, setLinks] = useState([])
  const [linksSalvos, setLinksSalvos] = useState([])
  const [formularios, setFormularios] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [saida, setSaida] = useState(null) // destino pedido com alterações pendentes
  const enviados = useRef(new Set()) // imagens enviadas nesta edição (limpeza das não usadas)

  useEffect(() => { carregar() }, [activeEmpresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) return
    setEstado('carregando')
    const [emp, lks, frm] = await Promise.all([
      supabase.from('empresas').select('nome, slug, pagina_config').eq('id', activeEmpresaId).maybeSingle(),
      supabase.from('pagina_links').select('*').eq('empresa_id', activeEmpresaId).order('ordem').order('created_at'),
      supabase.from('formularios').select('id, nome, slug, ativo').eq('empresa_id', activeEmpresaId).order('nome'),
    ])
    if (emp.error || !emp.data || lks.error) {
      console.error('[minha-pagina] carregar', emp.error || lks.error)
      setEstado('erro')
      return
    }
    const cfg = normalizarPagina(emp.data.pagina_config)
    setEmpresa({ nome: emp.data.nome, slug: emp.data.slug })
    setConfig(cfg)
    setConfigSalva(cfg)
    setLinks(lks.data || [])
    setLinksSalvos(lks.data || [])
    setFormularios(frm.data || [])
    setEstado('pronto')
  }

  const configMudou = JSON.stringify(normalizarPagina(config)) !== JSON.stringify(normalizarPagina(configSalva))
  const hasUnsavedChanges = !off && estado === 'pronto' && (configMudou || linksMudaram(links, linksSalvos))

  function mudar(patch) {
    if (off) return
    setConfig(c => ({ ...c, ...patch }))
  }
  function mudarLink(id, patch) {
    if (off) return
    setLinks(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  // ── salvar ──
  async function salvar() {
    if (off || salvando || !hasUnsavedChanges) return true
    setSalvando(true)
    let ok = true
    const falhou = (onde, error) => { ok = false; console.error('[minha-pagina] salvar', onde, error) }

    if (configMudou) {
      const { data, error } = await supabase.from('empresas')
        .update({ pagina_config: normalizarPagina(config) }).eq('id', activeEmpresaId).select('id')
      if (error || !data?.length) falhou('config', error)
      else setConfigSalva(config)
    }

    // links: só o que mudou, um a um
    const salvos = new Map(linksSalvos.map(l => [l.id, l]))
    const removidos = linksSalvos.filter(s => !links.some(l => l.id === s.id))
    if (removidos.length) {
      const { error } = await supabase.from('pagina_links').delete().in('id', removidos.map(l => l.id))
      if (error) falhou('excluir', error)
      else removidos.forEach(l => salvos.delete(l.id))
    }
    const idsNovos = {}
    for (const [ordem, l] of links.entries()) {
      if (l.novo) {
        const { data, error } = await supabase.from('pagina_links')
          .insert({ empresa_id: activeEmpresaId, ...camposDoLink(l, ordem) }).select('*').single()
        if (error || !data) { falhou('incluir', error); continue }
        idsNovos[l.id] = data.id
        salvos.set(data.id, data)
      } else {
        const antes = salvos.get(l.id)
        if (!antes || (antes.ordem === ordem && !linkMudou(l, antes))) continue
        const { error } = await supabase.from('pagina_links').update(camposDoLink(l, ordem)).eq('id', l.id)
        if (error) { falhou('alterar', error); continue }
        salvos.set(l.id, { ...antes, ...camposDoLink(l, ordem) })
      }
    }
    const atuais = links.map((l, ordem) => (idsNovos[l.id] ? { ...salvos.get(idsNovos[l.id]) } : { ...l, ordem }))
    setLinks(atuais)
    setLinksSalvos(ok ? atuais : [...salvos.values()].sort((a, b) => a.ordem - b.ordem))
    setSalvando(false)

    if (!ok) { toast('Não foi possível salvar tudo — tente de novo'); return false }
    // imagens que deixaram de ser usadas: as substituídas/removidas e as enviadas e descartadas
    const usadas = new Set([config.foto_perfil, config.banner_url, ...atuais.map(l => l.imagem_url)].filter(Boolean))
    const antigas = [configSalva.foto_perfil, configSalva.banner_url, ...linksSalvos.map(l => l.imagem_url), ...enviados.current]
    apagarDoBucket(antigas.filter(u => u && !usadas.has(u)))
    enviados.current.clear()
    toast('Alterações salvas')
    return true
  }

  // Ctrl+S / Cmd+S
  const salvarRef = useRef(salvar)
  salvarRef.current = salvar
  useEffect(() => {
    const atalho = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvarRef.current() } }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  // ── sair sem salvar ──
  // fechar/recarregar a aba: aviso do navegador
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const aviso = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [hasUnsavedChanges])
  // links do app (menu etc.): o app usa <BrowserRouter>, sem useBlocker — o
  // clique é interceptado antes do React Router e vira um pedido de confirmação
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const clique = e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const destino = new URL(a.href, window.location.href)
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      setSaida(destino.pathname + destino.search + destino.hash)
    }
    document.addEventListener('click', clique, true)
    return () => document.removeEventListener('click', clique, true)
  }, [hasUnsavedChanges])

  // ── links (só na tela até salvar) ──
  const [focoLink, setFocoLink] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null) // { id, pos: 'before' | 'after' }

  function adicionarLink(tipo) {
    const form = tipo === 'formulario' ? (formularios.find(f => f.ativo) || formularios[0]) : null
    const novo = {
      id: `novo-${++seqNovo}`, novo: true, tipo, ativo: true, url: null, estilo: {}, imagem_url: null, imagem_modo: null,
      titulo: form ? form.nome.slice(0, TITULO_LINK_MAX) : '', formulario_id: form?.id || null,
    }
    setLinks(prev => [...prev, novo])
    setFocoLink(novo.id)
  }
  const removerLink = id => setLinks(prev => prev.filter(l => l.id !== id))

  function mover(deId, paraId, pos) {
    setLinks(prev => {
      const lista = [...prev]
      const de = lista.findIndex(l => l.id === deId)
      if (de < 0) return prev
      const [item] = lista.splice(de, 1)
      let para = lista.findIndex(l => l.id === paraId)
      if (para < 0) return prev
      if (pos === 'after') para += 1
      lista.splice(para, 0, item)
      return lista
    })
  }
  function moverUm(id, delta) {
    const i = links.findIndex(l => l.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= links.length) return
    mover(id, links[j].id, delta > 0 ? 'after' : 'before')
  }

  if (!activeEmpresaId) return null
  if (estado === 'carregando') return <div className="fm-empty">Carregando…</div>
  if (estado === 'erro') return <div className="fm-empty">Não foi possível carregar a Minha Página. <button className="fm-link-btn" onClick={carregar}>Tentar de novo</button></div>

  const trocarAba = id => setParams(id === 'perfil' ? {} : { aba: id }, { replace: true })
  const urlPublica = urlPaginaPublica(empresa.slug)
  const imagemEnviada = url => enviados.current.add(url)
  // prévia: o que a página pública mostraria (só ativos; formulário inativo some)
  const linksPrevia = links.filter(l => l.ativo).map(l => {
    const f = l.tipo === 'formulario' ? formularios.find(x => x.id === l.formulario_id) : null
    return { id: l.id, tipo: l.tipo, titulo: l.titulo, url: l.url, slug_formulario: f?.ativo ? f.slug : null, estilo: l.estilo, imagem_url: l.imagem_url, imagem_modo: l.imagem_modo }
  })

  return (
    <PageContainer>
      <PageHeader
        titulo="Minha Página"
        descricao="Página pública do escritório com os seus links — para a bio do Instagram, o WhatsApp e onde mais quiser."
        acoes={(configSalva.publicada || podeEditar) && (
          <>
            {configSalva.publicada && (
              <a className="btn-cancel mp-abrir" href={urlPublica} target="_blank" rel="noopener noreferrer">Abrir página</a>
            )}
            {podeEditar && (
              <button type="button" className="btn-primary mp-salvar" onClick={salvar} disabled={!hasUnsavedChanges || salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </>
        )}
      />

      {!podeEditar && <p className="fm-readonly-note">Página de outro escritório — somente leitura.</p>}

      <div className="mp-editor">
        <div className="mp-editor-config">
          <div className="fm-abas" role="tablist" aria-label="Seções da Minha Página">
            {ABAS.map(a => (
              <button
                key={a.id} type="button" role="tab" id={`mp-aba-${a.id}`}
                aria-selected={aba === a.id} aria-controls={`mp-painel-${a.id}`}
                className={`fm-aba${aba === a.id ? ' on' : ''}`} onClick={() => trocarAba(a.id)}
              >
                {a.label}{a.id === 'links' && <span className="fm-count">{links.length}</span>}
              </button>
            ))}
          </div>

          {/* ── Perfil ── */}
          <section role="tabpanel" id="mp-painel-perfil" aria-labelledby="mp-aba-perfil" hidden={aba !== 'perfil'} className="fm-publico">
            <Linha rotulo="Nome" dica="Vazio = nome do escritório.">
              <input
                className="fm-pos-input" value={config.nome_exibicao} disabled={off} maxLength={NOME_MAX}
                placeholder={empresa.nome} aria-label="Nome exibido na página"
                onChange={e => mudar({ nome_exibicao: e.target.value })}
              />
            </Linha>
            <Linha rotulo="Bio" dica={`${config.bio.length}/${BIO_MAX}`}>
              <textarea
                className="fm-pos-input" rows={3} value={config.bio} disabled={off} maxLength={BIO_MAX}
                placeholder="Ex.: Transformamos espaços em experiências" aria-label="Bio"
                onChange={e => mudar({ bio: e.target.value })}
              />
            </Linha>
            <Linha rotulo="Foto de perfil" dica="Logo ou foto. Até 10 MB — reduzida no envio.">
              <UploadPagina
                url={config.foto_perfil} rotulo="Foto de perfil" empresaId={activeEmpresaId} prefixo="foto"
                comprimir={comprimirFoto} redonda={config.foto_perfil_formato === 'redondo'} off={off}
                onEnviada={imagemEnviada} onMudar={v => mudar({ foto_perfil: v })}
              />
            </Linha>
            <Linha rotulo="Formato da foto">
              <Segmentos rotulo="Formato da foto de perfil" valor={config.foto_perfil_formato} opcoes={FORMATO_FOTO} disabled={off} onChange={v => mudar({ foto_perfil_formato: v })} />
            </Linha>
            <Linha rotulo="Banner" dica="Opcional, no topo. Proporção 3:1 (ex.: 1200×400 px).">
              <UploadPagina
                url={config.banner_url} rotulo="Banner" empresaId={activeEmpresaId} prefixo="banner"
                comprimir={comprimirCapa} off={off} onEnviada={imagemEnviada} onMudar={v => mudar({ banner_url: v })}
              />
            </Linha>
          </section>

          {/* ── Links ── */}
          <section role="tabpanel" id="mp-painel-links" aria-labelledby="mp-aba-links" hidden={aba !== 'links'}>
            {links.length === 0 && <p className="fm-empty mp-links-vazio">Nenhum link ainda. Adicione o primeiro abaixo.</p>}
            <div className="mp-links-lista">
              {links.map((l, i) => (
                <LinkCard
                  key={l.id} link={l} indice={i} total={links.length} formularios={formularios} off={off} empresaId={activeEmpresaId}
                  focar={focoLink === l.id} onFocado={() => setFocoLink(null)}
                  onMudar={patch => mudarLink(l.id, patch)} onRemover={() => removerLink(l.id)} onImagemEnviada={imagemEnviada}
                  onMover={d => moverUm(l.id, d)}
                  arrastando={arrastando === l.id}
                  sobre={sobre?.id === l.id ? sobre.pos : null}
                  onDragStart={e => { setArrastando(l.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={e => {
                    if (!arrastando || arrastando === l.id) return
                    e.preventDefault()
                    const r = e.currentTarget.getBoundingClientRect()
                    setSobre({ id: l.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
                  }}
                  onDrop={e => { e.preventDefault(); if (arrastando && sobre) mover(arrastando, sobre.id, sobre.pos); setArrastando(null); setSobre(null) }}
                  onDragEnd={() => { setArrastando(null); setSobre(null) }}
                />
              ))}
            </div>
            {!off && (
              <div className="mp-links-add">
                <button type="button" className="btn-primary" onClick={() => adicionarLink('link')}><IconPlus /> Adicionar link</button>
                <button type="button" className="fm-embed-btn" onClick={() => adicionarLink('formulario')} disabled={!formularios.length}
                  title={formularios.length ? undefined : 'Crie um formulário primeiro'}>
                  <IconPlus /> Adicionar formulário
                </button>
              </div>
            )}
          </section>

          {/* ── Botões ── */}
          <section role="tabpanel" id="mp-painel-botoes" aria-labelledby="mp-aba-botoes" hidden={aba !== 'botoes'} className="fm-publico">
            <Linha rotulo="Estilo">
              <Segmentos rotulo="Estilo dos botões" valor={config.botao_estilo} opcoes={ESTILO_BOTAO} disabled={off} onChange={v => mudar({ botao_estilo: v })} />
            </Linha>
            {config.botao_estilo === 'solido' ? (
              <>
                <Linha rotulo="Cor do botão">
                  <ColorPicker rotulo="Cor dos botões" valor={config.botao_cor} disabled={off} onChange={v => mudar({ botao_cor: v })} />
                </Linha>
                <Linha rotulo="Cor do texto">
                  <ColorPicker rotulo="Cor do texto dos botões" valor={config.botao_cor_texto} disabled={off} onChange={v => mudar({ botao_cor_texto: v })} />
                </Linha>
              </>
            ) : (
              <>
                <Linha rotulo="Cor do contorno">
                  <ColorPicker rotulo="Cor do contorno dos botões" valor={config.botao_cor_contorno} disabled={off} onChange={v => mudar({ botao_cor_contorno: v })} />
                </Linha>
                <Linha rotulo="Cor do texto">
                  <ColorPicker rotulo="Cor do texto dos botões com contorno" valor={config.botao_cor_texto_contorno || config.botao_cor_contorno} disabled={off} onChange={v => mudar({ botao_cor_texto_contorno: v })} />
                </Linha>
                <Linha rotulo="Espessura">
                  <Segmentos rotulo="Espessura do contorno" valor={config.botao_espessura_contorno} opcoes={ESPESSURA} disabled={off} onChange={v => mudar({ botao_espessura_contorno: v })} />
                </Linha>
              </>
            )}
            <Linha rotulo="Cantos">
              <Segmentos rotulo="Cantos dos botões" valor={config.botao_arredondamento} opcoes={ARREDONDAMENTO} disabled={off} onChange={v => mudar({ botao_arredondamento: v })} />
            </Linha>
            <Linha rotulo="Sombra">
              <Segmentos rotulo="Sombra dos botões" valor={config.botao_sombra} opcoes={SOMBRA} disabled={off} onChange={v => mudar({ botao_sombra: v })} />
            </Linha>
          </section>

          {/* ── Fundo ── */}
          <section role="tabpanel" id="mp-painel-fundo" aria-labelledby="mp-aba-fundo" hidden={aba !== 'fundo'} className="fm-publico">
            <FundoSelector config={config} mudar={mudar} off={off} />
          </section>

          {/* ── Texto ── */}
          <section role="tabpanel" id="mp-painel-texto" aria-labelledby="mp-aba-texto" hidden={aba !== 'texto'} className="fm-publico">
            <Linha rotulo="Fonte">
              <select className="fm-tipo mp-fonte" value={config.fonte} disabled={off} aria-label="Fonte da página" onChange={e => mudar({ fonte: e.target.value })}>
                {FONTES.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
            </Linha>
            <Linha rotulo="Cor do nome">
              <ColorPicker rotulo="Cor do nome" valor={config.cor_texto} disabled={off} onChange={v => mudar({ cor_texto: v })} />
            </Linha>
            <Linha rotulo="Cor da bio" dica="Também usada no rodapé.">
              <ColorPicker rotulo="Cor da bio" valor={config.cor_texto_bio} disabled={off} onChange={v => mudar({ cor_texto_bio: v })} />
            </Linha>
          </section>

          {/* ── Publicação ── */}
          <section role="tabpanel" id="mp-painel-geral" aria-labelledby="mp-aba-geral" hidden={aba !== 'geral'} className="fm-publico">
            <Linha rotulo="Publicada" dica={config.publicada ? 'Qualquer pessoa com o link vê a página.' : 'Enquanto não publicar, o link mostra "página não disponível".'}>
              <FmSwitch ligado={config.publicada} disabled={off} rotulo="Publicar a página" onChange={v => mudar({ publicada: v })} />
              <span className="fm-status-texto">{config.publicada ? 'Publicada' : 'Não publicada'}</span>
            </Linha>
            <Linha rotulo="Rodapé">
              <FmSwitch ligado={config.rodape_prolu} disabled={off} rotulo='Mostrar "Feito com Prolu"' onChange={v => mudar({ rodape_prolu: v })} />
              <span className="fm-status-texto">Mostrar "Feito com Prolu"</span>
            </Linha>
            <Linha rotulo="Link público">
              <div className="mp-link-publico">
                <input className="fm-pos-input" readOnly value={urlPublica} aria-label="Link público da página" onFocus={e => e.target.select()} />
                <button type="button" className="fm-embed-btn" onClick={() => navigator.clipboard?.writeText(urlPublica).then(() => toast('Link copiado'), () => toast('Não foi possível copiar'))}>
                  <IconCopy /> Copiar
                </button>
              </div>
            </Linha>
          </section>
        </div>

        <aside className="mp-editor-previa" aria-label="Prévia da página">
          <div className="mp-previa-rotulo">Prévia</div>
          <PreviaCelular>
            {/* normalizada como na página pública: a prévia mostra exatamente o que vai ao ar */}
            <PaginaView config={normalizarPagina(config)} links={linksPrevia} slugEscritorio={empresa.slug} escritorio={empresa.nome} previa />
          </PreviaCelular>
          {podeEditar && (
            <div className={`mp-status${hasUnsavedChanges ? ' pendente' : ' salvo'}`} role="status">
              {hasUnsavedChanges ? '● Alterações não salvas' : '✓ Salvo'}
            </div>
          )}
        </aside>
      </div>

      {saida && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) setSaida(null) }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="mp-sair-titulo" aria-describedby="mp-sair-texto">
            <div className="modal-title" id="mp-sair-titulo">Sair sem salvar?</div>
            <p className="fm-confirmar-texto" id="mp-sair-texto">Você tem alterações na Minha Página que ainda não foram salvas.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSaida(null)} disabled={salvando} autoFocus>Continuar editando</button>
              <button className="btn-danger" onClick={() => { const d = saida; setSaida(null); navigate(d) }} disabled={salvando}>Sair sem salvar</button>
              <button className="btn-confirm" disabled={salvando}
                onClick={async () => { const d = saida; if (await salvar()) { setSaida(null); navigate(d) } }}>
                {salvando ? 'Salvando…' : 'Salvar e sair'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function LinkCard({
  link, indice, total, formularios, off, empresaId, focar, onFocado, onMudar, onRemover, onImagemEnviada, onMover,
  arrastando, sobre, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const tituloRef = useRef(null)
  const [armado, setArmado] = useState(false) // só arrasta pelo puxador
  const [urlTexto, setUrlTexto] = useState(link.url || '') // o que está digitado (a URL completa vai para o link)
  const [urlInvalida, setUrlInvalida] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const toast = useToast()
  const arquivoRef = useRef(null)
  const form = link.tipo === 'formulario' ? formularios.find(f => f.id === link.formulario_id) : null
  const modo = link.imagem_modo === 'banner' ? 'banner' : 'icone'

  useEffect(() => {
    if (focar && tituloRef.current) { tituloRef.current.focus(); onFocado() }
  }, [focar]) // eslint-disable-line react-hooks/exhaustive-deps

  function digitarUrl(v) {
    setUrlTexto(v)
    if (!v.trim()) { setUrlInvalida(false); onMudar({ url: null }); return }
    const url = completarUrlLink(v)
    setUrlInvalida(!url)
    if (url) onMudar({ url })
  }

  // imagem do link (migration_042): ícone pequeno → até 512px; banner → como a capa
  async function escolherImagem(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviando(true)
    const url = await enviarImagem(file, { empresaId, prefixo: 'link', comprimir: modo === 'banner' ? comprimirCapa : comprimirFoto, toast })
    setEnviando(false)
    if (!url) return
    onImagemEnviada(url)
    onMudar({ imagem_url: url, imagem_modo: modo })
  }

  const aviso = !link.titulo.trim() ? 'Sem título, o link não aparece na página.'
    : link.tipo === 'link' && !urlTexto.trim() ? 'Sem endereço, o link não aparece na página.'
    : link.tipo === 'formulario' && !form ? 'Escolha um formulário.'
    : link.tipo === 'formulario' && !form.ativo ? 'Formulário inativo: o link não aparece na página.'
    : null

  return (
    <div
      className={['mp-link-card', arrastando ? 'dragging' : '', !link.ativo ? 'inativo' : '',
        sobre === 'before' ? 'drag-over-before' : '', sobre === 'after' ? 'drag-over-after' : ''].filter(Boolean).join(' ')}
      draggable={!off && armado}
      onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      onDragEnd={e => { setArmado(false); onDragEnd(e) }}
    >
      {!off && (
        <div className="fm-campo-handle">
          <span className="fm-grip" onMouseDown={() => setArmado(true)} onMouseUp={() => setArmado(false)} title="Arraste para reordenar" aria-hidden="true"><IconGrip /></span>
          <button type="button" className="fm-mover" onClick={() => onMover(-1)} disabled={indice === 0} aria-label="Mover link para cima" title="Mover para cima">
            <IconChevronDown style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button type="button" className="fm-mover" onClick={() => onMover(1)} disabled={indice === total - 1} aria-label="Mover link para baixo" title="Mover para baixo">
            <IconChevronDown />
          </button>
        </div>
      )}
      <div className="mp-link-corpo">
        <div className="mp-link-linha">
          <span className="mp-link-tipo">{link.tipo === 'formulario' ? 'Formulário' : 'Link'}</span>
          <input
            ref={tituloRef}
            className="fm-label-input mp-link-titulo" value={link.titulo} disabled={off} maxLength={TITULO_LINK_MAX}
            placeholder="Título do botão" aria-label={`Título do link ${indice + 1}`}
            onChange={e => onMudar({ titulo: e.target.value })}
          />
        </div>
        {link.tipo === 'link' ? (
          <input
            className={`fm-pos-input mp-link-url${urlInvalida ? ' invalido' : ''}`} value={urlTexto} disabled={off}
            placeholder="seusite.com.br, wa.me/55…, mailto:…" aria-label={`Endereço do link ${indice + 1}`}
            aria-invalid={urlInvalida || undefined} onChange={e => digitarUrl(e.target.value)}
          />
        ) : (
          <select
            className="fm-tipo mp-link-form" value={link.formulario_id || ''} disabled={off}
            aria-label={`Formulário do link ${indice + 1}`}
            onChange={e => {
              const f = formularios.find(x => x.id === e.target.value)
              onMudar({ formulario_id: f?.id || null, ...(f && !link.titulo.trim() ? { titulo: f.nome.slice(0, TITULO_LINK_MAX) } : {}) })
            }}
          >
            {!form && <option value="">Escolha um formulário</option>}
            {formularios.map(f => <option key={f.id} value={f.id}>{f.nome}{f.ativo ? '' : ' (inativo)'}</option>)}
          </select>
        )}
        <div className="mp-link-imagem">
          {link.imagem_url && <img className={`mp-link-imagem-mini mp-link-imagem-mini--${modo}`} src={link.imagem_url} alt="" />}
          {!off && (
            <>
              <input ref={arquivoRef} type="file" accept={Object.keys(TIPOS_IMAGEM).join(',')} hidden onChange={escolherImagem} aria-label={`Imagem do link ${indice + 1}`} />
              <button type="button" className="fm-link-btn" onClick={() => arquivoRef.current?.click()} disabled={enviando}>
                {enviando ? 'Enviando…' : link.imagem_url ? 'Trocar imagem' : '+ Imagem'}
              </button>
            </>
          )}
          {link.imagem_url && (
            <>
              <Segmentos rotulo={`Modo da imagem do link ${indice + 1}`} valor={modo} opcoes={MODO_IMAGEM} disabled={off} onChange={v => onMudar({ imagem_modo: v })} />
              {!off && <button type="button" className="fm-link-btn" onClick={() => onMudar({ imagem_url: null, imagem_modo: null })} disabled={enviando}>Remover imagem</button>}
            </>
          )}
        </div>
        {urlInvalida && <span className="fm-publico-aviso" role="alert">Endereço inválido: use um site (https://…), mailto: ou tel:.</span>}
        {!urlInvalida && aviso && link.ativo && <span className="fm-publico-aviso">{aviso}</span>}
      </div>
      <div className="mp-link-acoes">
        <FmSwitch ligado={link.ativo} disabled={off} rotulo={link.ativo ? `Desativar link ${indice + 1}` : `Ativar link ${indice + 1}`} onChange={v => onMudar({ ativo: v })} />
        {!off && (
          <button type="button" className="fm-remover" onClick={onRemover} aria-label={`Excluir link ${indice + 1}`} title="Excluir link">
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  )
}
