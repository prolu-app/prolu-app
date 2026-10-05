import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { estiloParaPagina, textoDoBotao, SUCESSO_TITULO_PADRAO, sucessoTextoPadrao, URL_REDIRECT_RE, embedDoYoutube } from '../utils/formularioEstilo.js'
import { sanitizarIntro } from '../utils/introHtml.js'
import FormSelectField from '../components/FormSelectField.jsx'
import FormEscolhaField from '../components/FormEscolhaField.jsx'
import './FormularioPublico.css'

// telefone com país/máscara (react-phone-number-input + bandeiras, ~120 KB gz): só
// baixa quando o formulário tem campo de telefone — o resto do app não carrega
const FormTelefoneField = lazy(() => import('../components/FormTelefoneField.jsx'))
const carregarTelefone = () => import('react-phone-number-input')

// Página pública /e/:slugEscritorio/:slugFormulario — sem login. Carrega e envia SEMPRE pela Edge
// Function `formulario-publico` (nenhuma tabela tem acesso anon). A
// validação aqui é só conforto: a função valida de novo antes de gravar.
//
// ?embed=1 → modo "com estilo do Prolu" da incorporação: a página roda dentro
// de um iframe no site do escritório e avisa a altura ao embed.js para o
// iframe crescer sem barra de rolagem.
//
// Aparência: painel Estilo do editor (formularios.estilo → utils/formularioEstilo.js),
// aplicada aqui e, portanto, no iframe. Depois do envio: mensagem (textos
// do escritório ou padrão) ou redirecionamento, conforme a resposta da função.
//
// Classes prolu-form__* são as mesmas do embed cru (public/embed.js), onde
// são contrato público para o CSS do site — não renomear.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// vídeo do YouTube responsivo (16:9)
function Video({ id, titulo }) {
  return (
    <div className="prolu-form__video">
      <iframe
        src={embedDoYoutube(id)} title={`Vídeo — ${titulo}`} loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen
      />
    </div>
  )
}

// telefonePossivel: isPossiblePhoneNumber da lib (carregada sob demanda em enviar)
function validar(campo, valor, telefonePossivel) {
  // múltipla escolha: lista; "Outro:" em branco conta como resposta (não bloqueia)
  if (Array.isArray(valor)) return !valor.length && campo.obrigatorio ? 'Campo obrigatório.' : null
  const v = (valor || '').trim()
  if (!v) return campo.obrigatorio ? 'Campo obrigatório.' : null
  if (campo.tipo === 'email' && !EMAIL_RE.test(v)) return 'E-mail inválido.'
  if (campo.tipo === 'phone') {
    // E.164 do campo com país (+5511…): confere se é um número possível para o país
    const possivel = v.startsWith('+') && telefonePossivel ? telefonePossivel(v) : /^\d{8,15}$/.test(v.replace(/\D/g, ''))
    if (!possivel) return 'Telefone inválido.'
  }
  if (campo.tipo === 'number' && !Number.isFinite(Number(v.replace(',', '.')))) return 'Informe um número.'
  return null
}

async function chamar(body) {
  const { data, error } = await supabase.functions.invoke('formulario-publico', { body })
  if (!error) return { data }
  // respostas não-2xx trazem o JSON da função em error.context (Response)
  let payload = null
  try { payload = await error.context?.json() } catch { /* sem corpo */ }
  return { error: payload || { error: 'Não foi possível conectar. Tente novamente.' }, status: error.context?.status }
}

// mensagens para o embed.js na página que contém o iframe
// texto puro da introdução (HTML já sanitizado) para og:description: blocos
// separados por espaço, até 160 caracteres + "..." quando corta
const DESCRICAO_MAX = 160
function textoDaIntro(html) {
  if (!html) return ''
  const tpl = document.createElement('template') // inerte: não carrega nada
  tpl.innerHTML = html.replace(/<\/(p|li|h1|h2)>|<br\s*\/?>/gi, ' $&')
  const texto = tpl.content.textContent.replace(/\s+/g, ' ').trim()
  return texto.length > DESCRICAO_MAX ? texto.slice(0, DESCRICAO_MAX).trimEnd() + '...' : texto
}

function avisarSite(tipo, dados) {
  if (window.parent !== window) window.parent.postMessage({ tipo: `prolu-form:${tipo}`, ...dados }, '*')
}

export default function FormularioPublico() {
  // o slug do formulário é único só dentro do escritório (migration_036): a função busca pelo par
  const { slugEscritorio = '', slugFormulario = '' } = useParams()
  const slug = slugFormulario // identifica o formulário nas mensagens para o embed.js
  const slugs = { slug_escritorio: slugEscritorio, slug_formulario: slugFormulario }
  const embed = new URLSearchParams(window.location.search).get('embed') === '1'
  const [estado, setEstado] = useState('carregando') // carregando | pronto | indisponivel | redirecionando | enviado
  const [form, setForm] = useState(null)
  const [campos, setCampos] = useState([])
  const [valores, setValores] = useState({})
  const [erros, setErros] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [erroGeral, setErroGeral] = useState(null)
  const [honeypot, setHoneypot] = useState('')
  const [sucesso, setSucesso] = useState(null) // textos da mensagem final vindos do envio
  const refs = useRef({})
  const paginaRef = useRef(null)
  const visual = estiloParaPagina(form?.estilo)
  const ap = form?.apresentacao // logo, capa, introdução, vídeo (migration_029)
  const introHtml = useMemo(() => (ap?.intro ? sanitizarIntro(ap.intro) : ''), [ap?.intro])
  // título visível: titulo_pagina || escritório (resolvido na função); nome é interno
  // topo: nome do escritório + título da página (opcional, sem reserva), cada um com liga/desliga; nome/descrição são internos.
  // Título igual ao nome do escritório não se repete (e cobre a função antiga, que usava o escritório como reserva).
  const mostrarEscritorio = !!form?.escritorio && form.mostrar_escritorio !== false // liga/desliga (migration_032)
  const titulo = form?.titulo && !(mostrarEscritorio && form.titulo === form.escritorio) ? form.titulo : null

  useEffect(() => {
    let vivo = true
    chamar({ acao: 'carregar', ...slugs }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data?.formulario) { setEstado('indisponivel'); return }
      setForm(data.formulario)
      setCampos(data.campos || [])
      setEstado('pronto')
      document.title = [...new Set([data.formulario.titulo, data.formulario.escritorio].filter(Boolean))].join(' · ') || 'Formulário'
    })
    return () => { vivo = false }
  }, [slugEscritorio, slugFormulario]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open Graph / Twitter para o card do link compartilhado. SPA: só vale para
  // quem executa JS (Google etc.) — WhatsApp/iMessage leem o HTML cru e
  // precisariam de pré-renderização no servidor. Sai tudo ao desmontar.
  useEffect(() => {
    if (!form) return
    const tituloOg = form.titulo || form.escritorio || 'Formulário'
    const descricao = textoDaIntro(introHtml)
    const tags = [
      ['property', 'og:type', 'website'],
      ['property', 'og:url', `${window.location.origin}/e/${encodeURIComponent(slugEscritorio)}/${encodeURIComponent(slugFormulario)}`],
      ['property', 'og:title', tituloOg],
      ['property', 'og:description', descricao],
      ['property', 'og:image', ap?.capa],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', tituloOg],
      ['name', 'twitter:description', descricao],
      ['name', 'twitter:image', ap?.capa],
    ].filter(([, , valor]) => valor) // sem introdução/capa, a tag fica de fora
    const criadas = tags.map(([attr, chave, valor]) => {
      const meta = document.createElement('meta')
      meta.setAttribute(attr, chave)
      meta.setAttribute('content', valor)
      document.head.appendChild(meta)
      return meta
    })
    return () => criadas.forEach(m => m.remove())
  }, [form, introHtml, ap?.capa, slugEscritorio, slugFormulario])

  // embed: body/#root transparentes (index.css pinta o body) e altura para o site
  useEffect(() => {
    if (!embed) return
    document.documentElement.classList.add('prolu-embed')
    const el = paginaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => avisarSite('altura', { slug, altura: Math.ceil(el.getBoundingClientRect().height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [embed, slug])

  function focarPrimeiroErro(errosAtuais) {
    const primeiro = campos.find(c => errosAtuais[c.id])
    refs.current[primeiro?.id]?.focus()
  }

  async function enviar(e) {
    e.preventDefault()
    if (enviando) return
    const novosErros = {}
    // já baixada pelo campo de telefone na tela; se falhar, valida só pelos dígitos
    const telefonePossivel = campos.some(c => c.tipo === 'phone')
      ? await carregarTelefone().then(m => m.isPossiblePhoneNumber, () => null)
      : null
    campos.forEach(c => { const m = validar(c, valores[c.id], telefonePossivel); if (m) novosErros[c.id] = m })
    setErros(novosErros)
    setErroGeral(null)
    if (Object.keys(novosErros).length) { focarPrimeiroErro(novosErros); return }

    setEnviando(true)
    const { data, error } = await chamar({ acao: 'enviar', ...slugs, respostas: valores, _site: honeypot })
    setEnviando(false)
    if (error) {
      if (error.erros) { setErros(error.erros); focarPrimeiroErro(error.erros) }
      setErroGeral(error.error || 'Não foi possível enviar. Tente novamente.')
      return
    }
    const url = typeof data?.redirecionar === 'string' && URL_REDIRECT_RE.test(data.redirecionar) ? data.redirecionar : null
    if (url) { redirecionar(url); return }
    setSucesso(data?.sucesso || null)
    setEstado('enviado')
    // no iframe quem rola é o site (embed.js traz o formulário para a tela)
    if (embed) avisarSite('enviado', { slug })
    else window.scrollTo({ top: 0 })
  }

  // Página de obrigado do escritório (Google Tag / Pixel ficam lá). No iframe
  // quem navega é o site: o embed.js recebe a URL e troca a página inteira.
  // Sem o embed.js colado, tenta navegar o topo direto; se o navegador
  // bloquear, mostra a mensagem padrão — o envio já foi gravado.
  function redirecionar(url) {
    setEstado('redirecionando')
    if (!embed) { window.location.assign(url); return }
    avisarSite('redirecionar', { slug, url })
    setTimeout(() => {
      try { window.top.location.href = url } catch {
        setEstado('enviado')
      }
    }, 2000)
  }

  function alterar(campoId, v) {
    setValores(prev => ({ ...prev, [campoId]: v }))
    if (erros[campoId]) setErros(prev => { const n = { ...prev }; delete n[campoId]; return n })
  }

  return (
    <div ref={paginaRef} className={`prolu-pagina ${visual.classes}${embed ? ' prolu-pagina--embed' : ''}${ap?.capa ? ' prolu-pagina--com-capa' : ''}`} style={visual.vars}>
      {/* capa e logo também na mensagem final: a marca continua na tela */}
      {ap?.capa && <img className="prolu-form__capa" src={ap.capa} alt="" />}
      <main className="prolu-form" data-estado={estado}>
        {ap?.logo && <img className="prolu-form__logo" src={ap.logo} alt={form.escritorio ? `Logo ${form.escritorio}` : ''} />}
        {estado === 'carregando' && <p className="prolu-form__status">Carregando…</p>}
        {estado === 'redirecionando' && <p className="prolu-form__status" role="status">Enviado! Redirecionando…</p>}

        {estado === 'indisponivel' && (
          <div className="prolu-form__mensagem prolu-form__mensagem--indisponivel">
            <h1 className="prolu-form__titulo">Formulário indisponível</h1>
            <p className="prolu-form__texto">Este formulário não existe ou não está mais recebendo respostas.</p>
          </div>
        )}

        {estado === 'enviado' && (
          <div className="prolu-form__mensagem prolu-form__mensagem--sucesso" role="status">
            <div className="prolu-form__icone-ok" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <h1 className="prolu-form__titulo">{sucesso?.titulo || SUCESSO_TITULO_PADRAO}</h1>
            <p className="prolu-form__texto">{sucesso?.texto || sucessoTextoPadrao(form?.escritorio)}</p>
            {sucesso?.botao && URL_REDIRECT_RE.test(sucesso.botao.url) && (
              <a className="prolu-form__obrigado-botao" href={sucesso.botao.url} target="_blank" rel="noopener noreferrer">{sucesso.botao.texto}</a>
            )}
          </div>
        )}

        {estado === 'pronto' && (
          <form className="prolu-form__form" onSubmit={enviar} noValidate>
            {/* nome do escritório sempre; título da página em destaque abaixo, se houver */}
            {mostrarEscritorio && <div className="prolu-form__escritorio">{form.escritorio}</div>}
            {titulo && <h1 className="prolu-form__titulo">{titulo}</h1>}
            {ap?.video_id && ap.video_posicao === 'antes' && <Video id={ap.video_id} titulo={titulo || form.escritorio || 'formulário'} />}
            {/* HTML do editor rico, sempre limpo antes de entrar na página (utils/introHtml.js) */}
            {introHtml && <div className="prolu-form__intro" dangerouslySetInnerHTML={{ __html: introHtml }} />}
            {ap?.video_id && ap.video_posicao !== 'antes' && <Video id={ap.video_id} titulo={titulo || form.escritorio || 'formulário'} />}

            {/* honeypot: invisível pra pessoas; robôs que preenchem são descartados na função */}
            <div className="prolu-form__hp" aria-hidden="true">
              <label>Site<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} /></label>
            </div>

            <div className="prolu-form__campos">
              {campos.map(c => {
                const id = `prolu-${c.id}`
                const comum = {
                  id,
                  ref: el => { refs.current[c.id] = el },
                  value: valores[c.id] || '',
                  onChange: e => alterar(c.id, e.target.value),
                  'aria-invalid': !!erros[c.id],
                  'aria-describedby': erros[c.id] ? `${id}-erro` : undefined,
                  required: c.obrigatorio,
                  className: 'prolu-form__input',
                }
                const classes = ['prolu-form__campo', `prolu-form__campo--${c.tipo}`]
                if (c.obrigatorio) classes.push('prolu-form__campo--obrigatorio')
                if (erros[c.id]) classes.push('prolu-form__campo--erro')
                return (
                  <div className={classes.join(' ')} data-campo={c.id} data-tipo={c.tipo} key={c.id}>
                    {/* grupo de opções (radio/checkbox): rótulo do grupo, não de um input */}
                    {c.tipo === 'radio' || c.tipo === 'checkbox' ? (
                      <span className="prolu-form__label" id={`${id}-rotulo`}>
                        {c.label || 'Pergunta'}
                        {c.obrigatorio && <span className="prolu-form__asterisco" aria-hidden="true"> *</span>}
                      </span>
                    ) : (
                      <label className="prolu-form__label" htmlFor={id}>
                        {c.label || 'Pergunta'}
                        {c.obrigatorio && <span className="prolu-form__asterisco" aria-hidden="true"> *</span>}
                      </label>
                    )}
                    {c.tipo === 'radio' || c.tipo === 'checkbox' ? (
                      <FormEscolhaField
                        id={id} tipo={c.tipo} opcoes={c.opcoes || []} outro={!!c.outro}
                        valor={valores[c.id] ?? (c.tipo === 'checkbox' ? [] : '')}
                        onChange={v => alterar(c.id, v)}
                        rotuloId={`${id}-rotulo`}
                        invalido={!!erros[c.id]} describedBy={erros[c.id] ? `${id}-erro` : undefined}
                        primeiroRef={el => { refs.current[c.id] = el }}
                      />
                    ) : c.tipo === 'textarea' ? (
                      <textarea rows={4} maxLength={5000} {...comum} />
                    ) : c.tipo === 'select' ? (
                      <FormSelectField
                        id={id} valor={valores[c.id] || ''} opcoes={c.opcoes} obrigatorio={c.obrigatorio}
                        rotulo={c.label || 'Pergunta'} inline={embed}
                        invalido={!!erros[c.id]} describedBy={erros[c.id] ? `${id}-erro` : undefined}
                        onChange={v => alterar(c.id, v)} botaoRef={el => { refs.current[c.id] = el }}
                      />
                    ) : c.tipo === 'phone' ? (
                      <Suspense fallback={<input className="prolu-form__input" id={id} disabled aria-busy="true" placeholder="Carregando…" />}>
                        <FormTelefoneField
                          id={id} valor={valores[c.id] || ''} obrigatorio={c.obrigatorio} inline={embed}
                          invalido={!!erros[c.id]} describedBy={erros[c.id] ? `${id}-erro` : undefined}
                          onChange={v => alterar(c.id, v)} inputRef={el => { refs.current[c.id] = el }}
                        />
                      </Suspense>
                    ) : (
                      <input
                        {...comum}
                        type={c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : 'text'}
                        inputMode={c.tipo === 'number' ? 'decimal' : c.tipo === 'phone' ? 'tel' : undefined}
                        autoComplete={c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : undefined}
                        maxLength={c.tipo === 'text' ? 300 : 254}
                      />
                    )}
                    {erros[c.id] && <div className="prolu-form__erro" id={`${id}-erro`}>{erros[c.id]}</div>}
                  </div>
                )
              })}
            </div>

            {erroGeral && <p className="prolu-form__erro-geral" role="alert">{erroGeral}</p>}

            <button type="submit" className="prolu-form__enviar" disabled={enviando}>
              {enviando ? 'Enviando…' : textoDoBotao(form.estilo)}
            </button>
            <p className="prolu-form__legenda">* campos obrigatórios</p>
          </form>
        )}
      </main>
      <footer className="prolu-pagina__rodape">Feito com Prolu</footer>
    </div>
  )
}
