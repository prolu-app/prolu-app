import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { QUOTES, ANNOUNCEMENTS } from '../data/seed.js'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import {
  IconBolt, IconAgente, IconArrowRight, IconCRM, IconBase, IconMoney, IconLock, IconClose,
} from '../components/Icons.jsx'
import './Inicio.css'

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Inicio() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [avisos, setAvisos] = useState(() => {
    const fechados = JSON.parse(localStorage.getItem('prolu_avisos_fechados') || '[]')
    return ANNOUNCEMENTS.filter((a) => !fechados.includes(a.id))
  })

  const [kbStats, setKbStats] = useState(null)

  useEffect(() => {
    if (!supabaseReady || !user?.id) return
    Promise.all([
      supabase.from('kb_aulas').select('*', { count: 'exact', head: true }),
      supabase.from('kb_progresso')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .eq('concluida', true),
    ]).then(([{ count: total }, { count: concluidas }]) => {
      setKbStats({ total: total ?? 0, concluidas: concluidas ?? 0 })
    })
  }, [user?.id])

  const kbPct = kbStats?.total > 0
    ? Math.round((kbStats.concluidas / kbStats.total) * 100)
    : 0

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [])
  const primeiroNome = (user?.nome || 'André').split(' ')[0]

  function abrirAviso(a) {
    if (a.external) window.open(a.link, '_blank')
    else navigate(a.link)
  }

  return (
    <>
      {/* avisos */}
      {avisos.length > 0 && (
        <div className="announcements">
          {avisos.map((a) => (
            <div className={`announcement ann-${a.color}`} key={a.id}>
              <span className="ann-dot" />
              <span className="ann-text">{a.text}</span>
              <span className="ann-link" onClick={() => abrirAviso(a)}>{a.linkText}</span>
              <button className="ann-close" onClick={() => {
                const fechados = JSON.parse(localStorage.getItem('prolu_avisos_fechados') || '[]')
                localStorage.setItem('prolu_avisos_fechados', JSON.stringify([...new Set([...fechados, a.id])]))
                setAvisos(avisos.filter((x) => x.id !== a.id))
              }} aria-label="Fechar aviso">
                <IconClose />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* boas-vindas */}
      <div className="welcome">
        <div className="welcome-eyebrow">
          <IconBolt />
          {primeiroNome}, {saudacao().toLowerCase()} — bom te ver por aqui
        </div>
        <h1 className="welcome-title">Seu escritório está em <em>movimento.</em></h1>
        <p className="welcome-quote">
          <span className="welcome-quote-text">{quote.text}</span>
          <span className="quote-author">— {quote.author}</span>
        </p>
      </div>

      {/* agente prolu */}
      <div className="agent-bar" onClick={() => navigate('/agente-prolu')}>
        <div className="agent-bar-icon"><IconAgente /></div>
        <div className="agent-bar-text">
          <div className="agent-bar-title">Agente Prolu</div>
          <div className="agent-bar-sub">Sua IA particular para vender, atender e organizar o escritório</div>
        </div>
        <div className="agent-bar-cta">
          Conversar
          <IconArrowRight />
        </div>
      </div>

      {/* ferramentas */}
      <div className="section-title">Suas ferramentas</div>
      <div className="modules-grid">
        <button className="module-tile tile-comercial" onClick={() => navigate('/crm')}>
          <div className="tile-top">
            <div className="tile-icon"><IconCRM /></div>
          </div>
          <div className="tile-body">
            <div className="tile-title">Gestão Comercial</div>
            <div className="tile-sub">CRM, dashboard, plano prático, cliente ideal e indicadores num só lugar.</div>
            <div className="tile-meta-row">
              <span className="tile-progress-pct">8 leads este mês · 3 propostas abertas</span>
            </div>
          </div>
        </button>

        <button className="module-tile tile-conhecimento" onClick={() => navigate('/base-conhecimento')}>
          <div className="tile-top">
            <div className="tile-icon"><IconBase /></div>
          </div>
          <div className="tile-body">
            <div className="tile-title">Base de Conhecimento</div>
            <div className="tile-sub">O método Prolu em vídeo. Cursos, módulos e materiais extras.</div>
            <div className="tile-meta-row">
              {!kbStats && <span className="tile-progress-pct">—</span>}
              {kbStats?.total === 0 && <span className="tile-progress-pct">Nenhuma aula ainda</span>}
              {kbStats?.total > 0 && (
                <>
                  <div className="tile-progress-track"><div className="tile-progress-fill" style={{ width: `${kbPct}%` }} /></div>
                  <span className="tile-progress-pct">{kbStats.concluidas} de {kbStats.total} aulas · {kbPct}%</span>
                </>
              )}
            </div>
          </div>
        </button>

        <button className="module-tile tile-precificacao" onClick={() => toast('Precificação chega em breve')}>
          <div className="tile-top">
            <div className="tile-icon"><IconMoney /></div>
            <span className="tile-badge badge-soon">Em breve</span>
          </div>
          <div className="tile-body">
            <div className="tile-title">Precificação</div>
            <div className="tile-sub">Calcule horas e valor de cada projeto direto no fluxo do CRM.</div>
            <div className="tile-locked-note"><IconLock />Liberado em breve</div>
          </div>
        </button>
      </div>

      {/* resumo */}
      <div className="section-title">Resumo do escritório</div>
      <div className="pulse-card">
        <div className="pulse-metric">
          <div className="pulse-label">Faturamento YTD</div>
          <div className="pulse-val highlight">R$ 74k</div>
          <div className="pulse-trend">57% da meta anual</div>
        </div>
        <div className="pulse-divider" />
        <div className="pulse-metric">
          <div className="pulse-label">Plano Prático</div>
          <div className="pulse-val">45%</div>
          <div className="pulse-trend">5 de 11 ações concluídas</div>
        </div>
        <div className="pulse-divider" />
        <div className="pulse-metric">
          <div className="pulse-label">Base de Conhecimento</div>
          <div className="pulse-val">55%</div>
          <div className="pulse-trend">11 de 20 aulas assistidas</div>
        </div>
      </div>

      <div className="insight-card">
        <div className="insight-icon"><IconBolt /></div>
        <div className="insight-text">
          <strong>Indicação converte 38% dos leads</strong> — seu melhor canal. Antes de investir em tráfego pago, crie um processo de pedido de indicação para quem já fechou com você.
        </div>
      </div>
    </>
  )
}
