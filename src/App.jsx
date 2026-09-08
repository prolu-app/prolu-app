import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import AppLayout from './components/AppLayout.jsx'
import Login from './screens/Login.jsx'
import Onboarding from './screens/Onboarding.jsx'
import AceitarConvite from './screens/AceitarConvite.jsx'

import Inicio from './screens/Inicio.jsx'
import BaseConhecimento from './screens/BaseConhecimento.jsx'
import CRM from './screens/CRM.jsx'
import Clientes from './screens/Clientes.jsx'
import Dashboard from './screens/Dashboard.jsx'
import PlanoPratico from './screens/PlanoPratico.jsx'
import ClienteIdeal from './screens/ClienteIdeal.jsx'
import Indicadores from './screens/Indicadores.jsx'
import AgentePrl from './screens/AgentePrl.jsx'
import Configuracoes from './screens/Configuracoes.jsx'
import Avisos from './screens/Avisos.jsx'
import AdminInicio from './screens/admin/AdminInicio.jsx'
import AdminEscritorios from './screens/admin/AdminEscritorios.jsx'

// Bloqueia o acesso direto a uma rota por URL quando o usuário não tem
// permissão (acesso.<tela> === false): redireciona para / com um toast
// discreto em vez de renderizar a tela.
function RotaProtegida({ children, temAcesso }) {
  const toast = useToast()

  useEffect(() => {
    if (!temAcesso) toast('Você não tem acesso a essa área.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temAcesso])

  if (!temAcesso) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const { user, loading, isProluAdmin, impersonatedEmpresaId, viewAsUser, acesso } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const location = useLocation()

  // Fora do AppLayout e independente do estado de autenticação: o link do
  // e-mail de convite autentica a pessoa via Supabase Auth, mas ela ainda
  // não tem registro em `usuarios` — sem esse desvio, o fluxo abaixo
  // (needsOnboarding) tentaria te mandar pro cadastro normal em vez da
  // tela de aceite do convite.
  if (location.pathname === '/aceitar-convite') return <AceitarConvite />

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="logo-mark" style={{ fontFamily: 'Abhaya Libre, serif', fontWeight: 700, fontSize: 32, position: 'relative', zIndex: 1 }}>
          <span style={{ position: 'relative' }}>prolu</span>
        </div>
      </div>
    )
  }

  // Usuário autenticado no Supabase Auth, mas ainda sem registro em `usuarios`
  // (acabou de criar conta ou está confirmando e-mail).
  if (user?.needsOnboarding) return <Onboarding initialUser={user} />

  if (!user) {
    return showOnboarding
      ? <Onboarding />
      : <Login onCreateAccount={() => setShowOnboarding(true)} />
  }

  const isAdminMode = isProluAdmin && !impersonatedEmpresaId && !viewAsUser

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={isAdminMode ? <Navigate to="/admin" replace /> : <Inicio />} />
        <Route path="/base-conhecimento" element={<RotaProtegida temAcesso={acesso.baseConhecimento}><BaseConhecimento /></RotaProtegida>} />
        <Route path="/crm" element={<RotaProtegida temAcesso={acesso.crm}><CRM /></RotaProtegida>} />
        <Route path="/clientes" element={<RotaProtegida temAcesso={acesso.contatos}><Clientes /></RotaProtegida>} />
        <Route path="/dashboard" element={<RotaProtegida temAcesso={acesso.dashboard}><Dashboard /></RotaProtegida>} />
        <Route path="/plano-pratico" element={<RotaProtegida temAcesso={acesso.planoPratico}><PlanoPratico /></RotaProtegida>} />
        <Route path="/cliente-ideal" element={<RotaProtegida temAcesso={acesso.clienteIdeal}><ClienteIdeal /></RotaProtegida>} />
        <Route path="/indicadores" element={<RotaProtegida temAcesso={acesso.indicadores}><Indicadores /></RotaProtegida>} />
        <Route path="/agente-prolu" element={<AgentePrl />} />
        {/* /equipe foi substituída pela aba "Equipe" de /configuracoes */}
        <Route path="/equipe" element={<Navigate to="/configuracoes" replace />} />
        <Route path="/configuracoes" element={<RotaProtegida temAcesso={acesso.configuracoes}><Configuracoes /></RotaProtegida>} />
        <Route path="/avisos" element={<Avisos />} />
        <Route path="/admin" element={<AdminInicio />} />
        <Route path="/admin/escritorios" element={<AdminEscritorios />} />
      </Route>
    </Routes>
  )
}
