import { useEffect, useState } from 'react'
import { ehDominioCurto } from './utils/slug.js'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import AppLayout from './components/AppLayout.jsx'
import Login from './screens/Login.jsx'
import Onboarding from './screens/Onboarding.jsx'
import AceitarConvite from './screens/AceitarConvite.jsx'
import FormularioPublico from './screens/FormularioPublico.jsx'
import MinhaPaginaPublica from './screens/MinhaPaginaPublica.jsx'

import Inicio from './screens/Inicio.jsx'
import BaseConhecimento from './screens/BaseConhecimento.jsx'
import CRM from './screens/CRM.jsx'
import Precificacao from './screens/Precificacao.jsx'
import PrecificacaoDetalhe from './screens/PrecificacaoDetalhe.jsx'
import ModelosEtapas from './screens/ModelosEtapas.jsx'
import PrecificacaoEtiquetas from './screens/PrecificacaoEtiquetas.jsx'
import Clientes from './screens/Clientes.jsx'
import Formularios from './screens/Formularios.jsx'
import FormularioEditor from './screens/FormularioEditor.jsx'
import MinhaPagina from './screens/MinhaPagina.jsx'
import Dashboard from './screens/Dashboard.jsx'
import PlanoPratico from './screens/PlanoPratico.jsx'
import ClienteIdeal from './screens/ClienteIdeal.jsx'
import Indicadores from './screens/Indicadores.jsx'
import AgentePrl from './screens/AgentePrl.jsx'
import Configuracoes from './screens/Configuracoes.jsx'
import Avisos from './screens/Avisos.jsx'
import AdminInicio from './screens/admin/AdminInicio.jsx'
import AdminEscritorios from './screens/admin/AdminEscritorios.jsx'
import AdminModelosPrecificacao from './screens/admin/AdminModelosPrecificacao.jsx'
import AdminModelosFormulario from './screens/admin/AdminModelosFormulario.jsx'
import Planos from './screens/Planos.jsx'
import ContaSuspensa from './screens/ContaSuspensa.jsx'
import BloqueioPlano from './components/BloqueioPlano.jsx'
import { useConta } from './contexts/ContaContext.jsx'

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
  const { carregando: carregandoConta, contaAtiva } = useConta()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const location = useLocation()

  // Fora do AppLayout e independente do estado de autenticação: o link do
  // e-mail de convite autentica a pessoa via Supabase Auth, mas ela ainda
  // não tem registro em `usuarios` — sem esse desvio, o fluxo abaixo
  // (needsOnboarding) tentaria te mandar pro cadastro normal em vez da
  // tela de aceite do convite.
  // Domínio curto (prolu.link): só as páginas públicas, sem login nem telas do
  // app — então /:slug não colide com /crm, /configuracoes etc. (que só existem
  // em app.prolu.com.br). /e/… continua valendo aqui também.
  if (ehDominioCurto()) {
    return (
      <Routes>
        <Route path="/e/:slugEscritorio" element={<MinhaPaginaPublica />} />
        <Route path="/e/:slugEscritorio/:slugFormulario" element={<FormularioPublico />} />
        <Route path="/:slugEscritorio" element={<MinhaPaginaPublica />} />
        <Route path="/:slugEscritorio/:slugFormulario" element={<FormularioPublico />} />
        <Route path="*" element={<FormularioPublico />} />
      </Routes>
    )
  }

  if (location.pathname === '/aceitar-convite') return <AceitarConvite />
  // Páginas públicas, sem login e fora do AppLayout:
  //   /e/:slugEscritorio                 → Minha Página (migration_041)
  //   /e/:slugEscritorio/:slugFormulario → formulário (Edge Function formulario-publico)
  // Qualquer outro endereço em /e/ cai no formulário, que mostra "indisponível".
  if (location.pathname.startsWith('/e/')) {
    return (
      <Routes>
        <Route path="/e/:slugEscritorio" element={<MinhaPaginaPublica />} />
        <Route path="/e/:slugEscritorio/:slugFormulario" element={<FormularioPublico />} />
        <Route path="*" element={<FormularioPublico />} />
      </Routes>
    )
  }

  if (loading || carregandoConta) {
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

  // Conta suspensa/encerrando: tela cheia, nenhuma rota do app. O prolu_admin
  // nunca cai aqui (nem dentro de um escritório suspenso).
  if (!contaAtiva && !isProluAdmin) return <ContaSuspensa />

  const isAdminMode = isProluAdmin && !impersonatedEmpresaId && !viewAsUser

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={isAdminMode ? <Navigate to="/admin" replace /> : <Inicio />} />
        <Route path="/base-conhecimento" element={<RotaProtegida temAcesso={acesso.baseConhecimento}><BaseConhecimento /></RotaProtegida>} />
        <Route path="/crm" element={<RotaProtegida temAcesso={acesso.crm}><CRM /></RotaProtegida>} />
        <Route path="/precificacao" element={<RotaProtegida temAcesso={acesso.precificacao}><Precificacao /></RotaProtegida>} />
        <Route path="/precificacao/modelos" element={<RotaProtegida temAcesso={acesso.precificacao}><ModelosEtapas /></RotaProtegida>} />
        <Route path="/precificacao/etiquetas" element={<RotaProtegida temAcesso={acesso.precificacao}><PrecificacaoEtiquetas /></RotaProtegida>} />
        <Route path="/precificacao/:id" element={<RotaProtegida temAcesso={acesso.precificacao}><PrecificacaoDetalhe /></RotaProtegida>} />
        <Route path="/clientes" element={<RotaProtegida temAcesso={acesso.contatos}><Clientes /></RotaProtegida>} />
        <Route path="/formularios" element={<RotaProtegida temAcesso={acesso.formularios}><Formularios /></RotaProtegida>} />
        <Route path="/formularios/:id" element={<RotaProtegida temAcesso={acesso.formularios}><FormularioEditor /></RotaProtegida>} />
        <Route path="/minha-pagina" element={<RotaProtegida temAcesso={acesso.minhaPagina}><MinhaPagina /></RotaProtegida>} />
        <Route path="/dashboard" element={<RotaProtegida temAcesso={acesso.dashboard}><BloqueioPlano recurso="painel_comercial"><Dashboard /></BloqueioPlano></RotaProtegida>} />
        <Route path="/plano-pratico" element={<RotaProtegida temAcesso={acesso.planoPratico}><BloqueioPlano recurso="ferramentas_mentoria"><PlanoPratico /></BloqueioPlano></RotaProtegida>} />
        <Route path="/cliente-ideal" element={<RotaProtegida temAcesso={acesso.clienteIdeal}><BloqueioPlano recurso="ferramentas_mentoria"><ClienteIdeal /></BloqueioPlano></RotaProtegida>} />
        <Route path="/indicadores" element={<RotaProtegida temAcesso={acesso.indicadores}><BloqueioPlano recurso="indicadores"><Indicadores /></BloqueioPlano></RotaProtegida>} />
        <Route path="/agente-prolu" element={<RotaProtegida temAcesso={acesso.agenteProlu}><BloqueioPlano recurso="ferramentas_mentoria"><AgentePrl /></BloqueioPlano></RotaProtegida>} />
        {/* /equipe foi substituída pela aba "Equipe" de /configuracoes */}
        <Route path="/equipe" element={<Navigate to="/configuracoes" replace />} />
        <Route path="/configuracoes" element={<RotaProtegida temAcesso={acesso.configuracoes}><Configuracoes /></RotaProtegida>} />
        <Route path="/planos" element={<Planos />} />
        <Route path="/avisos" element={<Avisos />} />
        <Route path="/admin" element={<AdminInicio />} />
        <Route path="/admin/escritorios" element={<AdminEscritorios />} />
        <Route path="/admin/modelos-precificacao" element={<AdminModelosPrecificacao />} />
        <Route path="/admin/modelos-formulario" element={<AdminModelosFormulario />} />
      </Route>
    </Routes>
  )
}
