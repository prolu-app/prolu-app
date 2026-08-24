import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import { CRM_COLUMNS, CRM_ROWS } from '../../data/seed.js'
import { IconArrowRight } from '../../components/Icons.jsx'
import './AdminInicio.css'

const PERIOD_OPTS = [
  ['ano', 'Este ano'],
  ['30d', 'Últimos 30 dias'],
]

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function parseDateStr(s) {
  if (!s) return null
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}

function getPeriodRange(period) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = now.getDate()
  const eod = (yr, mo, d) => new Date(yr, mo, d, 23, 59, 59, 999)
  if (period === '30d') return [new Date(y, m, day - 29), eod(y, m, day)]
  return [new Date(y, 0, 1), eod(y, 11, 31)]
}

function inPeriod(dateStr, [start, end]) {
  const d = parseDateStr(dateStr)
  return d ? d >= start && d <= end : false
}

// mesmo padrão do Dashboard: cada empresa tem suas próprias colunas
// (ids diferentes), então o mapeamento slug → id precisa ser feito por empresa.
function parseColForDash(c) {
  const isObj = c.opcoes != null && !Array.isArray(c.opcoes)
  return { id: c.id, slug: isObj ? (c.opcoes?.slug || null) : null }
}

function buildColMap(cols) {
  const map = {}
  cols.forEach(c => { if (c.slug) map[c.slug] = c.id })
  return map
}

export default function AdminInicio() {
  const { user, isProluAdmin, enterAsEmpresa } = useAuth()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('ano')
  const [empresas, setEmpresas] = useState([])
  const [rows, setRows] = useState([]) // linhas de todas as empresas, já normalizadas
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) {
      setEmpresas([{ id: 'demo', nome: user?.empresa || 'Estúdio Exemplo' }])
      // seed já vem no formato pós-parse (id/slug diretos), diferente das
      // linhas reais do Supabase que guardam o slug dentro de `opcoes`.
      const map = buildColMap(CRM_COLUMNS)
      setRows(CRM_ROWS.map(r => ({
        empresaId: 'demo',
        dataEntrada: r[map['data_entrada']],
        status: r[map['status']],
        valor: Number(r[map['valor']]) || 0,
        proposta: r[map['proposta']],
      })))
      setLoading(false)
      return
    }

    setLoading(true)
    const [{ data: emp }, { data: cols }, { data: linhas }] = await Promise.all([
      supabase.from('empresas').select('id, nome').order('nome'),
      supabase.from('crm_colunas').select('id, empresa_id, opcoes'),
      supabase.from('crm_linhas').select('id, empresa_id, valores'),
    ])

    const colsByEmpresa = {}
    for (const c of cols || []) {
      if (!colsByEmpresa[c.empresa_id]) colsByEmpresa[c.empresa_id] = []
      colsByEmpresa[c.empresa_id].push(parseColForDash(c))
    }
    const mapByEmpresa = {}
    for (const [empId, cs] of Object.entries(colsByEmpresa)) mapByEmpresa[empId] = buildColMap(cs)

    setEmpresas(emp || [])
    setRows((linhas || []).map(l => {
      const map = mapByEmpresa[l.empresa_id] || {}
      const v = l.valores || {}
      return {
        empresaId: l.empresa_id,
        dataEntrada: v[map['data_entrada']],
        status: v[map['status']],
        valor: Number(v[map['valor']]) || 0,
        proposta: v[map['proposta']],
      }
    }))
    setLoading(false)
  }

  const range = useMemo(() => getPeriodRange(period), [period])
  const rowsPeriodo = useMemo(() => rows.filter(r => inPeriod(r.dataEntrada, range)), [rows, range])

  const metrics = useMemo(() => {
    const fechados = rowsPeriodo.filter(r => r.status === 'Fechado')
    const comProposta = rowsPeriodo.filter(r => r.proposta === 'Sim')
    return {
      totalPedidos: rowsPeriodo.length,
      totalFechados: fechados.length,
      valorFechado: fechados.reduce((s, r) => s + r.valor, 0),
      valorPropostas: comProposta.reduce((s, r) => s + r.valor, 0),
    }
  }, [rowsPeriodo])

  const ranking = useMemo(() => {
    const map = {}
    for (const r of rowsPeriodo) {
      if (!map[r.empresaId]) map[r.empresaId] = { fechados: 0, valorFechado: 0, comProposta: 0 }
      if (r.proposta === 'Sim') map[r.empresaId].comProposta++
      if (r.status === 'Fechado') { map[r.empresaId].fechados++; map[r.empresaId].valorFechado += r.valor }
    }
    return empresas
      .map(e => {
        const s = map[e.id] || { fechados: 0, valorFechado: 0, comProposta: 0 }
        return {
          id: e.id,
          nome: e.nome,
          valorFechado: s.valorFechado,
          fechados: s.fechados,
          taxa: s.comProposta > 0 ? Math.round((s.fechados / s.comProposta) * 100) : null,
        }
      })
      .filter(e => e.fechados > 0)
      .sort((a, b) => b.valorFechado - a.valorFechado)
      .slice(0, 5)
  }, [rowsPeriodo, empresas])

  function verEmpresa(e) {
    enterAsEmpresa(e.id, e.nome)
    navigate('/dashboard')
  }

  if (!isProluAdmin) return null

  if (loading) return (
    <div className="page-header">
      <div className="page-title">Visão geral</div>
      <div className="page-sub">Carregando dados de todos os escritórios…</div>
    </div>
  )

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Visão geral</div>
          <div className="page-sub">Acompanhamento de todos os escritórios</div>
        </div>
        <div className="adm-period-pills">
          {PERIOD_OPTS.map(([k, lbl]) => (
            <button
              key={k}
              className={`adm-period-pill${period === k ? ' active' : ''}`}
              onClick={() => setPeriod(k)}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-highlight-card">
        <div>
          <div className="adm-highlight-label">Projetos fechados</div>
          <div className="adm-highlight-val adm-highlight-green">{metrics.totalFechados}</div>
          <div className="adm-highlight-sub">no período selecionado</div>
        </div>
        <div className="adm-highlight-divider" />
        <div>
          <div className="adm-highlight-label">Valor total</div>
          <div className="adm-highlight-val">{fmtMoney(metrics.valorFechado)}</div>
        </div>
      </div>

      <div className="adm-stats-grid">
        <div className="adm-stat-card">
          <div className="adm-stat-label">Escritórios ativos</div>
          <div className="adm-stat-val">{empresas.length}</div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-label">Pedidos de orçamento no período</div>
          <div className="adm-stat-val">{metrics.totalPedidos}</div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-label">Valor em propostas</div>
          <div className="adm-stat-val">{fmtMoney(metrics.valorPropostas)}</div>
        </div>
      </div>

      <div className="section-title">Destaques do período</div>
      <div className="card adm-rank-card">
        {ranking.length === 0 ? (
          <p className="adm-rank-empty">Nenhum fechamento no período.</p>
        ) : (
          <>
            <div className="adm-rank-row adm-rank-header">
              <span>Escritório</span>
              <span>Valor fechado</span>
              <span>Fechamentos</span>
              <span>Conversão</span>
              <span />
            </div>
            {ranking.map(e => (
              <div className="adm-rank-row" key={e.id}>
                <span className="adm-rank-name">{e.nome}</span>
                <span>{fmtMoney(e.valorFechado)}</span>
                <span>{e.fechados}</span>
                <span>{e.taxa !== null ? `${e.taxa}%` : '—'}</span>
                <button className="adm-rank-btn" onClick={() => verEmpresa(e)}>Ver</button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="adm-action-grid">
        <button className="adm-action-card" onClick={() => navigate('/admin/escritorios')}>
          <span>Ver todos os escritórios</span>
          <IconArrowRight />
        </button>
        <button className="adm-action-card" onClick={() => navigate('/base-conhecimento')}>
          <span>Gerenciar Base de Conhecimento</span>
          <IconArrowRight />
        </button>
      </div>
    </>
  )
}
