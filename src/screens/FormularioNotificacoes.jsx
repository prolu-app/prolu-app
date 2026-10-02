import { useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { FmSwitch } from './Formularios.jsx'

// Aba "Notificações" do editor (Fase 4, migration_034). Diferente das outras
// abas, grava só no botão "Salvar notificações" (lista de e-mails se edita
// aos poucos). Quem envia é a Edge Function formulario-notificacao, chamada
// pela formulario-publico a cada envio aceito. WhatsApp: só a interface.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_DESTINATARIOS = 10 // constraint formularios_notif_valida

const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function PainelNotificacoes({ form, podeEditar, salvarForm }) {
  const toast = useToast()
  const doBanco = () => ({
    notif_ativa: !!form.notif_ativa,
    notif_email_ativa: !!form.notif_email_ativa,
    notif_email_destinatarios: Array.isArray(form.notif_email_destinatarios) ? form.notif_email_destinatarios : [],
  })
  const [salvo, setSalvo] = useState(doBanco)
  const [cfg, setCfg] = useState(doBanco)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const off = !podeEditar
  const alterado = !iguais(cfg, salvo) || !!texto.trim()

  // adiciona o(s) e-mail(s) digitado(s); devolve a lista resultante (ou null se inválido)
  function adicionar(bruto = texto) {
    const novos = bruto.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!novos.length) return cfg.notif_email_destinatarios
    const invalido = novos.find(e => !EMAIL_RE.test(e) || e.length > 254)
    if (invalido) { setErro(`"${invalido}" não parece um e-mail válido.`); return null }
    const lista = [...new Set([...cfg.notif_email_destinatarios, ...novos])]
    if (lista.length > MAX_DESTINATARIOS) { setErro(`No máximo ${MAX_DESTINATARIOS} e-mails.`); return null }
    setCfg(c => ({ ...c, notif_email_destinatarios: lista }))
    setTexto('')
    setErro(null)
    return lista
  }

  function remover(email) {
    setCfg(c => ({ ...c, notif_email_destinatarios: c.notif_email_destinatarios.filter(e => e !== email) }))
  }

  function teclado(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); adicionar() }
    else if (e.key === 'Backspace' && !texto && cfg.notif_email_destinatarios.length) {
      remover(cfg.notif_email_destinatarios[cfg.notif_email_destinatarios.length - 1])
    }
  }

  async function salvar() {
    // e-mail digitado e ainda não confirmado com Enter entra junto
    const lista = adicionar()
    if (lista === null) return
    if (cfg.notif_ativa && cfg.notif_email_ativa && !lista.length) { setErro('Adicione pelo menos um e-mail para receber as notificações.'); return }
    const patch = { ...cfg, notif_email_destinatarios: lista.length ? lista : null, notif_whatsapp_ativa: false }
    setSalvando(true)
    const ok = await salvarForm(patch)
    setSalvando(false)
    if (!ok) return
    const novo = { ...cfg, notif_email_destinatarios: lista }
    setSalvo(novo)
    setCfg(novo)
    toast('Notificações salvas')
  }

  const desligado = !cfg.notif_ativa
  return (
    <>
      <div className="fm-painel-topo">
        <p className="fm-section-sub">Avisos a cada novo preenchimento deste formulário.</p>
      </div>
      <div className="fm-publico">
        <div className="fm-publico-row">
          <span className="fm-publico-label">Notificações</span>
          <FmSwitch ligado={cfg.notif_ativa} disabled={off} rotulo="Ativar notificações" onChange={v => setCfg(c => ({ ...c, notif_ativa: v }))} />
          <span className="fm-status-texto">{cfg.notif_ativa ? 'Ativadas' : 'Desativadas'}</span>
        </div>
      </div>

      <div className={`fm-notif-canais${desligado ? ' desligado' : ''}`} aria-disabled={desligado || undefined}>
        <div className="fm-publico">
          <div className="fm-notif-canal"><span aria-hidden="true">📧</span> E-mail</div>
          <div className="fm-publico-row">
            <span className="fm-publico-label">Notificar</span>
            <FmSwitch ligado={cfg.notif_email_ativa} disabled={off || desligado} rotulo="Notificar por e-mail" onChange={v => setCfg(c => ({ ...c, notif_email_ativa: v }))} />
            <span className="fm-status-texto">Notificar por e-mail</span>
          </div>
          <div className="fm-publico-row fm-row-topo">
            <span className="fm-publico-label">E-mails</span>
            <div className="fm-notif-emails">
              <div className={`fm-tags${erro ? ' invalido' : ''}`} onClick={e => e.currentTarget.querySelector('input')?.focus()}>
                {cfg.notif_email_destinatarios.map(email => (
                  <span className="fm-tag" key={email}>
                    {email}
                    {!off && !desligado && (
                      <button type="button" aria-label={`Remover ${email}`} onClick={e => { e.stopPropagation(); remover(email) }}>×</button>
                    )}
                  </span>
                ))}
                <input
                  type="email" inputMode="email" value={texto} disabled={off || desligado}
                  placeholder={cfg.notif_email_destinatarios.length ? '' : 'nome@escritorio.com.br'}
                  aria-label="Adicionar e-mail para notificar" aria-invalid={!!erro}
                  onChange={e => { setTexto(e.target.value); if (erro) setErro(null) }}
                  onKeyDown={teclado}
                  onBlur={() => { if (texto.trim()) adicionar() }}
                  onPaste={e => {
                    const colado = e.clipboardData.getData('text')
                    if (/[\s,;]/.test(colado.trim())) { e.preventDefault(); adicionar(colado) }
                  }}
                />
              </div>
              {erro
                ? <span className="fm-pos-erro" role="alert">{erro}</span>
                : <span className="fm-publico-dica">Digite o e-mail e aperte Enter ou vírgula. Até {MAX_DESTINATARIOS}.</span>}
            </div>
          </div>
        </div>

        <div className="fm-publico fm-notif-whatsapp">
          <div className="fm-notif-canal"><span aria-hidden="true">💬</span> WhatsApp <span className="pill pill-gray">Em breve</span></div>
          <div className="fm-publico-row">
            <span className="fm-publico-label">Notificar</span>
            <FmSwitch ligado={false} disabled rotulo="Notificar por WhatsApp (em breve)" onChange={() => {}} />
            <span className="fm-status-texto">Notificar por WhatsApp</span>
          </div>
          <div className="fm-publico-row">
            <span className="fm-publico-label">Número</span>
            <input className="fm-pos-input" disabled placeholder="(11) 99999-9999" aria-label="Número de WhatsApp (em breve)" />
          </div>
        </div>
      </div>

      {podeEditar && (
        <div className="fm-notif-acoes">
          <button className="btn-primary" onClick={salvar} disabled={salvando || !alterado}>
            {salvando ? 'Salvando…' : 'Salvar notificações'}
          </button>
          {alterado && !salvando && <span className="fm-status-texto">Alterações não salvas</span>}
        </div>
      )}
    </>
  )
}
