import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import './Login.css'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    if (!email || !password) { setError('Preencha e-mail e senha.'); return }
    setBusy(true)
    setError('')
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) setError('Não foi possível entrar. Confira seus dados.')
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-mark"><span>prolu</span></div>
          <div className="logo-sub">app</div>
        </div>

        <h1 className="login-title">Que bom te ver.</h1>
        <p className="login-sub">Entre para acessar suas ferramentas e o método completo.</p>

        <div className="login-field">
          <label className="modal-label">E-mail</label>
          <input
            className="modal-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="voce@email.com"
            autoFocus
          />
        </div>
        <div className="login-field">
          <label className="modal-label">Senha</label>
          <input
            className="modal-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="••••••••"
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="btn-primary login-btn" onClick={handleSubmit} disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}
