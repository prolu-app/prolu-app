import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext.jsx'
import { FmSwitch } from './Formularios.jsx'

// Aba "Notificações" do editor (Fase 4, migration_034). Diferente das outras
// abas, grava só no botão "Salvar notificações" (lista de e-mails se edita
// aos poucos). Quem envia são as Edge Functions formulario-notificacao
// (e-mail) e formulario-whatsapp (migration_038), chamadas pela
// formulario-publico a cada envio aceito.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_DESTINATARIOS = 10 // constraint formularios_notif_valida
const MAX_CAMPOS_WHATSAPP = 5 // parâmetros 2 a 6 do template (constraint formularios_whatsapp_campos_max)

const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function PainelNotificacoes({ form, campos = [], podeEditar, salvarForm }) {
  const toast = useToast()
  const doBanco = () => ({
    notif_ativa: !!form.notif_ativa,
    notif_email_ativa: !!form.notif_email_ativa,
    notif_email_destinatarios: Array.isArray(form.notif_email_destinatarios) ? form.notif_email_destinatarios : [],
    notif_whatsapp_ativa: !!form.notif_whatsapp_ativa,
    // só ids de campos que ainda existem
    notif_whatsapp_campos: (Array.isArray(form.notif_whatsapp_campos) ? form.notif_whatsapp_campos : []).filter(id => campos.some(c => c.id === id)),
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
    const patch = { ...cfg, notif_email_destinatarios: lista.length ? lista : null }
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

        <CanalWhatsApp form={form} campos={campos} cfg={cfg} setCfg={setCfg} off={off || desligado} toast={toast} />
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

// ── WhatsApp (migration_038) ──
// Número único da Prolu, template aprovado "novo_lead_formulario": nome do
// formulário + até 5 campos ("Pergunta: resposta") + link wa.me do telefone do
// lead. O número que recebe e o consentimento (opt-in) são do escritório, em
// Configurações → Escritório.
function CanalWhatsApp({ form, campos, cfg, setCfg, off, toast }) {
  const empresa = form.empresas || {}
  const configurado = !!empresa.whatsapp_numero && empresa.whatsapp_optin === true
  const sel = cfg.notif_whatsapp_campos
  const telefones = campos.filter(c => c.tipo === 'phone')

  function ligar(v) {
    setCfg(c => ({
      ...c,
      notif_whatsapp_ativa: v,
      // ao ligar sem nada escolhido: telefones já marcados
      notif_whatsapp_campos: v && !c.notif_whatsapp_campos.length
        ? telefones.slice(0, MAX_CAMPOS_WHATSAPP).map(t => t.id)
        : c.notif_whatsapp_campos,
    }))
  }
  function alternar(id) {
    if (sel.includes(id)) { setCfg(c => ({ ...c, notif_whatsapp_campos: c.notif_whatsapp_campos.filter(x => x !== id) })); return }
    if (sel.length >= MAX_CAMPOS_WHATSAPP) { toast('Máximo de 5 campos por notificação'); return }
    setCfg(c => ({ ...c, notif_whatsapp_campos: [...c.notif_whatsapp_campos, id] }))
  }
  function mover(id, delta) {
    setCfg(c => {
      const l = [...c.notif_whatsapp_campos]
      const i = l.indexOf(id), j = i + delta
      if (i < 0 || j < 0 || j >= l.length) return c
      ;[l[i], l[j]] = [l[j], l[i]]
      return { ...c, notif_whatsapp_campos: l }
    })
  }

  // lista: escolhidos primeiro (na ordem da mensagem), depois os demais
  const porId = new Map(campos.map(c => [c.id, c]))
  const ordenados = [...sel.map(id => porId.get(id)).filter(Boolean), ...campos.filter(c => !sel.includes(c.id))]
  // prévia: mesma regra da Edge Function (sem escolha → 5 primeiros)
  const daMensagem = sel.length ? sel.map(id => porId.get(id)).filter(Boolean) : campos.slice(0, MAX_CAMPOS_WHATSAPP)
  const previa = [
    form.nome,
    ...[0, 1, 2, 3, 4].map(i => (daMensagem[i] ? `${daMensagem[i].label || 'Pergunta'}: (resposta)` : '-')),
    telefones.length ? 'https://wa.me/55… (telefone do lead)' : '-',
  ]

  return (
    <div className="fm-publico fm-notif-whatsapp">
      <div className="fm-notif-canal"><span aria-hidden="true">💬</span> WhatsApp</div>
      <div className="fm-publico-row">
        <span className="fm-publico-label">Notificar</span>
        <FmSwitch ligado={cfg.notif_whatsapp_ativa} disabled={off} rotulo="Ativar notificação por WhatsApp" onChange={ligar} />
        <span className="fm-status-texto">Ativar notificação por WhatsApp</span>
      </div>

      {cfg.notif_whatsapp_ativa && (
        <>
          {!configurado && (
            <p className="fm-notif-aviso" role="status">
              Configure o número do WhatsApp nas <Link to="/configuracoes?tab=escritorio">Configurações do escritório</Link>.
            </p>
          )}
          <div className="fm-publico-row fm-row-topo">
            <span className="fm-publico-label">Campos</span>
            <div className="fm-wpp-campos">
              <span className="fm-status-texto">Quais informações incluir na mensagem? Até {MAX_CAMPOS_WHATSAPP}, nesta ordem.</span>
              {campos.length === 0 && <span className="fm-publico-dica">O formulário ainda não tem campos.</span>}
              <ul className="fm-wpp-lista">
                {ordenados.map(c => {
                  const pos = sel.indexOf(c.id)
                  const marcado = pos >= 0
                  return (
                    <li key={c.id} className={`fm-wpp-item${marcado ? ' marcado' : ''}`}>
                      <label>
                        <input type="checkbox" checked={marcado} disabled={off} onChange={() => alternar(c.id)} />
                        {marcado && <span className="fm-wpp-pos">{pos + 1}</span>}
                        <span>{c.label || 'Pergunta'}</span>
                        {c.tipo === 'phone' && <span className="fm-wpp-tel">(telefone — sempre incluído no link WhatsApp)</span>}
                      </label>
                      {marcado && !off && (
                        <span className="fm-wpp-mover">
                          <button type="button" aria-label={`Subir ${c.label || 'campo'}`} disabled={pos === 0} onClick={() => mover(c.id, -1)}>↑</button>
                          <button type="button" aria-label={`Descer ${c.label || 'campo'}`} disabled={pos === sel.length - 1} onClick={() => mover(c.id, 1)}>↓</button>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
              {!sel.length && campos.length > 0 && (
                <span className="fm-publico-dica">Nenhum campo escolhido: vão os {Math.min(MAX_CAMPOS_WHATSAPP, campos.length)} primeiros do formulário.</span>
              )}
            </div>
          </div>
          <div className="fm-publico-row fm-row-topo">
            <span className="fm-publico-label">Prévia</span>
            <div className="fm-wpp-previa" aria-label="Prévia dos dados da mensagem">
              {previa.map((linha, i) => <div key={i} className={i === 0 ? 'fm-wpp-previa-titulo' : undefined}>{linha}</div>)}
              <span className="fm-wpp-previa-nota">O texto fixo em volta destes dados vem do template aprovado na Meta.</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
