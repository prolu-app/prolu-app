import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { PasswordField } from '../components/PasswordField.jsx'
import './Login.css'

const STEPS = { FORM: 'form', CHECK: 'check', PROFILE: 'profile' }

export default function Onboarding({ initialUser }) {
  const { signUp, findConvitePendente, completeOnboarding, resendConfirmation, signOut } = useAuth()
  const toast = useToast()

  // Se já existe uma sessão autenticada sem registro em `usuarios`
  // (needsOnboarding), pula direto para o passo de perfil.
  const [step, setStep] = useState(initialUser?.needsOnboarding ? STEPS.PROFILE : STEPS.FORM)
  const [email, setEmail] = useState(initialUser?.email || '')
  const [password, setPassword] = useState('')
  const [nome, setNome] = useState('')
  const [empresaNome, setEmpresaNome] = useState('')
  const [convite, setConvite] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)

  // Se a tela retomou direto no passo de perfil (voltando do link de
  // confirmação por e-mail), busca convite pendente pra saber se a pessoa
  // deve entrar num escritório existente em vez de criar um novo.
  useEffect(() => {
    if (initialUser?.needsOnboarding && initialUser?.email) {
      findConvitePendente(initialUser.email).then(c => setConvite(c || null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSignUp() {
    if (!email || !password) { setError('Preencha e-mail e senha.'); return }
    if (password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return }
    setBusy(true)
    setError('')

    const { error, session } = await signUp(email, password)
    setBusy(false)
    if (error) {
      setError(error.message?.includes('already') ? 'Esse e-mail já tem conta. Tente entrar.' : 'Não foi possível criar a conta.')
      return
    }

    if (!session) {
      // Supabase exige confirmação por e-mail antes de liberar a sessão.
      setStep(STEPS.CHECK)
      return
    }

    // Sessão já ativa (confirmação por e-mail desligada no projeto) — segue direto pro perfil.
    const c = await findConvitePendente(email)
    setConvite(c || null)
    setStep(STEPS.PROFILE)
  }

  async function handleResend() {
    setResending(true)
    const { error } = await resendConfirmation(email)
    setResending(false)
    toast(error ? 'Não foi possível reenviar o e-mail.' : 'E-mail reenviado.')
  }

  async function handleProfile() {
    if (!nome.trim()) { setError('Como podemos te chamar?'); return }
    if (!convite && !empresaNome.trim()) { setError('Qual o nome do seu escritório?'); return }
    setBusy(true)
    setError('')

    const { error } = await completeOnboarding({
      nome: nome.trim(),
      empresaNome: empresaNome.trim(),
      conviteId: convite?.id,
      empresaIdConvite: convite?.empresa_id,
      roleConvite: convite?.role,
    })

    setBusy(false)
    if (error) setError('Não foi possível concluir o cadastro: ' + error)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-mark"><span>prolu</span></div>
          <div className="logo-sub">app</div>
        </div>

        {step === STEPS.FORM && (
          <>
            <h1 className="login-title">Vamos começar.</h1>
            <p className="login-sub">Crie sua conta para acessar o método e suas ferramentas.</p>

            <div className="login-field">
              <label className="modal-label">E-mail</label>
              <input className="modal-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoFocus />
            </div>
            <div className="login-field">
              <label className="modal-label">Senha</label>
              <PasswordField
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSignUp() }}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn-primary login-btn" onClick={handleSignUp} disabled={busy}>
              {busy ? 'Criando…' : 'Criar conta'}
            </button>

            <p className="login-switch">Já tem conta? <a href="/">Entrar</a></p>
          </>
        )}

        {step === STEPS.CHECK && (
          <>
            <h1 className="login-title">Quase lá.</h1>
            <p className="login-sub">Enviamos um email para <strong>{email}</strong>.</p>

            <div className="login-info">
              Verifique sua caixa de entrada. O email vem de <strong>noreply@mail.app.supabase.io</strong> com o assunto <strong>Confirm your email address</strong>.
              <br />Se não encontrar, verifique a pasta de spam.
            </div>

            <button className="btn-cancel login-btn" onClick={handleResend} disabled={resending}>
              {resending ? 'Reenviando…' : 'Reenviar email'}
            </button>

            <p className="login-switch"><a href="/">Já confirmei → Entrar</a></p>
          </>
        )}

        {step === STEPS.PROFILE && (
          <>
            <h1 className="login-title">Só mais um passo.</h1>
            <p className="login-sub">
              {convite
                ? `Você foi convidado para ${convite.empresas?.nome || 'um escritório'}. Confirme seu nome para entrar.`
                : 'Conte um pouco sobre você e seu escritório.'}
            </p>

            <div className="login-field">
              <label className="modal-label">Seu nome</label>
              <input className="modal-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como podemos te chamar?" autoFocus />
            </div>

            {!convite && (
              <div className="login-field">
                <label className="modal-label">Nome do escritório</label>
                <input className="modal-input" value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} placeholder="Ex: Estúdio Arquitetura" />
              </div>
            )}

            {error && <div className="login-error">{error}</div>}

            <button className="btn-primary login-btn" onClick={handleProfile} disabled={busy}>
              {busy ? 'Concluindo…' : 'Concluir cadastro'}
            </button>

            <p className="login-switch"><a href="#" onClick={(e) => { e.preventDefault(); signOut() }}>Usar outra conta</a></p>
          </>
        )}
      </div>
    </div>
  )
}
