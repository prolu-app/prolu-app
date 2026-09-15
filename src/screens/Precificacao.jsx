import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconSearch, IconClose, IconArrowRight, IconSettings, IconChevronDown, IconTrash } from '../components/Icons.jsx'
import { carregarCalculoPrecificacao } from '../hooks/usePrecificacaoCalculo.js'
import './Precificacao.css'

const COMPLEXIDADE_LABEL = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' }
const COMPLEXIDADE_PILL = { baixa: 'pill-green', normal: 'pill-blue', alta: 'pill-orange' }

function fmtMoney(v) {
  const n = Number(v) || 0
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

  const [lista, setLista] = useState([])
  const [clientesMap, setClientesMap] = useState({})
  const [crmMap, setCrmMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [busca, setBusca] = useState('')
  const [configAberto, setConfigAberto] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null) // id da precificação a excluir
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => { carregar() }, [activeEmpresaId])

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)

    const [precifRes, clientesRes, colunasRes, linhasRes] = await Promise.all([
      supabase.from('precificacoes')
        .select('id, nome, cliente_id, crm_linha_id, complexidade, valor_hora, margem_pct, nf_pct, nf_ativo, created_at')
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

    const precificacoes = precifRes.data || []
    setLista(precificacoes.map((p) => ({ ...p, totalHoras: undefined, valorFinal: undefined })))
    setLoading(false)

    // Total de horas/valor não são colunas — calculados por precificação,
    // à parte, pra não travar a primeira renderização da lista.
    precificacoes.forEach(async (p) => {
      const calc = await carregarCalculoPrecificacao(p.id, p)
      setLista((prev) => prev.map((row) => row.id === p.id
        ? { ...row, totalHoras: calc?.totalHoras ?? null, valorFinal: calc?.valorFinal ?? null }
        : row))
    })
  }

  async function novaPrecificacao() {
    if (!supabaseReady || !activeEmpresaId) return
    setCriando(true)
    const { data, error } = await supabase
      .from('precificacoes')
      .insert({ empresa_id: activeEmpresaId, nome: 'Nova precificação', status: 'orcamento' })
      .select('id')
      .single()
    setCriando(false)
    if (error || !data) { toast('Erro ao criar precificação'); return }
    navigate(`/precificacao/${data.id}`)
  }

  async function excluirPrecificacao() {
    const precifId = confirmExcluir
    setExcluindo(true)
    const { error } = await supabase.from('precificacoes').delete().eq('id', precifId)
    setExcluindo(false)
    if (error) { toast('Erro ao excluir precificação'); return }
    setLista((prev) => prev.filter((p) => p.id !== precifId))
    setConfirmExcluir(null)
    toast('Precificação excluída')
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((p) => {
      const clienteNome = (p.cliente_id && clientesMap[p.cliente_id]) || ''
      return p.nome.toLowerCase().includes(q) || clienteNome.toLowerCase().includes(q)
    })
  }, [lista, busca, clientesMap])

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Precificação</div>
          <div className="page-sub">Orçamentos do escritório</div>
        </div>
        <div className="pz-header-actions">
          <button className="btn-primary" onClick={novaPrecificacao} disabled={criando}>
            <IconPlus /> {criando ? 'Criando…' : 'Nova precificação'}
          </button>
          <div className="pz-config-wrap">
            <button className="pz-config-btn" onClick={() => setConfigAberto((v) => !v)}>
              <IconSettings /> Configurações <IconChevronDown className={configAberto ? 'pz-config-chevron-open' : ''} />
            </button>
            {configAberto && (
              <>
                <div className="pz-config-scrim" onClick={() => setConfigAberto(false)} />
                <div className="pz-config-menu">
                  <button onClick={() => { setConfigAberto(false); navigate('/precificacao/modelos') }}>
                    Modelos de etapas
                  </button>
                  <button onClick={() => { setConfigAberto(false); navigate('/precificacao/etiquetas') }}>
                    Gerenciar etiquetas
                  </button>
                  <button className="pz-config-disabled" title="Em breve">
                    Valor da hora
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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
          {busca ? 'Nenhuma precificação encontrada.' : 'Nenhuma precificação ainda.'}
        </p>
      ) : (
        <div className="pz-table-wrap">
          <table className="pz-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cliente</th>
                <th>Pedido de orçamento</th>
                <th>Complexidade</th>
                <th>Horas</th>
                <th>Valor</th>
                <th>Criado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="pz-row" onClick={() => navigate(`/precificacao/${p.id}`)}>
                  <td className="pz-td-nome">{p.nome}</td>
                  <td className="pz-td-meta">{(p.cliente_id && clientesMap[p.cliente_id]) || '—'}</td>
                  <td className="pz-td-meta">{(p.crm_linha_id && crmMap[p.crm_linha_id]) || '—'}</td>
                  <td>
                    <span className={`pill ${COMPLEXIDADE_PILL[p.complexidade] || 'pill-gray'}`}>
                      <span className="dot" />{COMPLEXIDADE_LABEL[p.complexidade] || p.complexidade}
                    </span>
                  </td>
                  <td className="pz-td-meta">{p.totalHoras == null ? '—' : `${p.totalHoras}h`}</td>
                  <td className="pz-td-meta">{p.totalHoras == null ? '—' : fmtMoney(p.valorFinal)}</td>
                  <td className="pz-td-meta">{fmtDate(p.created_at)}</td>
                  <td className="pz-td-actions">
                    <button
                      className="pz-del-btn"
                      onClick={(e) => { e.stopPropagation(); setConfirmExcluir(p.id) }}
                      aria-label="Excluir precificação"
                      title="Excluir precificação"
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmExcluir && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmExcluir(null) }}>
          <div className="modal">
            <div className="modal-title">Excluir precificação</div>
            <p className="modal-delete-warn">Excluir esta precificação? Essa ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmExcluir(null)}>Cancelar</button>
              <button className="btn-danger" onClick={excluirPrecificacao} disabled={excluindo}>
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
