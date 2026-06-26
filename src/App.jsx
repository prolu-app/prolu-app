import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import AppLayout from './components/AppLayout.jsx'
import Login from './screens/Login.jsx'
import Onboarding from './screens/Onboarding.jsx'

import Inicio from './screens/Inicio.jsx'
import BaseConhecimento from './screens/BaseConhecimento.jsx'
import CRM from './screens/CRM.jsx'
import Dashboard from './screens/Dashboard.jsx'
import PlanoPratico from './screens/PlanoPratico.jsx'
import ClienteIdeal from './screens/ClienteIdeal.jsx'
import Indicadores from './screens/Indicadores.jsx'
import AgentePrl from './screens/AgentePrl.jsx'
import Equipe from './screens/Equipe.jsx'

export default function App() {
  const { user, loading } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)

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

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route path="/base-conhecimento" element={<BaseConhecimento />} />
        <Route path="/crm" element={<CRM />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/plano-pratico" element={<PlanoPratico />} />
        <Route path="/cliente-ideal" element={<ClienteIdeal />} />
        <Route path="/indicadores" element={<Indicadores />} />
        <Route path="/agente-prolu" element={<AgentePrl />} />
        <Route path="/equipe" element={<Equipe />} />
      </Route>
    </Routes>
  )
}
