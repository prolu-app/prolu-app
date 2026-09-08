import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { PasswordField } from '../components/PasswordField.jsx'
import './Login.css'

const STEPS = { LOADING: 'loading', FORM: 'form', ERROR: 'error' }

export default function AceitarConvite() {
  const { findConvitePendente, completeOnboarding } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState(STEPS.LOADING)
  const [convite, setConvite] = useState(null)
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // O link do e-mail de convite (Supabase Auth) já autentica a pessoa —
  // os tokens chegam no hash da URL e o client processa isso na
  // inicialização (detectSessionInUrl). getSession() aqui só lê o
  // resultado desse processamento, já concluído a essa altura.
  useEffect(() => {
    async function preparar() {
      if (!supabaseReady) {
        setError('Convite indisponível em modo de demonstração.')
        setStep(STEPS.ERROR)
        return
      }

      const { data } = await supabase.auth.getSession()
      const sessionUser = data?.session?.user
      if (!sessionUser?.email) {
        setError('Link de convite inválido ou expirado. Peça um novo convite a quem te convidou.')
        setStep(STEPS.ERROR)
        return
      }

      const c = await findConvitePendente(sessionUser.email)
      if (!c) {
        setError('Não encontramos um convite pendente para esse e-mail.')
        setStep(STEPS.ERROR)
        return
      }

      setConvite(c)
      setNome(c.nome || sessionUser.user_metadata?.nome || '')
      setStep(STEPS.FORM)
    }
    preparar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmar() {
    if (!nome.trim()) { setError('Como podemos te chamar?'); return }
    if (senha.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirmarSenha) { setError('As senhas não coincidem.'); return }

    setBusy(true)
    setError('')

    const { error: pwErr } = await supabase.auth.updateUser({ password: senha })
    if (pwErr) {
      setBusy(false)
      setError('Não foi possível definir a senha. Tente novamente.')
      return
    }

    const { error: obErr } = await completeOnboarding({
      nome: nome.trim(),
      conviteId: convite.id,
      empresaIdConvite: convite.empresa_id,
      roleConvite: convite.role,
    })

    setBusy(false)
    if (obErr) { setError('Não foi possível concluir o cadastro: ' + obErr); return }

    toast(`Bem-vindo(a) a ${convite.empresas?.nome || 'seu escritório'}!`)
    navigate('/', { replace: true })
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-mark"><span>prolu</span></div>
          <div className="logo-sub">app</div>
        </div>

        {step === STEPS.LOADING && (
          <p className="login-sub">Confirmando seu convite…</p>
        )}

        {step === STEPS.ERROR && (
          <>
            <h1 className="login-title">Convite não encontrado.</h1>
            <p className="login-sub">{error}</p>
            <p className="login-switch"><a href="/">Voltar para o início</a></p>
          </>
        )}

        {step === STEPS.FORM && (
          <>
            <h1 className="login-title">Quase lá.</h1>
            <p className="login-sub">
              Você foi convidado para {convite?.empresas?.nome || 'um escritório'}. Defina sua senha para entrar.
            </p>

            <div className="login-field">
              <label className="modal-label">Seu nome</label>
              <input
                className="modal-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como podemos te chamar?"
                autoFocus
              />
            </div>
            <div className="login-field">
              <label className="modal-label">Senha</label>
              <PasswordField
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="login-field">
              <label className="modal-label">Confirmar senha</label>
              <PasswordField
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a senha"
                onKeyDown={(e) => { if (e.key === 'Enter') confirmar() }}
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn-primary login-btn" onClick={confirmar} disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar no escritório'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
