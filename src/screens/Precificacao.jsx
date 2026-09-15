import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconSearch, IconClose, IconArrowRight } from '../components/Icons.jsx'
import './Precificacao.css'

const COMPLEXIDADE_LABEL = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' }
const COMPLEXIDADE_PILL = { baixa: 'pill-green', normal: 'pill-blue', alta: 'pill-orange' }

function fmtMoney(v) {
  const n = Number(v)
  if (!n) return 'R$ 0'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function Precificacao() {
  const { activeEmpresaId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [lista, setLista] = useState([])
  const [clientesMap, setClientesMap] = useState({})
  const [crmMap, setCrmMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const tab = searchParams.get('tab') === 'fechado' ? 'fechado' : 'orcamento'
  const [busca, setBusca] = useState('')

  function setTab(next) {
    setSearchParams(next === 'fechado' ? { tab: 'fechado' } : {})
  }

  useEffect(() => { carregar() }, [activeEmpresaId])

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)

    const [precifRes, clientesRes, colunasRes, linhasRes] = await Promise.all([
      supabase.from('precificacoes')
        .select('id, nome, status, cliente_id, crm_linha_id, complexidade, total_horas, valor_projeto, created_at')
        .eq('empresa_id', activeEmpresaId)
        .order('created_at', { ascending: false }),
      supabase.from('clientes').select('id, nome').eq('empresa_id', activeEmpresaId),
      supabase.from('crm_colunas').select('id, opcoes').eq('empresa_id', activeEmpresaId),
      supabase.from('crm_linhas').select('id, valores').eq('empresa_id', activeEmpresaId),
    ])

    if (precifRes.error) toast('Erro ao carregar precificações')

    const cMap = {}
    ;(clientesRes.data || []).forEach((c) => { cMap[c.id] = c.nome })
    setClientesMap(cMap)

    const clienteColId = (colunasRes.data || []).find((c) => {
      const opcoes = c.opcoes
      return opcoes && !Array.isArray(opcoes) && opcoes.slug === 'cliente'
    })?.id
    const lMap = {}
    if (clienteColId) {
      ;(linhasRes.data || []).forEach((l) => { lMap[l.id] = l.valores?.[clienteColId] || '(sem nome)' })
    }
    setCrmMap(lMap)

    setLista(precifRes.data || [])
    setLoading(false)
  }

  async function novaPrecificacao() {
    if (!supabaseReady || !activeEmpresaId) return
    setCriando(true)
    const { data, error } = await supabase
      .from('precificacoes')
      .insert({ empresa_id: activeEmpresaId, nome: 'Nova precificação', status: tab })
      .select('id')
      .single()
    setCriando(false)
    if (error || !data) { toast('Erro ao criar precificação'); return }
    navigate(`/precificacao/${data.id}`)
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista
      .filter((p) => p.status === tab)
      .filter((p) => {
        if (!q) return true
        const clienteNome = (p.cliente_id && clientesMap[p.cliente_id]) || ''
        return p.nome.toLowerCase().includes(q) || clienteNome.toLowerCase().includes(q)
      })
  }, [lista, tab, busca, clientesMap])

  const countOrcamentos = lista.filter((p) => p.status === 'orcamento').length
  const countFechados = lista.filter((p) => p.status === 'fechado').length

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Precificação</div>
          <div className="page-sub">Orçamentos e projetos fechados</div>
        </div>
        <div className="pz-header-actions">
          <button className="pz-modelos-link" onClick={() => navigate('/precificacao/modelos')}>
            Modelos de etapas <IconArrowRight />
          </button>
          <button className="btn-primary" onClick={novaPrecificacao} disabled={criando}>
            <IconPlus /> {criando ? 'Criando…' : 'Nova precificação'}
          </button>
        </div>
      </div>

      <div className="pz-tabs">
        <button className={`pz-tab${tab === 'orcamento' ? ' active' : ''}`} onClick={() => setTab('orcamento')}>
          Orçamentos <span className="pz-tab-count">{countOrcamentos}</span>
        </button>
        <button className={`pz-tab${tab === 'fechado' ? ' active' : ''}`} onClick={() => setTab('fechado')}>
          Projetos fechados <span className="pz-tab-count">{countFechados}</span>
        </button>
      </div>

      <div className="pz-toolbar">
        <div className="pz-search">
          <IconSearch className="pz-search-icon" />
          <input
            className="pz-search-input"
            placeholder="Buscar por nome ou cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button className="pz-search-clear" onClick={() => setBusca('')} aria-label="Limpar busca">
              <IconClose />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="pz-empty">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="pz-empty">
          {busca ? 'Nenhuma precificação encontrada.' : tab === 'orcamento' ? 'Nenhum orçamento ainda.' : 'Nenhum projeto fechado ainda.'}
        </p>
      ) : (
        <div className="pz-table-wrap">
          <table className="pz-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cliente</th>
                <th>Registro CRM</th>
                <th>Complexidade</th>
                <th>Horas</th>
                <th>Valor</th>
                <th>Criado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td className="pz-td-nome">{p.nome}</td>
                  <td className="pz-td-meta">{(p.cliente_id && clientesMap[p.cliente_id]) || '—'}</td>
                  <td className="pz-td-meta">{(p.crm_linha_id && crmMap[p.crm_linha_id]) || '—'}</td>
                  <td>
                    <span className={`pill ${COMPLEXIDADE_PILL[p.complexidade] || 'pill-gray'}`}>
                      <span className="dot" />{COMPLEXIDADE_LABEL[p.complexidade] || p.complexidade}
                    </span>
                  </td>
                  <td className="pz-td-meta">{p.total_horas ? `${p.total_horas}h` : '—'}</td>
                  <td className="pz-td-meta">{fmtMoney(p.valor_projeto)}</td>
                  <td className="pz-td-meta">{fmtDate(p.created_at)}</td>
                  <td className="pz-td-actions">
                    <button className="pz-abrir-btn" onClick={() => navigate(`/precificacao/${p.id}`)}>
                      Abrir <IconArrowRight />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
