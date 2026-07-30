import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { CRM_COLUMNS, CRM_ROWS } from '../data/seed.js'
import { DatePicker } from '../components/DatePicker.jsx'
import './Dashboard.css'

const COLOR_VARS = {
  gray: 'var(--ink-40)', blue: 'var(--blue-ink)', green: 'var(--green-deep)',
  orange: 'var(--orange)', violet: 'var(--violet-ink)', red: 'var(--red)',
}

function fmtMoney(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function parseDateStr(s) {
  if (!s) return null
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}

function toISO(d) {
  return d.toISOString().split('T')[0]
}

function getPeriodRange(period) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = now.getDate()
  // eod: end of day às 23:59:59 para incluir registros parseados ao meio-dia
  const eod = (yr, mo, d) => new Date(yr, mo, d, 23, 59, 59, 999)
  if (period === '30d') return [new Date(y, m, day - 29), eod(y, m, day)]
  if (period === 'mes') return [new Date(y, m, 1), eod(y, m + 1, 0)]
  if (period === 'trimestre') {
    const q = Math.floor(m / 3)
    return [new Date(y, q * 3, 1), eod(y, q * 3 + 3, 0)]
  }
  return [new Date(y, 0, 1), eod(y, 11, 31)]
}

function inPeriod(dateStr, [start, end]) {
  const d = parseDateStr(dateStr)
  return d ? d >= start && d <= end : false
}

function parseColForDash(c) {
  const isObj = c.opcoes != null && !Array.isArray(c.opcoes)
  const fixed = c.fixo === true || (isObj && c.opcoes?.fixed === true)
  return {
    id: c.id,
    slug: isObj ? (c.opcoes?.slug || null) : null,
    options: fixed
      ? (isObj ? (c.opcoes?.items || []) : (Array.isArray(c.opcoes) ? c.opcoes : []))
      : (Array.isArray(c.opcoes) ? c.opcoes : []),
  }
}

function buildColMap(cols) {
  const map = {}
  cols.forEach(c => { if (c.slug) map[c.slug] = c.id })
  return map
}

function groupByField(rows, fieldId, statusId, valorId, propostaId) {
  if (!fieldId || !statusId) return []
  const map = {}
  rows.forEach(r => {
    const key = r[fieldId] || '(não informado)'
    if (!map[key]) map[key] = { name: key, total: 0, comProposta: 0, fechados: 0, somaFechado: 0, perdidosComProposta: 0, somaPerdido: 0 }
    map[key].total++
    if (r[propostaId] === 'Sim') map[key].comProposta++
    if (r[statusId] === 'Fechado') { map[key].fechados++; map[key].somaFechado += Number(r[valorId]) || 0 }
    if (r[statusId] === 'Perdido' && r[propostaId] === 'Sim') { map[key].perdidosComProposta++; map[key].somaPerdido += Number(r[valorId]) || 0 }
  })
  return Object.values(map).map(g => ({
    ...g,
    taxa: g.comProposta > 0 ? Math.round((g.fechados / g.comProposta) * 100) : null,
    ticketMedio: g.fechados > 0 ? Math.round(g.somaFechado / g.fechados) : null,
    ticketMedioPerdidos: g.perdidosComProposta > 0 ? Math.round(g.somaPerdido / g.perdidosComProposta) : null,
  })).sort((a, b) => b.total - a.total)
}

function GroupSimple({ groups }) {
  return (
    <>
      <div className="grupo-header">
        <span className="grupo-col-name">Nome</span>
        <span className="grupo-col-num">Conversão</span>
        <span className="grupo-col-num">Total fechado</span>
        <span className="grupo-col-num">Ticket médio</span>
        <span className="grupo-col-num">Ticket perdidos</span>
      </div>
      {groups.map(g => (
        <div className="grupo-row" key={g.name}>
          <span className="grupo-col-name">{g.name}</span>
          <span className={`grupo-col-num${g.taxa !== null ? ' grupo-taxa' : ''}`}>
            {g.taxa !== null ? `${g.taxa}%` : '—'}
          </span>
          <span className="grupo-col-num">{g.fechados > 0 ? fmtMoney(g.somaFechado) : '—'}</span>
          <span className="grupo-col-num">{g.ticketMedio !== null ? fmtMoney(g.ticketMedio) : '—'}</span>
          <span className="grupo-col-num">{g.ticketMedioPerdidos !== null ? fmtMoney(g.ticketMedioPerdidos) : '—'}</span>
        </div>
      ))}
    </>
  )
}

const PERIOD_OPTS = [
  ['30d',     'Últimos 30 dias'],
  ['mes',     'Este mês'],
  ['trimestre', 'Trimestre'],
  ['ano',     'Este ano'],
  ['custom',  'Período personalizado'],
]

export default function Dashboard() {
  const { user } = useAuth()
  const [period, setPeriod] = useState('30d')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [icpFilter, setIcpFilter] = useState(false)
  const [cols, setCols] = useState([])
  const [allRows, setAllRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [user?.empresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    if (!supabaseReady || !user?.empresaId) {
      setCols(CRM_COLUMNS)
      setAllRows(CRM_ROWS)
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: dbCols }, { data: linhas }] = await Promise.all([
      supabase.from('crm_colunas').select('*').eq('empresa_id', user.empresaId).order('ordem'),
      supabase.from('crm_linhas').select('id, valores').eq('empresa_id', user.empresaId),
    ])
    setCols((dbCols || []).map(parseColForDash))
    setAllRows((linhas || []).map(l => ({ id: l.id, ...l.valores })))
    setLoading(false)
  }

  const colMap = useMemo(() => buildColMap(cols), [cols])

  const origemOptions = useMemo(() => {
    const col = cols.find(c => c.slug === 'origem')
    return col?.options || []
  }, [cols])

  const range = useMemo(() => {
    if (period === 'custom') {
      const s = parseDateStr(customRange.start)
      const e = parseDateStr(customRange.end)
      if (!s || !e || s > e) return null
      const eod = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999)
      return [s, eod]
    }
    return getPeriodRange(period)
  }, [period, customRange])

  const rows = useMemo(() => {
    const deId = colMap['data_entrada']
    const icpId = colMap['icp']
    if (!deId) return allRows
    if (!range) return []
    return allRows.filter(r => {
      if (!inPeriod(r[deId], range)) return false
      if (icpFilter && r[icpId] !== 'Sim') return false
      return true
    })
  }, [allRows, colMap, range, icpFilter])

  const m = useMemo(() => {
    const sid = colMap['status']
    const vid = colMap['valor']
    const pid = colMap['proposta']
    const dfid = colMap['data_fechamento']
    const deid = colMap['data_entrada']

    const total = rows.length
    const comProposta = rows.filter(r => r[pid] === 'Sim')
    const fechados = rows.filter(r => r[sid] === 'Fechado')
    const perdidos = rows.filter(r => r[sid] === 'Perdido')
    const perdidosComProposta = perdidos.filter(r => r[pid] === 'Sim')

    const somaValor = arr => arr.reduce((s, r) => s + (Number(r[vid]) || 0), 0)
    const mediaValor = arr => arr.length ? somaValor(arr) / arr.length : 0

    const taxaConversao = comProposta.length > 0 ? Math.round((fechados.length / comProposta.length) * 100) : null

    let tempoMedio = null
    if (fechados.length > 0 && dfid && deid) {
      const dias = fechados.map(r => {
        const de = parseDateStr(r[deid])
        const df = parseDateStr(r[dfid])
        return de && df ? Math.round((df - de) / 86400000) : null
      }).filter(d => d !== null && d >= 0)
      if (dias.length > 0) tempoMedio = Math.round(dias.reduce((s, d) => s + d, 0) / dias.length)
    }

    return {
      total,
      nProposta: comProposta.length,
      nFechados: fechados.length,
      nPerdidos: perdidos.length,
      nPerdidosComProposta: perdidosComProposta.length,
      valorPropostas: somaValor(comProposta),
      valorFechado: somaValor(fechados),
      valorPerdido: somaValor(perdidos),
      ticketFechados: mediaValor(fechados),
      ticketPerdidos: mediaValor(perdidosComProposta),
      taxaConversao,
      tempoMedio,
    }
  }, [rows, colMap])

  const porOrigem = useMemo(
    () => groupByField(rows, colMap['origem'], colMap['status'], colMap['valor'], colMap['proposta']),
    [rows, colMap],
  )
  const porSegmento = useMemo(
    () => groupByField(rows, colMap['segmento'], colMap['status'], colMap['valor'], colMap['proposta']),
    [rows, colMap],
  )
  const porTipo = useMemo(
    () => groupByField(rows, colMap['tipo_projeto'], colMap['status'], colMap['valor'], colMap['proposta']),
    [rows, colMap],
  )

  if (loading) return (
    <div className="page-header">
      <div className="page-title">Dashboard</div>
      <div className="page-sub">Carregando seus dados…</div>
    </div>
  )

  const {
    total, nProposta, nFechados, nPerdidos, nPerdidosComProposta,
    valorPropostas, valorFechado, valorPerdido,
    ticketFechados, ticketPerdidos,
    taxaConversao, tempoMedio,
  } = m

  const funnelSteps = [
    { label: 'Pedidos',   count: total },
    { label: 'Propostas', count: nProposta },
    { label: 'Fechados',  count: nFechados },
  ]

  const hasTicketData = nFechados >= 1 && nPerdidosComProposta >= 1
  const customIncomplete = period === 'custom' && !range

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Onde estão suas oportunidades, e o que elas estão te dizendo.</div>
      </div>

      {/* Filtros */}
      <div className="dash-filter-area">
        <div className="dash-filter-row">
          <div className="dash-filters">
            {PERIOD_OPTS.map(([k, lbl]) => (
              <button
                key={k}
                className={`dash-filter-chip${period === k ? ' active' : ''}`}
                onClick={() => setPeriod(k)}
              >
                {lbl}
              </button>
            ))}
          </div>

          <label className={`dash-icp-toggle${icpFilter ? ' on' : ''}`}>
            <input type="checkbox" checked={icpFilter} onChange={e => setIcpFilter(e.target.checked)} />
            <span className="dash-icp-switch" />
            <span className="dash-icp-label">
              ICP <span className="dash-icp-state">{icpFilter ? 'Sim' : 'Não'}</span>
            </span>
          </label>
        </div>

        {period === 'custom' && (
          <div className="dash-custom-range">

            <span className="dash-range-label">De</span>
            <DatePicker
              value={customRange.start}
              onChange={v => setCustomRange(p => ({ ...p, start: v }))}
              placeholder="Data inicial"
              className="dash-range-input"
              max={customRange.end || toISO(new Date())}
            />
            <span className="dash-range-sep">→</span>
            <span className="dash-range-label">Até</span>
            <DatePicker
              value={customRange.end}
              onChange={v => setCustomRange(p => ({ ...p, end: v }))}
              placeholder="Data final"
              className="dash-range-input"
              min={customRange.start || undefined}
              max={toISO(new Date())}
            />
            {customIncomplete && (
              <span className="dash-range-hint">Selecione as duas datas para filtrar.</span>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-box">
          <div className="kpi-box-label">Pedidos de orçamento</div>
          <div className="kpi-box-val">{total > 0 ? total : '—'}</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-box-label">Valor em propostas</div>
          <div className="kpi-box-val">{nProposta > 0 ? fmtMoney(valorPropostas) : '—'}</div>
          {nProposta > 0 && (
            <div className="kpi-box-sub">{nProposta} {nProposta === 1 ? 'projeto' : 'projetos'}</div>
          )}
        </div>
        <div className="kpi-box dark">
          <div className="kpi-box-label">Fechados</div>
          <div className="kpi-box-val">{nFechados > 0 ? fmtMoney(valorFechado) : '—'}</div>
          {nFechados > 0 && (
            <div className="kpi-box-sub">{nFechados} {nFechados === 1 ? 'projeto' : 'projetos'}</div>
          )}
        </div>
        <div className="kpi-box">
          <div className="kpi-box-label">Perdidos</div>
          <div className="kpi-box-val">{nPerdidos > 0 ? fmtMoney(valorPerdido) : '—'}</div>
          {nPerdidos > 0 && (
            <div className="kpi-box-sub">{nPerdidos} {nPerdidos === 1 ? 'projeto' : 'projetos'}</div>
          )}
        </div>
      </div>

      {/* Funil de conversão */}
      <div className="section-title">Funil de conversão</div>
      <div className="card funnel-card">
        {funnelSteps.map(f => {
          const pct = total > 0 ? Math.round((f.count / total) * 100) : 0
          return (
            <div className="funnel-row" key={f.label}>
              <div className="funnel-label">{f.label}</div>
              <div className="funnel-bar-track">
                <div className="funnel-bar-fill" style={{ width: total > 0 ? `${pct}%` : '0%' }}>
                  {f.count > 0 && <span className="funnel-count">{f.count}</span>}
                </div>
              </div>
              <div className="funnel-pct">{total > 0 ? `${pct}%` : '—'}</div>
            </div>
          )
        })}
        <div className="funnel-footer">
          <p className="funnel-insight">
            {taxaConversao !== null
              ? <>Taxa de conversão: <strong>{taxaConversao}%</strong> das propostas enviadas viraram projeto fechado</>
              : <span className="funnel-muted">Aguardando dados suficientes para calcular a taxa de conversão.</span>
            }
          </p>
          {tempoMedio !== null && (
            <p className="funnel-insight">
              Tempo médio de fechamento: em média os projetos fecham em <strong>{tempoMedio} dias</strong>.
            </p>
          )}
        </div>
      </div>

      {/* Ticket médio */}
      <div className="section-title">Ticket médio</div>
      <div className="card ticket-card">
        <div className="ticket-compare">
          <div className="ticket-col">
            <div className="ticket-label">Fechados</div>
            <div className={`ticket-val${nFechados > 0 ? ' green' : ''}`}>
              {nFechados > 0 ? fmtMoney(ticketFechados) : '—'}
            </div>
          </div>
          <div className="ticket-col">
            <div className="ticket-label">Perdidos com proposta</div>
            <div className="ticket-val">
              {nPerdidosComProposta > 0 ? fmtMoney(ticketPerdidos) : '—'}
            </div>
          </div>
        </div>
        {hasTicketData && (
          <div className="ticket-insight">
            {ticketPerdidos > ticketFechados
              ? <>Você está perdendo os projetos de <strong>maior valor</strong>. Vale revisar como apresenta a proposta para tickets acima de {fmtMoney(ticketPerdidos)}.</>
              : ticketFechados > ticketPerdidos
                ? <>Seus projetos fechados têm ticket <strong>{Math.round((ticketFechados / ticketPerdidos - 1) * 100)}% maior</strong> que os perdidos com proposta — sinal de que o problema não é preço.</>
                : <>O ticket médio dos projetos fechados e perdidos com proposta é igual.</>
            }
          </div>
        )}
      </div>

      {/* Por origem */}
      {porOrigem.length > 0 && (
        <>
          <div className="section-title">Por origem</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="grupo-scroll">
              <div className="grupo-header grupo-header-wide">
                <span className="grupo-col-name">Origem</span>
                <span className="grupo-col-num">Pedidos</span>
                <span className="grupo-col-num">Propostas</span>
                <span className="grupo-col-num">Fechados</span>
                <span className="grupo-col-num">Conversão</span>
                <span className="grupo-col-num">Total fechado</span>
                <span className="grupo-col-num">Ticket médio</span>
                <span className="grupo-col-num">Ticket perdidos</span>
              </div>
              {porOrigem.map(g => {
                const opt = origemOptions.find(o => o.value === g.name)
                return (
                  <div className="grupo-row grupo-row-wide" key={g.name}>
                    <span className="grupo-col-name">
                      {opt && (
                        <span className="grupo-dot" style={{ background: COLOR_VARS[opt.color] || COLOR_VARS.gray }} />
                      )}
                      {g.name}
                    </span>
                    <span className="grupo-col-num">{g.total}</span>
                    <span className="grupo-col-num">{g.comProposta}</span>
                    <span className="grupo-col-num">{g.fechados}</span>
                    <span className={`grupo-col-num${g.taxa !== null ? ' grupo-taxa' : ''}`}>
                      {g.taxa !== null ? `${g.taxa}%` : '—'}
                    </span>
                    <span className="grupo-col-num">{g.fechados > 0 ? fmtMoney(g.somaFechado) : '—'}</span>
                    <span className="grupo-col-num">{g.ticketMedio !== null ? fmtMoney(g.ticketMedio) : '—'}</span>
                    <span className="grupo-col-num">{g.ticketMedioPerdidos !== null ? fmtMoney(g.ticketMedioPerdidos) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Por segmento e Por tipo de projeto */}
      {(porSegmento.length > 0 || porTipo.length > 0) && (
        <div className="dash-two-col">
          {porSegmento.length > 0 && (
            <div>
              <div className="section-title">Por segmento</div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <GroupSimple groups={porSegmento} />
              </div>
            </div>
          )}
          {porTipo.length > 0 && (
            <div>
              <div className="section-title">Por tipo de projeto</div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <GroupSimple groups={porTipo} />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
