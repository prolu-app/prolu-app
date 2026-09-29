import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { supabase, supabaseReady, fetchAllRows } from '../../services/supabaseClient.js'
import { resumoFechamentos, fechamentosLocais, isoLocal, FECHAMENTOS_VAZIO } from '../../services/fechamentos.js'
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
  return [new Date(y, 0, 1), eod(y, m, day)] // ano vigente: 01/01 até hoje
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
        id: r.id,
        empresaId: 'demo',
        dataEntrada: r[map['data_entrada']],
        dataFechamento: r[map['data_fechamento']],
        status: r[map['status']],
        valor: Number(r[map['valor']]) || 0,
        proposta: r[map['proposta']],
      })))
      setLoading(false)
      return
    }

    setLoading(true)

    // A empresa "casa" do prolu_admin nunca deve aparecer nas métricas admin.
    const proluEmpresaId = user?.empresaId || null
    let empresasQuery = supabase.from('empresas').select('id, nome').order('nome')
    // Colunas e linhas de TODOS os escritórios passam fácil do limite de 1000
    // linhas por requisição do Supabase — sem paginar, o excedente era cortado em
    // silêncio e alguns escritórios apareciam com números menores.
    const colunasQuery = () => {
      const q = supabase.from('crm_colunas').select('id, empresa_id, opcoes').order('id')
      return proluEmpresaId ? q.neq('empresa_id', proluEmpresaId) : q
    }
    const linhasQuery = () => {
      const q = supabase.from('crm_linhas').select('id, empresa_id, valores').order('id')
      return proluEmpresaId ? q.neq('empresa_id', proluEmpresaId) : q
    }
    if (proluEmpresaId) empresasQuery = empresasQuery.neq('id', proluEmpresaId)

    const [{ data: emp }, { data: cols }, { data: linhas }] = await Promise.all([
      empresasQuery, fetchAllRows(colunasQuery), fetchAllRows(linhasQuery),
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

  // Fechamentos por escritório: fonte única (fn_fechamentos_periodo), filtrada por data de fechamento.
  // Antes eram contados pela data de ENTRADA — projeto que entrou no ano anterior e fechou
  // neste ano ficava de fora.
  const [fechRemoto, setFechRemoto] = useState({})
  useEffect(() => {
    if (!supabaseReady) return
    let vivo = true
    resumoFechamentos({ inicio: isoLocal(range[0]), fim: isoLocal(range[1]) })
      .then(({ data }) => { if (vivo) setFechRemoto(data) })
    return () => { vivo = false }
  }, [range])

  const fechPorEmpresa = useMemo(() => {
    if (supabaseReady) return fechRemoto
    const map = {}
    for (const f of fechamentosLocais(rows, { status: 'status', dataFechamento: 'dataFechamento', valor: 'valor' }, isoLocal(range[0]), isoLocal(range[1]))) {
      if (!map[f.empresaId]) map[f.empresaId] = { qtd: 0, valor: 0 }
      map[f.empresaId].qtd++
      map[f.empresaId].valor += f.valor
    }
    return map
  }, [fechRemoto, rows, range])

  const metrics = useMemo(() => {
    const comProposta = rowsPeriodo.filter(r => r.proposta === 'Sim')
    // soma só os escritórios listados (exclui a empresa "casa" do prolu_admin)
    const fech = empresas.map(e => fechPorEmpresa[e.id] || FECHAMENTOS_VAZIO)
    return {
      totalPedidos: rowsPeriodo.length,
      totalFechados: fech.reduce((s, f) => s + f.qtd, 0),
      valorFechado: fech.reduce((s, f) => s + f.valor, 0),
      valorPropostas: comProposta.reduce((s, r) => s + r.valor, 0),
    }
  }, [rowsPeriodo, empresas, fechPorEmpresa])

  const ranking = useMemo(() => {
    // taxa de conversão mantém a definição anterior (fechados por data de entrada) — fora do escopo da fonte única
    const map = {}
    for (const r of rowsPeriodo) {
      if (!map[r.empresaId]) map[r.empresaId] = { fechadosPorEntrada: 0, comProposta: 0 }
      if (r.proposta === 'Sim') map[r.empresaId].comProposta++
      if (r.status === 'Fechado') map[r.empresaId].fechadosPorEntrada++
    }
    return empresas
      .map(e => {
        const s = map[e.id] || { fechadosPorEntrada: 0, comProposta: 0 }
        const f = fechPorEmpresa[e.id] || FECHAMENTOS_VAZIO
        return {
          id: e.id,
          nome: e.nome,
          valorFechado: f.valor,
          fechados: f.qtd,
          taxa: s.comProposta > 0 ? Math.round((s.fechadosPorEntrada / s.comProposta) * 100) : null,
        }
      })
      .filter(e => e.fechados > 0)
      .sort((a, b) => b.valorFechado - a.valorFechado)
      .slice(0, 5)
  }, [rowsPeriodo, empresas, fechPorEmpresa])

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
