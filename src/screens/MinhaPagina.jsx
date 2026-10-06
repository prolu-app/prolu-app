// Editor da Minha Página (/minha-pagina, migration_041): à esquerda a
// configuração em abas, à direita a prévia ao vivo (o mesmo PaginaView da
// página pública, com os dados da tela). Configuração em
// empresas.pagina_config (grava 800 ms depois da última mudança); links em
// pagina_links, cada um gravado sozinho (inserir / alterar / excluir / ordem).
// prolu_admin visitando outro escritório só lê (RLS da migration_041).

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { FmSwitch } from './Formularios.jsx'
import { Cor, Linha, Segmentos } from './FormularioAparencia.jsx'
import PaginaView from '../components/minhapagina/PaginaView.jsx'
import FundoSelector from '../components/minhapagina/FundoSelector.jsx'
import { IconChevronDown, IconCopy, IconGrip, IconPlus, IconTrash } from '../components/Icons.jsx'
import { comprimirCapa, comprimirFoto } from '../utils/comprimirImagem.js'
import { slugReservado } from '../utils/slug.js'
import {
  PAGINA_PADRAO, NOME_MAX, BIO_MAX, TITULO_LINK_MAX, FONTES,
  normalizarPagina, completarUrlLink, urlPaginaPublica,
} from '../utils/paginaConfig.js'
import './Formularios.css'
import './MinhaPagina.css'

const ABAS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'links', label: 'Links' },
  { id: 'botoes', label: 'Botões' },
  { id: 'fundo', label: 'Fundo' },
  { id: 'texto', label: 'Texto' },
  { id: 'geral', label: 'Geral' },
]
const ATRASO = 800

const FORMATO_FOTO = [{ value: 'quadrado', label: 'Quadrado' }, { value: 'arredondado', label: 'Arredondado' }, { value: 'redondo', label: 'Redondo' }]
const ESTILO_BOTAO = [{ value: 'solido', label: 'Sólido' }, { value: 'contorno', label: 'Contorno' }]
const ARREDONDAMENTO = [{ value: 'none', label: 'Reto' }, { value: 'sm', label: 'P' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'G' }, { value: 'full', label: 'Pílula' }]
const SOMBRA = [{ value: 'none', label: 'Nenhuma' }, { value: 'soft', label: 'Suave' }, { value: 'strong', label: 'Forte' }, { value: 'hard', label: 'Marcada' }]
const ESPESSURA = [{ value: 1, label: '1px' }, { value: 2, label: '2px' }, { value: 3, label: '3px' }]
const MODO_IMAGEM = [{ value: 'icone', label: 'Ícone' }, { value: 'banner', label: 'Banner' }]

const BUCKET = 'pagina-assets'
const TIPOS_IMAGEM = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
function caminhoNoBucket(url) {
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const i = (url || '').indexOf(marca)
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split('?')[0]) : null
}
const apagarDoBucket = url => { const c = caminhoNoBucket(url); if (c) supabase.storage.from(BUCKET).remove([c]) } // melhor esforço

// valida, comprime e envia para <empresa>/<prefixo>-<data>.<ext>; devolve a URL pública
// (ou null, já avisando) — usado pela foto, pelo banner e pela imagem de cada link
async function enviarImagem(file, { empresaId, prefixo, comprimir, toast }) {
  if (!TIPOS_IMAGEM[file.type]) { toast('Use uma imagem JPG, PNG, WEBP ou GIF'); return null }
  if (file.size > 10 * 1024 * 1024) { toast('Imagem muito grande — máximo 10 MB'); return null }
  const pronto = await comprimir(file).catch(() => file)
  const caminho = `${empresaId}/${prefixo}-${Date.now()}.${TIPOS_IMAGEM[pronto.type]}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, pronto, { contentType: pronto.type, cacheControl: '31536000', upsert: false })
  if (error) { console.error('[minha-pagina] upload', error); toast('Não foi possível enviar a imagem'); return null }
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
}

// Texto que grava sozinho 800 ms depois da última tecla (e na saída do campo).
// Mostra o que foi digitado; só aceita o valor de fora quando não está em foco.
function TextoAtrasado({ valor, onSalvar, onDigitar, multilinha, inputRef, ...resto }) {
  const [texto, setTexto] = useState(valor)
  const timer = useRef(null)
  const ultimo = useRef(valor)
  const focado = useRef(false)
  const salvarRef = useRef(onSalvar)
  salvarRef.current = onSalvar

  useEffect(() => { if (!focado.current) { setTexto(valor); ultimo.current = valor } }, [valor])
  function descarregar(v) {
    clearTimeout(timer.current)
    timer.current = null
    if (v !== ultimo.current) { ultimo.current = v; salvarRef.current(v) }
  }
  function mudar(v) {
    setTexto(v)
    onDigitar?.(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => descarregar(v), ATRASO)
  }
  // saiu da tela com texto pendente: grava na hora
  const textoRef = useRef(texto)
  textoRef.current = texto
  useEffect(() => () => { if (timer.current) descarregar(textoRef.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const props = {
    ...resto,
    ref: inputRef,
    value: texto,
    onChange: e => mudar(e.target.value),
    onFocus: () => { focado.current = true },
    onBlur: () => { focado.current = false; descarregar(texto) },
  }
  return multilinha ? <textarea {...props} /> : <input {...props} />
}

function UploadPagina({ url, rotulo, empresaId, prefixo, comprimir, redonda, off, onSalvar }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [enviando, setEnviando] = useState(false)

  async function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviando(true)
    const publicUrl = await enviarImagem(file, { empresaId, prefixo, comprimir, toast })
    if (!publicUrl) { setEnviando(false); return }
    const anterior = url
    const ok = await onSalvar(publicUrl)
    setEnviando(false)
    if (!ok) { apagarDoBucket(publicUrl); return }
    toast('Imagem salva')
    apagarDoBucket(anterior)
  }

  async function remover() {
    const anterior = url
    if (await onSalvar(null)) { toast('Imagem removida'); apagarDoBucket(anterior) }
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
          {url && <button type="button" className="fm-link-btn" onClick={remover} disabled={enviando}>Remover</button>}
        </div>
      )}
    </div>
  )
}

export default function MinhaPagina() {
  const { activeEmpresaId, user } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(a => a.id === params.get('aba')) ? params.get('aba') : 'perfil'
  const podeEditar = activeEmpresaId != null && activeEmpresaId === user?.empresaId
  const off = !podeEditar

  const [estado, setEstado] = useState('carregando') // carregando | pronto | erro
  const [empresa, setEmpresa] = useState(null) // { nome, slug }
  const [config, setConfig] = useState(PAGINA_PADRAO)
  const [links, setLinks] = useState([])
  const [formularios, setFormularios] = useState([])

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
    setEmpresa({ nome: emp.data.nome, slug: emp.data.slug })
    setConfig(normalizarPagina(emp.data.pagina_config))
    setLinks(lks.data || [])
    setFormularios(frm.data || [])
    setEstado('pronto')
  }

  // ── configuração: grava 800 ms depois da última mudança ──
  const pendente = useRef(null) // { timer, valor }
  const configRef = useRef(config)
  configRef.current = config
  const empresaRef = useRef(activeEmpresaId)
  empresaRef.current = activeEmpresaId

  async function gravarConfig(valor) {
    const { data, error } = await supabase.from('empresas')
      .update({ pagina_config: normalizarPagina(valor) }).eq('id', empresaRef.current).select('id')
    if (error || !data?.length) {
      console.error('[minha-pagina] salvar', error)
      toast('Não foi possível salvar a página')
      return false
    }
    return true
  }

  function mudar(patch) {
    if (off) return
    const novo = { ...configRef.current, ...patch }
    configRef.current = novo
    setConfig(novo)
    clearTimeout(pendente.current?.timer)
    pendente.current = { valor: novo, timer: setTimeout(() => { pendente.current = null; gravarConfig(novo) }, ATRASO) }
  }

  // interruptores e imagens: gravam na hora (junto com o que estiver pendente)
  async function mudarAgora(patch) {
    if (off) return false
    clearTimeout(pendente.current?.timer)
    pendente.current = null
    const novo = { ...configRef.current, ...patch }
    configRef.current = novo
    setConfig(novo)
    return gravarConfig(novo)
  }

  useEffect(() => () => {
    if (!pendente.current) return
    clearTimeout(pendente.current.timer)
    gravarConfig(pendente.current.valor)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── links: cada um gravado sozinho ──
  const [focoLink, setFocoLink] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null) // { id, pos: 'before' | 'after' }

  async function adicionarLink(tipo) {
    const form = tipo === 'formulario' ? (formularios.find(f => f.ativo) || formularios[0]) : null
    const { data, error } = await supabase.from('pagina_links')
      .insert({
        empresa_id: activeEmpresaId, ordem: links.length, tipo,
        titulo: form ? form.nome.slice(0, TITULO_LINK_MAX) : '', formulario_id: form?.id || null,
      })
      .select('*').single()
    if (error || !data) { console.error('[minha-pagina] adicionar link', error); toast('Não foi possível adicionar o link'); return }
    setLinks(prev => [...prev, data])
    setFocoLink(data.id)
  }

  async function salvarLink(id, patch) {
    setLinks(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
    const { error } = await supabase.from('pagina_links').update(patch).eq('id', id)
    if (error) { console.error('[minha-pagina] salvar link', error); toast('Não foi possível salvar o link'); return false }
    return true
  }

  async function removerLink(id) {
    const anterior = links
    const restantes = links.filter(l => l.id !== id).map((l, i) => ({ ...l, ordem: i }))
    setLinks(restantes)
    const { error } = await supabase.from('pagina_links').delete().eq('id', id)
    if (error) { setLinks(anterior); toast('Não foi possível excluir o link'); return }
    apagarDoBucket(anterior.find(l => l.id === id)?.imagem_url)
    await gravarOrdem(anterior, restantes)
    toast('Link excluído')
  }

  async function gravarOrdem(antes, depois) {
    const mudaram = depois.filter(l => antes.find(x => x.id === l.id)?.ordem !== l.ordem)
    const res = await Promise.all(mudaram.map(l => supabase.from('pagina_links').update({ ordem: l.ordem }).eq('id', l.id)))
    if (res.some(r => r.error)) toast('Não foi possível salvar a ordem dos links')
  }

  function mover(deId, paraId, pos) {
    const lista = [...links]
    const de = lista.findIndex(l => l.id === deId)
    if (de < 0) return
    const [item] = lista.splice(de, 1)
    let para = lista.findIndex(l => l.id === paraId)
    if (para < 0) return
    if (pos === 'after') para += 1
    lista.splice(para, 0, item)
    const nova = lista.map((l, i) => ({ ...l, ordem: i }))
    setLinks(nova)
    gravarOrdem(links, nova)
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
  const enderecoReservado = slugReservado(empresa.slug)
  // prévia: o que a página pública mostraria (só ativos; formulário inativo some)
  const linksPrevia = links.filter(l => l.ativo).map(l => {
    const f = l.tipo === 'formulario' ? formularios.find(x => x.id === l.formulario_id) : null
    return { id: l.id, tipo: l.tipo, titulo: l.titulo, url: l.url, slug_formulario: f?.ativo ? f.slug : null, estilo: l.estilo, imagem_url: l.imagem_url, imagem_modo: l.imagem_modo }
  })

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Minha Página</div>
          <div className="page-sub">Página pública do escritório com os seus links — para a bio do Instagram, o WhatsApp e onde mais quiser.</div>
        </div>
        {config.publicada && !enderecoReservado && (
          <a className="btn-cancel mp-abrir" href={urlPublica} target="_blank" rel="noopener noreferrer">Abrir página</a>
        )}
      </div>

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
                onSalvar={v => mudarAgora({ foto_perfil: v })}
              />
            </Linha>
            <Linha rotulo="Formato da foto">
              <Segmentos rotulo="Formato da foto de perfil" valor={config.foto_perfil_formato} opcoes={FORMATO_FOTO} disabled={off} onChange={v => mudar({ foto_perfil_formato: v })} />
            </Linha>
            <Linha rotulo="Banner" dica="Opcional, no topo. Proporção 3:1 (ex.: 1200×400 px).">
              <UploadPagina
                url={config.banner_url} rotulo="Banner" empresaId={activeEmpresaId} prefixo="banner"
                comprimir={comprimirCapa} off={off} onSalvar={v => mudarAgora({ banner_url: v })}
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
                  onSalvar={patch => salvarLink(l.id, patch)} onRemover={() => removerLink(l.id)}
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
                  <Cor rotulo="Cor dos botões" valor={config.botao_cor} disabled={off} onChange={v => mudar({ botao_cor: v })} />
                </Linha>
                <Linha rotulo="Cor do texto">
                  <Cor rotulo="Cor do texto dos botões" valor={config.botao_cor_texto} disabled={off} onChange={v => mudar({ botao_cor_texto: v })} />
                </Linha>
              </>
            ) : (
              <>
                <Linha rotulo="Cor do contorno">
                  <Cor rotulo="Cor do contorno dos botões" valor={config.botao_cor_contorno} disabled={off} onChange={v => mudar({ botao_cor_contorno: v })} />
                </Linha>
                <Linha rotulo="Cor do texto">
                  <Cor rotulo="Cor do texto dos botões com contorno" valor={config.botao_cor_texto_contorno || config.botao_cor_contorno} disabled={off} onChange={v => mudar({ botao_cor_texto_contorno: v })} />
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
              <Cor rotulo="Cor do nome" valor={config.cor_texto} disabled={off} onChange={v => mudar({ cor_texto: v })} />
            </Linha>
            <Linha rotulo="Cor da bio" dica="Também usada no rodapé.">
              <Cor rotulo="Cor da bio" valor={config.cor_texto_bio} disabled={off} onChange={v => mudar({ cor_texto_bio: v })} />
            </Linha>
          </section>

          {/* ── Geral ── */}
          <section role="tabpanel" id="mp-painel-geral" aria-labelledby="mp-aba-geral" hidden={aba !== 'geral'} className="fm-publico">
            <Linha rotulo="Publicada" dica={config.publicada ? 'Qualquer pessoa com o link vê a página.' : 'Enquanto não publicar, o link mostra "página não disponível".'}>
              <FmSwitch
                ligado={config.publicada} disabled={off} rotulo="Publicar a página"
                onChange={v => mudarAgora({ publicada: v }).then(ok => ok && toast(v ? 'Página publicada' : 'Página despublicada'))}
              />
              <span className="fm-status-texto">{config.publicada ? 'Publicada' : 'Não publicada'}</span>
            </Linha>
            <Linha rotulo="Rodapé">
              <FmSwitch ligado={config.rodape_prolu} disabled={off} rotulo='Mostrar "Feito com Prolu"' onChange={v => mudarAgora({ rodape_prolu: v })} />
              <span className="fm-status-texto">Mostrar "Feito com Prolu"</span>
            </Linha>
            <Linha rotulo="Link público">
              {enderecoReservado ? (
                <span className="fm-publico-aviso">
                  O endereço do escritório ({empresa.slug}) é reservado pelo Prolu. Troque em Configurações → Escritório para usar a Minha Página.
                </span>
              ) : (
                <div className="mp-link-publico">
                  <input className="fm-pos-input" readOnly value={urlPublica} aria-label="Link público da página" onFocus={e => e.target.select()} />
                  <button type="button" className="fm-embed-btn" onClick={() => navigator.clipboard?.writeText(urlPublica).then(() => toast('Link copiado'), () => toast('Não foi possível copiar'))}>
                    <IconCopy /> Copiar
                  </button>
                </div>
              )}
            </Linha>
          </section>
        </div>

        <aside className="mp-editor-previa" aria-label="Prévia da página">
          <div className="mp-previa-rotulo">Prévia</div>
          <div className="mp-previa-moldura">
            {/* normalizada como na página pública: a prévia mostra exatamente o que vai ao ar */}
            <PaginaView config={normalizarPagina(config)} links={linksPrevia} slugEscritorio={empresa.slug} escritorio={empresa.nome} previa />
          </div>
        </aside>
      </div>
    </>
  )
}

function LinkCard({
  link, indice, total, formularios, off, empresaId, focar, onFocado, onSalvar, onRemover, onMover,
  arrastando, sobre, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const tituloRef = useRef(null)
  const [armado, setArmado] = useState(false) // só arrasta pelo puxador
  const [urlInvalida, setUrlInvalida] = useState(false)
  const [tituloDigitado, setTituloDigitado] = useState(link.titulo)
  const [urlDigitada, setUrlDigitada] = useState(link.url || '')
  const [enviando, setEnviando] = useState(false)
  const toast = useToast()
  const arquivoRef = useRef(null)
  const form = link.tipo === 'formulario' ? formularios.find(f => f.id === link.formulario_id) : null
  const modo = link.imagem_modo === 'banner' ? 'banner' : 'icone'

  // imagem do link (migration_042): ícone pequeno → até 512px; banner → como a capa
  async function escolherImagem(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviando(true)
    const url = await enviarImagem(file, { empresaId, prefixo: 'link', comprimir: modo === 'banner' ? comprimirCapa : comprimirFoto, toast })
    if (!url) { setEnviando(false); return }
    const anterior = link.imagem_url
    const ok = await onSalvar({ imagem_url: url, imagem_modo: modo })
    setEnviando(false)
    if (!ok) { apagarDoBucket(url); return }
    toast('Imagem salva')
    apagarDoBucket(anterior)
  }
  async function removerImagem() {
    const anterior = link.imagem_url
    if (await onSalvar({ imagem_url: null, imagem_modo: null })) { toast('Imagem removida'); apagarDoBucket(anterior) }
  }

  useEffect(() => {
    if (focar && tituloRef.current) { tituloRef.current.focus(); onFocado() }
  }, [focar]) // eslint-disable-line react-hooks/exhaustive-deps

  function salvarUrl(digitada) {
    if (!digitada.trim()) { setUrlInvalida(false); onSalvar({ url: null }); return }
    const url = completarUrlLink(digitada)
    setUrlInvalida(!url)
    if (url && url !== link.url) onSalvar({ url })
  }

  // avisos seguem o que está digitado (não só o que já foi gravado): sumir na
  // saída do campo deslocaria o botão "Adicionar" no meio do clique
  const aviso = !tituloDigitado.trim() ? 'Sem título, o link não aparece na página.'
    : link.tipo === 'link' && !urlDigitada.trim() ? 'Sem endereço, o link não aparece na página.'
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
          <TextoAtrasado
            inputRef={tituloRef}
            className="fm-label-input mp-link-titulo" valor={link.titulo} disabled={off} maxLength={TITULO_LINK_MAX}
            placeholder="Título do botão" aria-label={`Título do link ${indice + 1}`}
            onSalvar={v => onSalvar({ titulo: v.slice(0, TITULO_LINK_MAX) })} onDigitar={setTituloDigitado}
          />
        </div>
        {link.tipo === 'link' ? (
          <TextoAtrasado
            className={`fm-pos-input mp-link-url${urlInvalida ? ' invalido' : ''}`} valor={link.url || ''} disabled={off}
            placeholder="seusite.com.br, wa.me/55…, mailto:…" aria-label={`Endereço do link ${indice + 1}`}
            aria-invalid={urlInvalida || undefined} onSalvar={salvarUrl} onDigitar={setUrlDigitada}
          />
        ) : (
          <select
            className="fm-tipo mp-link-form" value={link.formulario_id || ''} disabled={off}
            aria-label={`Formulário do link ${indice + 1}`}
            onChange={e => {
              const f = formularios.find(x => x.id === e.target.value)
              onSalvar({ formulario_id: f?.id || null, ...(f && !link.titulo.trim() ? { titulo: f.nome.slice(0, TITULO_LINK_MAX) } : {}) })
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
              <Segmentos rotulo={`Modo da imagem do link ${indice + 1}`} valor={modo} opcoes={MODO_IMAGEM} disabled={off} onChange={v => onSalvar({ imagem_modo: v })} />
              {!off && <button type="button" className="fm-link-btn" onClick={removerImagem} disabled={enviando}>Remover imagem</button>}
            </>
          )}
        </div>
        {urlInvalida && <span className="fm-publico-aviso" role="alert">Endereço inválido: use um site (https://…), mailto: ou tel:.</span>}
        {!urlInvalida && aviso && link.ativo && <span className="fm-publico-aviso">{aviso}</span>}
      </div>
      <div className="mp-link-acoes">
        <FmSwitch ligado={link.ativo} disabled={off} rotulo={link.ativo ? `Desativar link ${indice + 1}` : `Ativar link ${indice + 1}`} onChange={v => onSalvar({ ativo: v })} />
        {!off && (
          <button type="button" className="fm-remover" onClick={onRemover} aria-label={`Excluir link ${indice + 1}`} title="Excluir link">
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  )
}
