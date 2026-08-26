import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  IconInicio, IconBase, IconCRM, IconDashboard,
  IconPlano, IconCliente, IconIndicadores, IconBurger, IconClose, IconAgente, IconBell,
  IconBuilding, IconSettings, IconContacts, IconMoney, IconChevronDown,
} from './Icons.jsx'
import './AppLayout.css'

const NAV_SECTIONS = [
  {
    key: 'comercial',
    label: 'Comercial',
    items: [
      { to: '/crm', label: 'CRM', Icon: IconCRM },
      { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
      { label: 'Precificação', Icon: IconMoney, soon: true },
    ],
  },
  {
    key: 'metodo',
    label: 'Método',
    items: [
      { to: '/plano-pratico', label: 'Plano Prático', Icon: IconPlano },
      { to: '/cliente-ideal', label: 'Cliente Ideal', Icon: IconCliente },
      { to: '/indicadores', label: 'Indicadores', Icon: IconIndicadores },
      { to: '/agente-prolu', label: 'Agente Prolu', Icon: IconAgente },
    ],
  },
  {
    key: 'aprender',
    label: 'Aprender',
    items: [
      { to: '/base-conhecimento', label: 'Base de Conhecimento', Icon: IconBase },
    ],
  },
  {
    key: 'escritorio',
    label: 'Escritório',
    items: [
      { to: '/clientes', label: 'Contatos', Icon: IconContacts },
    ],
  },
]

const ADMIN_NAV = [
  { to: '/admin', label: 'Início', Icon: IconInicio, end: true },
  { to: '/admin/escritorios', label: 'Escritórios', Icon: IconBuilding },
  { to: '/base-conhecimento', label: 'Base de Conhecimento', Icon: IconBase },
  { to: '/avisos', label: 'Avisos', Icon: IconBell },
  { to: '/agente-prolu', label: 'Agente Prolu', Icon: IconAgente },
]

// Estado de seções abertas/fechadas do menu, persistido no navegador —
// navegar entre rotas não deve alterar o que o usuário escolheu.
const SECTIONS_STORAGE_KEY = 'sidebar_sections'

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch {
    // ignora localStorage indisponível/corrompido
  }
  return new Set(NAV_SECTIONS.map((s) => s.key))
}

function saveOpenSections(set) {
  try {
    localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    // ignora localStorage indisponível
  }
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const {
    user, signOut, isEmpresaMaster, isProluAdmin,
    impersonatedEmpresaId, impersonatedEmpresaNome, viewAsUser,
    enterUserView, exitImpersonation, exitUserView,
  } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const close = () => setOpen(false)

  const [openSections, setOpenSections] = useState(loadOpenSections)

  function toggleSection(key) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveOpenSections(next)
      return next
    })
  }

  const initial = (user?.nome || 'U').trim().charAt(0).toUpperCase()

  // Sidebar de administração da Prolu: só aparece quando o admin não está
  // "dentro" de nenhuma empresa (nem impersonando, nem em modo visualização).
  const showAdminSidebar = isProluAdmin && !impersonatedEmpresaId && !viewAsUser

  function goTo(path) {
    navigate(path)
    close()
  }

  return (
    <>
      <header className="topbar">
        <button className="burger" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <IconBurger />
        </button>
        <div className="topbar-logo">prolu<em /></div>
      </header>

      <div className={`scrim${open ? ' show' : ''}`} onClick={close} />

      <div className="app">
        {showAdminSidebar ? (
          <aside className={`sidebar${open ? ' open' : ''}`}>
            <button className="drawer-close" onClick={close} aria-label="Fechar menu">
              <IconClose />
            </button>

            <div className="logo">
              <div className="logo-mark"><span>prolu</span></div>
              <div className="logo-sub">admin</div>
            </div>

            <nav className="nav">
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  onClick={() => { if (window.innerWidth <= 860) close() }}
                >
                  <item.Icon className="nav-icon" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="sidebar-footer admin-sidebar-footer">
              <div className="admin-sidebar-user">
                <div className="avatar">{initial}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="user-name">{user?.nome}</div>
                  <div className="user-co">Prolu admin</div>
                </div>
                <button className="signout-btn" onClick={signOut} aria-label="Sair" title="Sair">
                  <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                </button>
              </div>
              <button className="view-as-user-btn" onClick={() => { enterUserView(); goTo('/') }}>
                Ver como usuário
              </button>
            </div>
          </aside>
        ) : (
          <aside className={`sidebar${open ? ' open' : ''}`}>
            <button className="drawer-close" onClick={close} aria-label="Fechar menu">
              <IconClose />
            </button>

            <div className="logo">
              <div className="logo-mark"><span>prolu</span></div>
              <div className="logo-sub">app</div>
            </div>

            <nav className="nav">
              <NavLink
                to="/"
                end
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={() => { if (window.innerWidth <= 860) close() }}
              >
                <IconInicio className="nav-icon" />
                Início
              </NavLink>

              {NAV_SECTIONS.map((section) => {
                const isOpen = openSections.has(section.key)
                return (
                  <div className="nav-section" key={section.key}>
                    <button
                      type="button"
                      className="nav-section-header"
                      onClick={() => toggleSection(section.key)}
                      aria-expanded={isOpen}
                    >
                      <span className="nav-section-label">{section.label}</span>
                      <IconChevronDown className={`nav-section-chevron${isOpen ? ' open' : ''}`} />
                    </button>
                    <div className={`nav-section-items${isOpen ? ' open' : ''}`}>
                      {section.items.map((item) => (
                        item.soon ? (
                          <div className="nav-item nav-item-disabled" key={item.label}>
                            <item.Icon className="nav-icon" />
                            {item.label}
                            <span className="nav-soon">Em breve</span>
                          </div>
                        ) : (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                            onClick={() => { if (window.innerWidth <= 860) close() }}
                          >
                            <item.Icon className="nav-icon" />
                            {item.label}
                          </NavLink>
                        )
                      ))}
                    </div>
                  </div>
                )
              })}
            </nav>

            <div className="sidebar-footer">
              <div
                className="sidebar-footer-info"
                onClick={() => { if (isEmpresaMaster) { navigate('/equipe'); if (window.innerWidth <= 860) close() } }}
                style={{ cursor: isEmpresaMaster ? 'pointer' : 'default' }}
                title={isEmpresaMaster ? 'Gerenciar equipe' : undefined}
              >
                <div className="avatar">{initial}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="user-name">{user?.nome}</div>
                  <div className="user-co">{user?.empresa || 'Prolu'}</div>
                </div>
              </div>
              <button className="signout-btn" onClick={signOut} aria-label="Sair" title="Sair">
                <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              </button>
            </div>

            <NavLink
              to="/configuracoes"
              className={({ isActive }) => `settings-link${isActive ? ' active' : ''}`}
              onClick={() => { if (window.innerWidth <= 860) close() }}
            >
              <IconSettings className="settings-link-icon" />
              Configurações
            </NavLink>
          </aside>
        )}

        <main className="main" key={location.pathname}>
          {impersonatedEmpresaId && (
            <div className="context-banner banner-impersonate">
              <span>Vendo como: {impersonatedEmpresaNome}</span>
              <button onClick={() => { exitImpersonation(); navigate('/admin') }}>Sair</button>
            </div>
          )}
          {viewAsUser && (
            <div className="context-banner banner-viewuser">
              <span>Modo visualização de usuário</span>
              <button onClick={() => { exitUserView(); navigate('/admin') }}>Sair</button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </>
  )
}
