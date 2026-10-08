import { useAuth } from '../contexts/AuthContext.jsx'
import { useConta } from '../contexts/ContaContext.jsx'
import { linkWhatsappComercial } from '../utils/planos.js'
import './Login.css'

// Tela cheia para conta com status_conta != 'ativa' (suspensa ou encerrando).
// Nenhuma rota do app fica acessível; os dados também já estão fechados no
// banco (auth_empresa_id() devolve NULL — migration_045).
export default function ContaSuspensa() {
  const { signOut } = useAuth()
  const { conta } = useConta()

  const whatsapp = linkWhatsappComercial({ escritorio: conta?.nome, planoAtual: conta?.plano })

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-mark"><span>prolu</span></div>
          <div className="logo-sub">app</div>
        </div>

        <h1 className="login-title">Sua conta está suspensa.</h1>
        <p className="login-sub">
          {conta?.nome ? <>O acesso de <strong>{conta.nome}</strong> ao Prolu App está pausado. </> : null}
          Fale com o Comercial para reativar.
        </p>

        <a className="btn-primary login-btn" href={whatsapp} target="_blank" rel="noreferrer">
          Fale com o Comercial
        </a>
        <p className="login-switch">
          <a href="#" onClick={(e) => { e.preventDefault(); signOut() }}>Sair</a>
        </p>
      </div>
    </div>
  )
}
