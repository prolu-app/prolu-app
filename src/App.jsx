import { Suspense, lazy, useEffect, useState } from 'react'
import { ehDominioCurto } from './utils/slug.js'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import FormularioPublico from './screens/FormularioPublico.jsx'
import MinhaPaginaPublica from './screens/MinhaPaginaPublica.jsx'
import BloqueioPlano from './components/BloqueioPlano.jsx'
import { useConta } from './contexts/ContaContext.jsx'

// Divisão de código (B0): as telas do app só baixam quando abertas, cada uma
// no seu pedaço (JS + CSS). As páginas públicas (Minha Página e formulário)
// ficam no pacote inicial — quem abre prolu.link/<slug> não baixa o app.
const AppLayout = lazy(() => import('./components/AppLayout.jsx'))
const Login = lazy(() => import('./screens/Login.jsx'))
const Onboarding = lazy(() => import('./screens/Onboarding.jsx'))
const AceitarConvite = lazy(() => import('./screens/AceitarConvite.jsx'))
const Inicio = lazy(() => import('./screens/Inicio.jsx'))
const BaseConhecimento = lazy(() => import('./screens/BaseConhecimento.jsx'))
const CRM = lazy(() => import('./screens/CRM.jsx'))
const Precificacao = lazy(() => import('./screens/Precificacao.jsx'))
const PrecificacaoDetalhe = lazy(() => import('./screens/PrecificacaoDetalhe.jsx'))
const ModelosEtapas = lazy(() => import('./screens/ModelosEtapas.jsx'))
const PrecificacaoEtiquetas = lazy(() => import('./screens/PrecificacaoEtiquetas.jsx'))
const ValorHora = lazy(() => import('./screens/ValorHora.jsx'))
const Clientes = lazy(() => import('./screens/Clientes.jsx'))
const Formularios = lazy(() => import('./screens/Formularios.jsx'))
const FormularioEditor = lazy(() => import('./screens/FormularioEditor.jsx'))
const MinhaPagina = lazy(() => import('./screens/MinhaPagina.jsx'))
const Dashboard = lazy(() => import('./screens/Dashboard.jsx'))
const PlanoPratico = lazy(() => import('./screens/PlanoPratico.jsx'))
const ClienteIdeal = lazy(() => import('./screens/ClienteIdeal.jsx'))
const Indicadores = lazy(() => import('./screens/Indicadores.jsx'))
const AgentePrl = lazy(() => import('./screens/AgentePrl.jsx'))
const Configuracoes = lazy(() => import('./screens/Configuracoes.jsx'))
const Avisos = lazy(() => import('./screens/Avisos.jsx'))
const AdminInicio = lazy(() => import('./screens/admin/AdminInicio.jsx'))
const AdminEscritorios = lazy(() => import('./screens/admin/AdminEscritorios.jsx'))
const AdminModelosPrecificacao = lazy(() => import('./screens/admin/AdminModelosPrecificacao.jsx'))
const AdminModelosFormulario = lazy(() => import('./screens/admin/AdminModelosFormulario.jsx'))
const AdminPlanoPraticoPadrao = lazy(() => import('./screens/admin/AdminPlanoPraticoPadrao.jsx'))
const AdminCursos = lazy(() => import('./screens/admin/AdminCursos.jsx'))
const Planos = lazy(() => import('./screens/Planos.jsx'))
const ContaSuspensa = lazy(() => import('./screens/ContaSuspensa.jsx'))

// enquanto o pedaço de uma tela baixa (fora do AppLayout)
function Carregando() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="logo-mark" style={{ fontFamily: 'Abhaya Libre, serif', fontWeight: 700, fontSize: 32, position: 'relative', zIndex: 1 }}>
        <span style={{ position: 'relative' }}>prolu</span>
      </div>
    </div>
  )
}

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

  if (location.pathname === '/aceitar-convite') return <Suspense fallback={<Carregando />}><AceitarConvite /></Suspense>
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

  if (loading || carregandoConta) return <Carregando />

  // Usuário autenticado no Supabase Auth, mas ainda sem registro em `usuarios`
  // (acabou de criar conta ou está confirmando e-mail).
  if (user?.needsOnboarding) return <Suspense fallback={<Carregando />}><Onboarding initialUser={user} /></Suspense>

  if (!user) {
    return (
      <Suspense fallback={<Carregando />}>
        {showOnboarding ? <Onboarding /> : <Login onCreateAccount={() => setShowOnboarding(true)} />}
      </Suspense>
    )
  }

  // Conta suspensa/encerrando: tela cheia, nenhuma rota do app. O prolu_admin
  // nunca cai aqui (nem dentro de um escritório suspenso).
  if (!contaAtiva && !isProluAdmin) return <Suspense fallback={<Carregando />}><ContaSuspensa /></Suspense>

  const isAdminMode = isProluAdmin && !impersonatedEmpresaId && !viewAsUser

  // a tela em si suspende dentro do AppLayout (Suspense em volta do Outlet):
  // o menu não pisca ao navegar; este fallback só cobre o primeiro carregamento
  return (
    <Suspense fallback={<Carregando />}>
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={isAdminMode ? <Navigate to="/admin" replace /> : <Inicio />} />
        <Route path="/base-conhecimento" element={<RotaProtegida temAcesso={acesso.baseConhecimento}><BaseConhecimento /></RotaProtegida>} />
        <Route path="/crm" element={<RotaProtegida temAcesso={acesso.crm}><CRM /></RotaProtegida>} />
        <Route path="/precificacao" element={<RotaProtegida temAcesso={acesso.precificacao}><Precificacao /></RotaProtegida>} />
        <Route path="/precificacao/modelos" element={<RotaProtegida temAcesso={acesso.precificacao}><ModelosEtapas /></RotaProtegida>} />
        <Route path="/precificacao/etiquetas" element={<RotaProtegida temAcesso={acesso.precificacao}><PrecificacaoEtiquetas /></RotaProtegida>} />
        <Route path="/precificacao/valor-hora" element={<RotaProtegida temAcesso={acesso.precificacao}><ValorHora /></RotaProtegida>} />
        <Route path="/precificacao/valor-hora/:id" element={<RotaProtegida temAcesso={acesso.precificacao}><ValorHora /></RotaProtegida>} />
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
        <Route path="/admin/plano-pratico-padrao" element={<AdminPlanoPraticoPadrao />} />
        <Route path="/admin/cursos" element={<AdminCursos />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
