import { useMemo, useState } from 'react'
import { CRM_ROWS } from '../data/seed.js'
import { IconBolt } from '../components/Icons.jsx'
import './Dashboard.css'

const FUNNEL_STAGES = ['Conversa', 'Proposta', 'Fechado']

function fmtMoney(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function Dashboard() {
  const [period, setPeriod] = useState('mes')
  const rows = CRM_ROWS // em produção: filtrar por período/origem/tipo aqui

  const total = rows.length
  const fechados = rows.filter((r) => r.c_status === 'Fechado')
  const perdidos = rows.filter((r) => r.c_status === 'Perdido')
  const valorPropostas = rows.filter((r) => ['Proposta', 'Conversa'].includes(r.c_status)).reduce((s, r) => s + r.c_valor, 0)
  const valorFechado = fechados.reduce((s, r) => s + r.c_valor, 0)
  const ticketFechados = fechados.length ? valorFechado / fechados.length : 0
  const ticketPerdidos = perdidos.length ? perdidos.reduce((s, r) => s + r.c_valor, 0) / perdidos.length : 0

  const funnel = useMemo(() => {
    const counts = FUNNEL_STAGES.map((stage) => {
      if (stage === 'Conversa') return rows.length // todos passaram por "conversa"
      if (stage === 'Proposta') return rows.filter((r) => ['Proposta', 'Fechado'].includes(r.c_status)).length
      return rows.filter((r) => r.c_status === 'Fechado').length
    })
    return FUNNEL_STAGES.map((stage, i) => ({ stage, count: counts[i], pct: counts[0] ? Math.round((counts[i] / counts[0]) * 100) : 0 }))
  }, [rows])

  const porOrigem = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      map[r.c_origem] = map[r.c_origem] || { total: 0, fechados: 0 }
      map[r.c_origem].total++
      if (r.c_status === 'Fechado') map[r.c_origem].fechados++
    })
    return Object.entries(map).map(([origem, v]) => ({ origem, ...v, conversao: v.total ? Math.round((v.fechados / v.total) * 100) : 0 })).sort((a, b) => b.conversao - a.conversao)
  }, [rows])

  const melhorOrigem = porOrigem[0]
  const taxaConversao = total ? Math.round((fechados.length / total) * 100) : 0

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Onde estão suas oportunidades, e o que elas estão te dizendo.</div>
      </div>

      <div className="dash-filters">
        {[['mes', 'Este mês'], ['trimestre', 'Trimestre'], ['ano', 'Este ano']].map(([k, lbl]) => (
          <button key={k} className={`dash-filter-chip${period === k ? ' active' : ''}`} onClick={() => setPeriod(k)}>{lbl}</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-box">
          <div className="kpi-box-label">Pedidos de orçamento</div>
          <div className="kpi-box-val">{total}</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-box-label">Valor em propostas</div>
          <div className="kpi-box-val">{fmtMoney(valorPropostas)}</div>
        </div>
        <div className="kpi-box dark">
          <div className="kpi-box-label">Fechados</div>
          <div className="kpi-box-val">{fmtMoney(valorFechado)}</div>
          <div className="kpi-box-sub">{fechados.length} projetos</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-box-label">Perdidos</div>
          <div className="kpi-box-val">{perdidos.length}</div>
        </div>
      </div>

      {/* funil */}
      <div className="section-title">Funil de conversão</div>
      <div className="card funnel-card">
        {funnel.map((f) => (
          <div className="funnel-row" key={f.stage}>
            <div className="funnel-label">{f.stage}</div>
            <div className="funnel-bar-track">
              <div className="funnel-bar-fill" style={{ width: `${f.pct}%` }}>
                <span className="funnel-count">{f.count}</span>
              </div>
            </div>
            <div className="funnel-pct">{f.pct}%</div>
          </div>
        ))}
        <div className="funnel-summary">Taxa de conversão geral: <strong>{taxaConversao}%</strong> dos pedidos viram projeto fechado.</div>
      </div>

      {/* ticket médio */}
      <div className="section-title">Ticket médio</div>
      <div className="card ticket-card">
        <div className="ticket-compare">
          <div className="ticket-col">
            <div className="ticket-label">Fechados</div>
            <div className="ticket-val green">{fmtMoney(ticketFechados)}</div>
          </div>
          <div className="ticket-col">
            <div className="ticket-label">Perdidos</div>
            <div className="ticket-val">{fmtMoney(ticketPerdidos)}</div>
          </div>
        </div>
        <div className="ticket-insight">
          {ticketPerdidos > ticketFechados
            ? <>Você está perdendo os projetos de <strong>maior valor</strong>. Vale revisar como apresenta a proposta para tickets acima de {fmtMoney(ticketPerdidos)}.</>
            : <>Seus projetos fechados têm ticket <strong>{Math.round((ticketFechados / (ticketPerdidos || 1) - 1) * 100)}% maior</strong> que os perdidos — sinal de que o problema não é preço.</>}
        </div>
      </div>

      {/* por origem */}
      <div className="section-title">Por origem</div>
      <div className="card origem-card">
        {porOrigem.map((o) => (
          <div className="origem-row" key={o.origem}>
            <div className="origem-name">{o.origem}</div>
            <div className="origem-bar-track"><div className="origem-bar-fill" style={{ width: `${o.conversao}%` }} /></div>
            <div className="origem-stats">{o.fechados}/{o.total} <span>· {o.conversao}%</span></div>
          </div>
        ))}
      </div>

      {melhorOrigem && (
        <div className="insight-card">
          <div className="insight-icon"><IconBolt /></div>
          <div className="insight-text">
            <strong>{melhorOrigem.origem} converte {melhorOrigem.conversao}% dos leads</strong> — seu melhor canal agora. Antes de testar canais novos, dobre a aposta no que já funciona.
          </div>
        </div>
      )}
    </>
  )
}
