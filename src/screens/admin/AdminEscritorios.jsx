import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { supabase, supabaseReady, fetchAllRows } from '../../services/supabaseClient.js'
import { resumoFechamentos, isoLocal, FECHAMENTOS_VAZIO } from '../../services/fechamentos.js'
import { IconSearch } from '../../components/Icons.jsx'
import AdminEscritoriosGestao from './AdminEscritoriosGestao.jsx'
import AdminEscritorioDetalhe from './AdminEscritorioDetalhe.jsx'
import './AdminEscritorios.css'
import './AdminEscritoriosGestao.css'
import PageHeader, { PageContainer } from '../../components/PageHeader.jsx'

// colunas de gestão (migration_045) — lidas junto com a lista, sem consulta extra
const COLUNAS_GESTAO = 'plano, status_conta, created_at, suspensa_em, suspensao_motivo, exclusao_programada_em'

function camposGestao(e) {
  return {
    plano: e.plano,
    statusConta: e.status_conta,
    criadoEm: e.created_at,
    suspensaEm: e.suspensa_em,
    suspensaoMotivo: e.suspensao_motivo,
    exclusaoProgramadaEm: e.exclusao_programada_em,
  }
}

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
  return [new Date(y, 0, 1), eod(y, m, day)] // ano vigente: 01/01 até hoje
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
  // abas: "Resumo" (cards, padrão) e "Gestão" (tabela + detalhe)
  const [searchParams, setSearchParams] = useSearchParams()
  const aba = searchParams.get('aba') === 'gestao' ? 'gestao' : 'resumo'
  const [detalheId, setDetalheId] = useState(null)
  const [erroCarga, setErroCarga] = useState(false)

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)

    // A empresa "casa" do prolu_admin nunca deve aparecer nas métricas admin.
    const proluEmpresaId = user?.empresaId || null
    let empresasQuery = supabase.from('empresas').select(`id, nome, ${COLUNAS_GESTAO}`).order('nome')
    // usuários, colunas e linhas de TODOS os escritórios passam fácil do limite de
    // 1000 linhas por requisição do Supabase — sem paginar, o excedente era cortado
    // em silêncio e alguns escritórios apareciam com números menores.
    const semCasa = q => proluEmpresaId ? q.neq('empresa_id', proluEmpresaId) : q
    const usuariosQuery = () => semCasa(supabase.from('usuarios').select('id, nome, email, role, empresa_id').order('id'))
    const colunasQuery = () => semCasa(supabase.from('crm_colunas').select('id, empresa_id, opcoes').order('id'))
    const linhasQuery = () => semCasa(supabase.from('crm_linhas').select('id, empresa_id, valores, created_at').order('id'))
    if (proluEmpresaId) empresasQuery = empresasQuery.neq('id', proluEmpresaId)

    const [{ data: emp, error: empErr }, { data: usu }, { data: cols }, { data: linhas }] = await Promise.all([
      empresasQuery, fetchAllRows(usuariosQuery), fetchAllRows(colunasQuery), fetchAllRows(linhasQuery),
    ])
    if (empErr) { toast('Erro ao carregar escritórios'); setErroCarga(true); setLoading(false); return }

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
        ...camposGestao(e),
        masterNome: master?.nome || master?.email || '—',
        totalUsuarios: usuariosEmpresa.length,
        linhas: todasLinhas,
        ultimoAcesso,
      }
    }))
    setLoading(false)
  }

  const range = useMemo(() => getPeriodRange(period), [period])

  // Fechamentos por escritório: fonte única (fn_fechamentos_periodo), filtrada por data de fechamento.
  // Antes eram contados pela data de ENTRADA — projeto que entrou no ano anterior e fechou
  // neste ano ficava de fora.
  const [fechPorEmpresa, setFechPorEmpresa] = useState({})
  useEffect(() => {
    if (!supabaseReady) return
    let vivo = true
    resumoFechamentos({ inicio: isoLocal(range[0]), fim: isoLocal(range[1]) })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) toast('Erro ao carregar fechamentos')
        setFechPorEmpresa(data)
      })
    return () => { vivo = false }
  }, [range]) // eslint-disable-line react-hooks/exhaustive-deps

  const escritorios = useMemo(() => {
    return empresas.map(e => {
      const linhasPeriodo = e.linhas.filter(r => inPeriod(r.dataEntrada, range))
      const comProposta = linhasPeriodo.filter(r => r.proposta === 'Sim')
      // taxa de conversão mantém a definição anterior (fechados por data de entrada) — fora do escopo da fonte única
      const fechadosPorEntrada = linhasPeriodo.filter(r => r.status === 'Fechado')
      const f = fechPorEmpresa[e.id] || FECHAMENTOS_VAZIO
      return {
        ...e,
        pedidosPeriodo: linhasPeriodo.length,
        qtdFechamentos: f.qtd,
        valorFechamentos: f.valor,
        taxaConversao: comProposta.length > 0 ? Math.round((fechadosPorEntrada.length / comProposta.length) * 100) : null,
      }
    })
  }, [empresas, range, fechPorEmpresa])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = q ? escritorios.filter(e => e.nome.toLowerCase().includes(q)) : escritorios
    return [...lista].sort((a, b) => b.valorFechamentos - a.valorFechamentos)
  }, [escritorios, busca])

  // depois de uma ação de conta: relê só a linha do escritório alterado
  async function recarregarEmpresa(id) {
    const { data, error } = await supabase.from('empresas').select(`id, ${COLUNAS_GESTAO}`).eq('id', id).maybeSingle()
    if (error || !data) { toast('Alteração salva, mas não foi possível atualizar a lista'); return }
    setEmpresas(prev => prev.map(e => (e.id === id ? { ...e, ...camposGestao(data) } : e)))
  }

  const detalhe = detalheId ? escritorios.find(e => e.id === detalheId) : null

  function irAba(a) {
    setSearchParams(a === 'gestao' ? { aba: 'gestao' } : {})
  }

  function abrirEmpresa(e) {
    enterAsEmpresa(e.id, e.nome)
    navigate('/')
  }

  if (!isProluAdmin) return null

  return (
    <PageContainer>
      <PageHeader
        titulo="Escritórios"
        descricao="Todos os escritórios cadastrados na Prolu."
        acoes={aba === 'resumo' && <div className="adm-period-pills">
          {PERIOD_OPTS.map(([k, lbl]) => (
            <button
              key={k}
              className={`adm-period-pill${period === k ? ' active' : ''}`}
              onClick={() => setPeriod(k)}
            >
              {lbl}
            </button>
          ))}
        </div>}
      />

      <div className="gp-abas" role="tablist">
        {[['resumo', 'Resumo'], ['gestao', 'Gestão']].map(([k, lbl]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={`gp-aba${aba === k ? ' active' : ''}`} onClick={() => irAba(k)}>
            {lbl}
          </button>
        ))}
      </div>

      {aba === 'gestao' ? (
        loading ? <p className="esc-loading">Carregando…</p> : erroCarga ? <p className="esc-loading">Não foi possível carregar os escritórios. Recarregue a página.</p> : (
          <AdminEscritoriosGestao escritorios={escritorios} onAbrir={setDetalheId} onAlterado={recarregarEmpresa} />
        )
      ) : (<>
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
      </>)}

      {detalhe && (
        <AdminEscritorioDetalhe
          escritorio={detalhe}
          periodOpts={PERIOD_OPTS}
          period={period}
          onPeriod={setPeriod}
          onEntrar={abrirEmpresa}
          onAlterado={recarregarEmpresa}
          onClose={() => setDetalheId(null)}
        />
      )}
    </PageContainer>
  )
}
