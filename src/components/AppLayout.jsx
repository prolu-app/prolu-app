import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  IconInicio, IconBase, IconCRM, IconDashboard,
  IconPlano, IconCliente, IconIndicadores, IconBurger, IconClose, IconAgente,
} from './Icons.jsx'
import './AppLayout.css'

const NAV = [
  { to: '/', label: 'Início', Icon: IconInicio, end: true },
  { group: 'Aprender' },
  { to: '/base-conhecimento', label: 'Base de Conhecimento', Icon: IconBase },
  { group: 'Comercial' },
  { to: '/crm', label: 'CRM', Icon: IconCRM },
  { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { group: 'Método' },
  { to: '/plano-pratico', label: 'Plano Prático', Icon: IconPlano },
  { to: '/cliente-ideal', label: 'Cliente Ideal', Icon: IconCliente },
  { to: '/indicadores', label: 'Indicadores', Icon: IconIndicadores },
]

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()
  const close = () => setOpen(false)

  const initial = (user?.nome || 'U').trim().charAt(0).toUpperCase()

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
        <aside className={`sidebar${open ? ' open' : ''}`}>
          <button className="drawer-close" onClick={close} aria-label="Fechar menu">
            <IconClose />
          </button>

          <div className="logo">
            <div className="logo-mark"><span>prolu</span></div>
            <div className="logo-sub">app</div>
          </div>

          <nav className="nav">
            {NAV.map((item, i) =>
              item.group ? (
                <div className="nav-label" key={`g-${i}`}>{item.group}</div>
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
            )}
          </nav>

          <NavLink
            to="/agente-prolu"
            className={({ isActive }) => `nav-item agent-item${isActive ? ' active' : ''}`}
            onClick={() => { if (window.innerWidth <= 860) close() }}
          >
            <IconAgente className="nav-icon" />
            Agente Prolu
            <span className="agent-dot" />
          </NavLink>

          <div className="sidebar-footer">
            <div className="avatar">{initial}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user?.nome}</div>
              <div className="user-co">{user?.empresa || 'Prolu'}</div>
            </div>
            <button className="signout-btn" onClick={signOut} aria-label="Sair" title="Sair">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
        </aside>

        <main className="main" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </>
  )
}
