import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import { IconSearch } from '../../components/Icons.jsx'
import './AdminEscritorios.css'

const PERIOD_OPTS = [
  ['ano', 'Este ano'],
  ['30d', 'Últimos 30 dias'],
]

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
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

// mesmo padrão do Dashboard/AdminInicio: cada empresa tem suas próprias
// colunas (ids diferentes), então o mapeamento slug → id é feito por empresa.
function parseColForDash(c) {
  const isObj = c.opcoes != null && !Array.isArray(c.opcoes)
  return { id: c.id, slug: isObj ? (c.opcoes?.slug || null) : null }
}

function buildColMap(cols) {
  const map = {}
  cols.forEach(c => { if (c.slug) map[c.slug] = c.id })
  return map
}

export default function AdminEscritorios() {
  const { user, isProluAdmin, enterAsEmpresa } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('ano')
  const [busca, setBusca] = useState('')
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)

    // A empresa "casa" do prolu_admin nunca deve aparecer nas métricas admin.
    const proluEmpresaId = user?.empresaId || null
    let empresasQuery = supabase.from('empresas').select('id, nome').order('nome')
    let usuariosQuery = supabase.from('usuarios').select('id, nome, email, role, empresa_id')
    let colunasQuery = supabase.from('crm_colunas').select('id, empresa_id, opcoes')
    let linhasQuery = supabase.from('crm_linhas').select('id, empresa_id, valores, created_at')
    if (proluEmpresaId) {
      empresasQuery = empresasQuery.neq('id', proluEmpresaId)
      usuariosQuery = usuariosQuery.neq('empresa_id', proluEmpresaId)
      colunasQuery = colunasQuery.neq('empresa_id', proluEmpresaId)
      linhasQuery = linhasQuery.neq('empresa_id', proluEmpresaId)
    }

    const [{ data: emp, error: empErr }, { data: usu }, { data: cols }, { data: linhas }] = await Promise.all([
      empresasQuery, usuariosQuery, colunasQuery, linhasQuery,
    ])
    if (empErr) { toast('Erro ao carregar escritórios'); setLoading(false); return }

    const colsByEmpresa = {}
    for (const c of cols || []) {
      if (!colsByEmpresa[c.empresa_id]) colsByEmpresa[c.empresa_id] = []
      colsByEmpresa[c.empresa_id].push(parseColForDash(c))
    }
    const mapByEmpresa = {}
    for (const [empId, cs] of Object.entries(colsByEmpresa)) mapByEmpresa[empId] = buildColMap(cs)

    const linhasByEmpresa = {}
    for (const l of linhas || []) {
      const map = mapByEmpresa[l.empresa_id] || {}
      const v = l.valores || {}
      if (!linhasByEmpresa[l.empresa_id]) linhasByEmpresa[l.empresa_id] = []
      linhasByEmpresa[l.empresa_id].push({
        dataEntrada: v[map['data_entrada']],
        status: v[map['status']],
        valor: Number(v[map['valor']]) || 0,
        proposta: v[map['proposta']],
        createdAt: l.created_at,
      })
    }

    setEmpresas((emp || []).map(e => {
      const usuariosEmpresa = (usu || []).filter(u => u.empresa_id === e.id)
      const master = usuariosEmpresa.find(u => u.role === 'master') || usuariosEmpresa[0] || null
      const todasLinhas = linhasByEmpresa[e.id] || []
      const ultimoAcesso = todasLinhas.reduce((max, r) => (!max || (r.createdAt && r.createdAt > max)) ? r.createdAt : max, null)
      return {
        id: e.id,
        nome: e.nome,
        masterNome: master?.nome || master?.email || '—',
        totalUsuarios: usuariosEmpresa.length,
        linhas: todasLinhas,
        ultimoAcesso,
      }
    }))
    setLoading(false)
  }

  const range = useMemo(() => getPeriodRange(period), [period])

  const escritorios = useMemo(() => {
    return empresas.map(e => {
      const linhasPeriodo = e.linhas.filter(r => inPeriod(r.dataEntrada, range))
      const fechados = linhasPeriodo.filter(r => r.status === 'Fechado')
      const comProposta = linhasPeriodo.filter(r => r.proposta === 'Sim')
      return {
        ...e,
        pedidosPeriodo: linhasPeriodo.length,
        qtdFechamentos: fechados.length,
        valorFechamentos: fechados.reduce((s, r) => s + r.valor, 0),
        taxaConversao: comProposta.length > 0 ? Math.round((fechados.length / comProposta.length) * 100) : null,
      }
    })
  }, [empresas, range])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = q ? escritorios.filter(e => e.nome.toLowerCase().includes(q)) : escritorios
    return [...lista].sort((a, b) => b.valorFechamentos - a.valorFechamentos)
  }, [escritorios, busca])

  function abrirEmpresa(e) {
    enterAsEmpresa(e.id, e.nome)
    navigate('/')
  }

  if (!isProluAdmin) return null

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Escritórios</div>
          <div className="page-sub">Todos os escritórios cadastrados na Prolu.</div>
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

      <div className="esc-search">
        <IconSearch className="esc-search-icon" />
        <input
          className="esc-search-input"
          placeholder="Buscar por nome do escritório…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="esc-loading">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="esc-loading">
          {empresas.length === 0 ? 'Nenhum escritório cadastrado ainda.' : 'Nenhum escritório encontrado.'}
        </p>
      ) : (
        <div className="esc-grid">
          {filtrados.map(e => (
            <div
              className="esc-card"
              key={e.id}
              onClick={() => abrirEmpresa(e)}
              onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirEmpresa(e) } }}
              role="button"
              tabIndex={0}
            >
              <div className="esc-card-header">
                <div className="esc-avatar">{(e.nome || '?').charAt(0).toUpperCase()}</div>
                <div className="esc-card-titles">
                  <div className="esc-name">{e.nome}</div>
                  <div className="esc-master">{e.masterNome}</div>
                </div>
              </div>

              <div className="esc-stats">
                <div className="esc-stat">
                  <span className="esc-stat-label">Usuários</span>
                  <span className="esc-stat-val">{e.totalUsuarios}</span>
                </div>
                <div className="esc-stat">
                  <span className="esc-stat-label">Pedidos no período</span>
                  <span className="esc-stat-val">{e.pedidosPeriodo}</span>
                </div>
                <div className="esc-stat">
                  <span className="esc-stat-label">Fechamentos</span>
                  <span className="esc-stat-val">{e.qtdFechamentos}</span>
                </div>
                <div className="esc-stat">
                  <span className="esc-stat-label">Valor fechado</span>
                  <span className="esc-stat-val">{fmtMoney(e.valorFechamentos)}</span>
                </div>
                <div className="esc-stat">
                  <span className="esc-stat-label">Conversão</span>
                  <span className="esc-stat-val">{e.taxaConversao !== null ? `${e.taxaConversao}%` : '—'}</span>
                </div>
                <div className="esc-stat">
                  <span className="esc-stat-label">Último acesso</span>
                  <span className="esc-stat-val esc-stat-date">{fmtDate(e.ultimoAcesso)}</span>
                </div>
              </div>

              <div className="esc-open-row">
                <span className="esc-open-link">Abrir →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
