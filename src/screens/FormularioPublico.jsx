import { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import './FormularioPublico.css'

// Página pública /f/:slug — sem login. Carrega e envia SEMPRE pela Edge
// Function `formulario-publico` (nenhuma tabela tem acesso anon). A
// validação aqui é só conforto: a função valida de novo antes de gravar.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validar(campo, valor) {
  const v = (valor || '').trim()
  if (!v) return campo.obrigatorio ? 'Campo obrigatório.' : null
  if (campo.tipo === 'email' && !EMAIL_RE.test(v)) return 'E-mail inválido.'
  if (campo.tipo === 'phone') {
    const d = v.replace(/\D/g, '')
    if (d.length < 8 || d.length > 15) return 'Telefone inválido.'
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

export default function FormularioPublico() {
  const slug = decodeURIComponent(window.location.pathname.replace(/^\/f\//, '').split('/')[0] || '')
  const [estado, setEstado] = useState('carregando') // carregando | pronto | indisponivel | enviado
  const [form, setForm] = useState(null)
  const [campos, setCampos] = useState([])
  const [valores, setValores] = useState({})
  const [erros, setErros] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [erroGeral, setErroGeral] = useState(null)
  const [honeypot, setHoneypot] = useState('')
  const refs = useRef({})

  useEffect(() => {
    let vivo = true
    chamar({ acao: 'carregar', slug }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data?.formulario) { setEstado('indisponivel'); return }
      setForm(data.formulario)
      setCampos(data.campos || [])
      setEstado('pronto')
      document.title = data.formulario.nome
    })
    return () => { vivo = false }
  }, [slug])

  function focarPrimeiroErro(errosAtuais) {
    const primeiro = campos.find(c => errosAtuais[c.id])
    refs.current[primeiro?.id]?.focus()
  }

  async function enviar(e) {
    e.preventDefault()
    if (enviando) return
    const novosErros = {}
    campos.forEach(c => { const m = validar(c, valores[c.id]); if (m) novosErros[c.id] = m })
    setErros(novosErros)
    setErroGeral(null)
    if (Object.keys(novosErros).length) { focarPrimeiroErro(novosErros); return }

    setEnviando(true)
    const { error } = await chamar({ acao: 'enviar', slug, respostas: valores, _site: honeypot })
    setEnviando(false)
    if (error) {
      if (error.erros) { setErros(error.erros); focarPrimeiroErro(error.erros) }
      setErroGeral(error.error || 'Não foi possível enviar. Tente novamente.')
      return
    }
    setEstado('enviado')
    window.scrollTo({ top: 0 })
  }

  function alterar(campoId, v) {
    setValores(prev => ({ ...prev, [campoId]: v }))
    if (erros[campoId]) setErros(prev => { const n = { ...prev }; delete n[campoId]; return n })
  }

  return (
    <div className="fp-page">
      <main className="fp-card">
        {estado === 'carregando' && <p className="fp-status">Carregando…</p>}

        {estado === 'indisponivel' && (
          <div className="fp-center">
            <h1 className="fp-title">Formulário indisponível</h1>
            <p className="fp-sub">Este formulário não existe ou não está mais recebendo respostas.</p>
          </div>
        )}

        {estado === 'enviado' && (
          <div className="fp-center">
            <div className="fp-ok" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <h1 className="fp-title">Recebemos suas informações!</h1>
            <p className="fp-sub">
              {form?.escritorio ? `A equipe do ${form.escritorio} vai entrar em contato em breve.` : 'Em breve entraremos em contato.'}
            </p>
          </div>
        )}

        {estado === 'pronto' && (
          <form onSubmit={enviar} noValidate>
            {form.escritorio && <div className="fp-escritorio">{form.escritorio}</div>}
            <h1 className="fp-title">{form.nome}</h1>
            {form.descricao && <p className="fp-sub fp-desc">{form.descricao}</p>}

            {/* honeypot: invisível pra pessoas; robôs que preenchem são descartados na função */}
            <div className="fp-hp" aria-hidden="true">
              <label>Site<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} /></label>
            </div>

            <div className="fp-campos">
              {campos.map(c => {
                const id = `fp-${c.id}`
                const comum = {
                  id,
                  ref: el => { refs.current[c.id] = el },
                  value: valores[c.id] || '',
                  onChange: e => alterar(c.id, e.target.value),
                  'aria-invalid': !!erros[c.id],
                  'aria-describedby': erros[c.id] ? `${id}-erro` : undefined,
                  required: c.obrigatorio,
                  className: `fp-input${erros[c.id] ? ' has-error' : ''}`,
                }
                return (
                  <div className="fp-campo" key={c.id}>
                    <label className="fp-label" htmlFor={id}>
                      {c.label || 'Pergunta'}
                      {c.obrigatorio && <span className="fp-req" aria-hidden="true"> *</span>}
                    </label>
                    {c.tipo === 'textarea' ? (
                      <textarea rows={4} maxLength={5000} {...comum} />
                    ) : c.tipo === 'select' ? (
                      <select {...comum}>
                        <option value="">Selecione…</option>
                        {c.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        {...comum}
                        type={c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : 'text'}
                        inputMode={c.tipo === 'number' ? 'decimal' : c.tipo === 'phone' ? 'tel' : undefined}
                        autoComplete={c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : undefined}
                        maxLength={c.tipo === 'text' ? 300 : 254}
                      />
                    )}
                    {erros[c.id] && <div className="fp-erro" id={`${id}-erro`}>{erros[c.id]}</div>}
                  </div>
                )
              })}
            </div>

            {erroGeral && <p className="fp-erro-geral" role="alert">{erroGeral}</p>}

            <button type="submit" className="fp-enviar" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
            <p className="fp-legenda">* campos obrigatórios</p>
          </form>
        )}
      </main>
      <footer className="fp-footer">Feito com Prolu</footer>
    </div>
  )
}
