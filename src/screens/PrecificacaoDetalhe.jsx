import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconArrowRight, IconClose, IconPlus, IconTrash } from '../components/Icons.jsx'
import EtapasEditor from '../components/EtapasEditor.jsx'
import { usePrecificacaoCalculo } from '../hooks/usePrecificacaoCalculo.js'
import './PrecificacaoDetalhe.css'

const COMPLEXIDADES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
]

function fmtMoney(v) {
  const n = Number(v) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDate(v) {
  if (!v) return '—'
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function fmtHora(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

async function carregarEtapasTree(precificacaoId) {
  const { data: etapasRows } = await supabase
    .from('precificacao_etapas').select('id, nome, ordem')
    .eq('precificacao_id', precificacaoId).order('ordem')
  const etapaIds = (etapasRows || []).map((e) => e.id)

  let tarefasRows = []
  if (etapaIds.length) {
    const { data } = await supabase
      .from('precificacao_tarefas').select('id, etapa_id, nome, horas:horas_estimadas_soltas, ordem')
      .in('etapa_id', etapaIds).order('ordem')
    tarefasRows = data || []
  }
  const tarefaIds = tarefasRows.map((t) => t.id)

  let subRows = []
  if (tarefaIds.length) {
    const { data } = await supabase
      .from('precificacao_subtarefas').select('id, tarefa_id, nome, horas:horas_estimadas, ordem')
      .in('tarefa_id', tarefaIds).order('ordem')
    subRows = data || []
  }

  return (etapasRows || []).map((e) => ({
    ...e,
    tarefas: tarefasRows.filter((t) => t.etapa_id === e.id).map((t) => ({
      ...t,
      subtarefas: subRows.filter((st) => st.tarefa_id === t.id),
    })),
  }))
}

async function carregarModeloTree(modeloId) {
  const { data: etapasRows } = await supabase
    .from('precificacao_modelo_etapas').select('id, nome, ordem')
    .eq('modelo_id', modeloId).order('ordem')
  const etapaIds = (etapasRows || []).map((e) => e.id)

  let tarefasRows = []
  if (etapaIds.length) {
    const { data } = await supabase
      .from('precificacao_modelo_tarefas').select('id, etapa_id, nome, horas:horas_estimadas_soltas, ordem')
      .in('etapa_id', etapaIds).order('ordem')
    tarefasRows = data || []
  }
  const tarefaIds = tarefasRows.map((t) => t.id)

  let subRows = []
  if (tarefaIds.length) {
    const { data } = await supabase
      .from('precificacao_modelo_subtarefas').select('id, tarefa_id, nome, horas:horas_estimadas, ordem')
      .in('tarefa_id', tarefaIds).order('ordem')
    subRows = data || []
  }

  return (etapasRows || []).map((e) => ({
    ...e,
    tarefas: tarefasRows.filter((t) => t.etapa_id === e.id).map((t) => ({
      ...t,
      subtarefas: subRows.filter((st) => st.tarefa_id === t.id),
    })),
  }))
}

// ── helpers de atualização otimista da árvore de etapas ──
function addTarefaToEtapa(list, etapaId, tarefa) {
  return list.map((e) => e.id === etapaId ? { ...e, tarefas: [...e.tarefas, tarefa] } : e)
}
function updateTarefaInTree(list, tarefaId, patch) {
  return list.map((e) => ({ ...e, tarefas: e.tarefas.map((t) => t.id === tarefaId ? { ...t, ...patch } : t) }))
}
function removeTarefaFromTree(list, tarefaId) {
  return list.map((e) => ({ ...e, tarefas: e.tarefas.filter((t) => t.id !== tarefaId) }))
}
function addSubtarefaToTarefa(list, tarefaId, sub) {
  return list.map((e) => ({
    ...e,
    tarefas: e.tarefas.map((t) => t.id === tarefaId ? { ...t, subtarefas: [...t.subtarefas, sub] } : t),
  }))
}
function updateSubtarefaInTree(list, subId, patch) {
  return list.map((e) => ({
    ...e,
    tarefas: e.tarefas.map((t) => ({ ...t, subtarefas: t.subtarefas.map((st) => st.id === subId ? { ...st, ...patch } : st) })),
  }))
}
function removeSubtarefaFromTree(list, subId) {
  return list.map((e) => ({
    ...e,
    tarefas: e.tarefas.map((t) => ({ ...t, subtarefas: t.subtarefas.filter((st) => st.id !== subId) })),
  }))
}

export default function PrecificacaoDetalhe() {
  const { id } = useParams()
  const { activeEmpresaId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const origem = searchParams.get('origem')
  const linhaIdOrigem = searchParams.get('linha_id')

  const [loading, setLoading] = useState(true)
  const [precificacao, setPrecificacao] = useState(null)
  const [form, setForm] = useState(null) // campos editáveis da aba Geral
  const [etapas, setEtapas] = useState([])
  const [custos, setCustos] = useState([])
  const [clientes, setClientes] = useState([])
  const [crmColIds, setCrmColIds] = useState({})
  const [crmLinhaLabel, setCrmLinhaLabel] = useState(null)
  const [crmBusca, setCrmBusca] = useState('')
  const [crmResultados, setCrmResultados] = useState([])
  const [crmBuscando, setCrmBuscando] = useState(false)
  const [crmDropdownAberto, setCrmDropdownAberto] = useState(false)
  const [etiquetasCadastro, setEtiquetasCadastro] = useState([])
  const [etiquetaBusca, setEtiquetaBusca] = useState('')
  const [etiquetaDropdownAberto, setEtiquetaDropdownAberto] = useState(false)
  const [criandoEtiqueta, setCriandoEtiqueta] = useState(false)
  const [tab, setTab] = useState('geral')
  const [editandoNome, setEditandoNome] = useState(false)
  const [clienteBusca, setClienteBusca] = useState('')
  const [clienteDropdownAberto, setClienteDropdownAberto] = useState(false)
  const [criandoCliente, setCriandoCliente] = useState(false)
  const [modalModelo, setModalModelo] = useState(false)
  const [nomeModelo, setNomeModelo] = useState('')
  const [salvandoModelo, setSalvandoModelo] = useState(false)
  const [modalImportar, setModalImportar] = useState(false)
  const [modelos, setModelos] = useState([])
  const [importando, setImportando] = useState(null)
  const [escolhaImportar, setEscolhaImportar] = useState(null) // id do modelo escolhido aguardando "substituir ou adicionar"
  const [concluindo, setConcluindo] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const savedTimeoutRef = useRef(null)

  useEffect(() => { carregar() }, [id])
  useEffect(() => () => { if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current) }, [])

  function markSaved() {
    setSavedAt(new Date())
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSavedAt(null), 3000)
  }

  async function carregar() {
    if (!supabaseReady || !id) { setLoading(false); return }
    setLoading(true)
    const [precifRes, clientesRes, colunasRes, etapasTree, custosRes, etiquetasRes, etiquetasLinkRes] = await Promise.all([
      supabase.from('precificacoes').select('*').eq('id', id).single(),
      supabase.from('clientes').select('id, nome').eq('empresa_id', activeEmpresaId).order('nome'),
      supabase.from('crm_colunas').select('id, opcoes').eq('empresa_id', activeEmpresaId),
      carregarEtapasTree(id),
      supabase.from('precificacao_custos_extras').select('id, nome, valor:valor_estimado, ordem').eq('precificacao_id', id).order('ordem'),
      supabase.from('precificacao_etiquetas_cadastro').select('id, nome').eq('empresa_id', activeEmpresaId).order('nome'),
      supabase.from('precificacao_etiquetas').select('id, nome').eq('precificacao_id', id),
    ])

    if (precifRes.error || !precifRes.data) { toast('Precificação não encontrada'); navigate('/precificacao'); return }
    if (etiquetasLinkRes.error) console.error('[etiquetas] erro ao carregar precificacao_etiquetas:', etiquetasLinkRes.error)

    const p = precifRes.data
    setPrecificacao(p)
    setForm({
      nome: p.nome, clienteId: p.cliente_id, crmLinhaId: p.crm_linha_id,
      valorHora: p.valor_hora, margemLucro: p.margem_pct,
      nfAtivo: p.nf_ativo, nfPercentual: p.nf_pct,
      metragem: p.metragem ?? '', complexidade: p.complexidade,
      etiquetas: etiquetasLinkRes.data || [], // [{ id, nome }]
    })
    setClientes(clientesRes.data || [])
    setEtiquetasCadastro(etiquetasRes.data || [])

    function colId(slug) {
      return (colunasRes.data || []).find((c) => {
        const opcoes = c.opcoes
        return opcoes && !Array.isArray(opcoes) && opcoes.slug === slug
      })?.id
    }
    const ids = { clienteColId: colId('cliente'), dataEntradaColId: colId('data_entrada'), statusColId: colId('status') }
    setCrmColIds(ids)

    if (p.crm_linha_id) {
      const { data: linha } = await supabase.from('crm_linhas').select('valores').eq('id', p.crm_linha_id).single()
      setCrmLinhaLabel((linha && ids.clienteColId && linha.valores?.[ids.clienteColId]) || '(sem nome)')
    } else {
      setCrmLinhaLabel(null)
    }

    setEtapas(etapasTree)
    setCustos(custosRes.data || [])
    setLoading(false)
  }

  // Adapta a árvore local (campo `horas`) pro formato que o hook espera.
  const etapasParaCalculo = useMemo(() => etapas.map((e) => ({
    tarefas: (e.tarefas || []).map((t) => ({
      horas_estimadas_soltas: t.horas || 0,
      subtarefas: (t.subtarefas || []).map((st) => ({ horas_estimadas: st.horas || 0 })),
    })),
  })), [etapas])
  const custosParaCalculo = useMemo(() => custos.map((c) => ({ valor_estimado: c.valor || 0 })), [custos])

  const calc = usePrecificacaoCalculo({
    etapas: etapasParaCalculo,
    custos_extras: custosParaCalculo,
    valor_hora: Number(form?.valorHora) || 0,
    margem_pct: Number(form?.margemLucro) || 0,
    nf_pct: Number(form?.nfPercentual) || 0,
    nf_ativo: form?.nfAtivo || false,
  })

  const totalCustosExtras = useMemo(() => custos.reduce((s, c) => s + (Number(c.valor) || 0), 0), [custos])

  // NOTA: cache de total_horas/valor_sem_margem/valor_projeto removido —
  // essas colunas não existem em `precificacoes` (ver colunas válidas no
  // PATCH). A lista em Precificacao.jsx e a seção de precificações do
  // CRMDrawer não têm mais de onde ler esses valores; combinar com o time
  // se isso deve virar colunas reais ou um cálculo sob demanda.

  // Busca de "Pedido de orçamento" (crm_linhas), com debounce, min. 2 caracteres.
  useEffect(() => {
    const q = crmBusca.trim()
    if (q.length < 2 || !crmColIds.clienteColId || !activeEmpresaId) { setCrmResultados([]); setCrmBuscando(false); return }
    setCrmBuscando(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('crm_linhas')
        .select('id, valores')
        .eq('empresa_id', activeEmpresaId)
        .filter(`valores->>${crmColIds.clienteColId}`, 'ilike', `%${q}%`)
        .limit(15)
      setCrmResultados((data || []).map((l) => ({
        id: l.id,
        cliente: l.valores?.[crmColIds.clienteColId] || '(sem nome)',
        dataEntrada: crmColIds.dataEntradaColId ? l.valores?.[crmColIds.dataEntradaColId] : null,
        status: crmColIds.statusColId ? l.valores?.[crmColIds.statusColId] : null,
      })))
      setCrmBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [crmBusca, crmColIds, activeEmpresaId])

  function updateForm(patch) { setForm((f) => ({ ...f, ...patch })) }

  async function persistField(patch) {
    setPrecificacao((p) => ({ ...p, ...patch }))
    const { error } = await supabase.from('precificacoes').update(patch).eq('id', id)
    if (error) toast('Erro ao salvar')
    else markSaved()
  }

  function commitNome(valor) {
    const nome = valor.trim() || 'Sem nome'
    updateForm({ nome })
    persistField({ nome })
    setEditandoNome(false)
  }

  async function concluir() {
    setConcluindo(true)
    await persistField({
      nome: form.nome.trim() || 'Sem nome',
      cliente_id: form.clienteId,
      crm_linha_id: form.crmLinhaId,
      valor_hora: Number(form.valorHora) || 0,
      margem_pct: Number(form.margemLucro) || 0,
      nf_ativo: form.nfAtivo,
      nf_pct: Number(form.nfPercentual) || 0,
      metragem: form.metragem === '' ? null : Number(form.metragem),
      complexidade: form.complexidade,
    })
    setConcluindo(false)
    if (origem === 'crm' && linhaIdOrigem) navigate(`/crm?open=${linhaIdOrigem}`)
    else navigate('/precificacao')
  }

  function selecionarCliente(c) {
    updateForm({ clienteId: c.id })
    persistField({ cliente_id: c.id })
    setClienteBusca('')
    setClienteDropdownAberto(false)
  }

  async function criarECliente(nome) {
    if (!nome.trim() || !activeEmpresaId) return
    setCriandoCliente(true)
    const { data, error } = await supabase.from('clientes')
      .insert({ empresa_id: activeEmpresaId, nome: nome.trim() }).select('id, nome').single()
    setCriandoCliente(false)
    if (error || !data) { toast('Erro ao criar cliente'); return }
    setClientes((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    selecionarCliente(data)
  }

  function limparCliente() {
    updateForm({ clienteId: null })
    persistField({ cliente_id: null })
  }

  function selecionarCrmLinha(l) {
    updateForm({ crmLinhaId: l.id })
    persistField({ crm_linha_id: l.id })
    setCrmLinhaLabel(l.cliente)
    setCrmBusca('')
    setCrmResultados([])
    setCrmDropdownAberto(false)
  }

  function desvincularCrm() {
    updateForm({ crmLinhaId: null })
    persistField({ crm_linha_id: null })
    setCrmLinhaLabel(null)
  }

  // ── Etiquetas ──
  const sugestoesEtiqueta = etiquetaBusca.trim()
    ? etiquetasCadastro.filter((et) =>
        et.nome.toLowerCase().includes(etiquetaBusca.trim().toLowerCase()) && !form.etiquetas.some((e) => e.nome === et.nome))
    : []
  const etiquetaJaExiste = etiquetasCadastro.some((et) => et.nome.toLowerCase() === etiquetaBusca.trim().toLowerCase())

  // Etiquetas aplicadas à precificação ficam em `precificacao_etiquetas`
  // (precificacao_id, nome) — uma linha por etiqueta vinculada. O catálogo
  // (`precificacao_etiquetas_cadastro`) é só a fonte do autocomplete.
  // form.etiquetas guarda [{ id, nome }] — precisa do id de volta do
  // insert pra poder deletar por id depois, não por texto.
  async function adicionarEtiquetaExistente(nome) {
    console.log('[etiquetas] adicionarEtiquetaExistente chamado, nome:', nome)
    setEtiquetaBusca('')
    setEtiquetaDropdownAberto(false)
    if (form.etiquetas.some((e) => e.nome === nome)) {
      console.log('[etiquetas] já está na lista local, não vai inserir:', nome)
      return
    }

    console.log('Tentando inserir etiqueta...')
    console.log('precificacao_id:', id)
    console.log('nome:', nome)

    const { data, error } = await supabase
      .from('precificacao_etiquetas')
      .insert({ precificacao_id: id, nome })
      .select()

    console.log('Resultado insert:', { data, error })

    if (error) {
      console.error('Erro completo:', error.code, error.message, error.details, error.hint)
      toast('Erro ao salvar etiqueta')
      return
    }
    if (!data || !data[0]) {
      console.error('[etiquetas] insert não retornou erro nem dado', { precificacao_id: id, nome })
      toast('Erro ao salvar etiqueta')
      return
    }
    // Usa o form da própria atualização (não o `form` capturado no closure
    // antes do await) — se outra edição tiver mudado o estado nesse meio
    // tempo, essa era a causa da etiqueta "sumir": o patch sobrescrevia
    // etiquetas com um array antigo, perdendo o que tinha sido adicionado.
    const nova = data[0]
    setForm((f) => f.etiquetas.some((e) => e.id === nova.id) ? f : { ...f, etiquetas: [...f.etiquetas, nova] })
    markSaved()
  }

  async function criarEtiqueta(nome) {
    const limpo = nome.trim()
    if (!limpo || !activeEmpresaId) return
    setCriandoEtiqueta(true)
    const { data, error } = await supabase.from('precificacao_etiquetas_cadastro')
      .insert({ empresa_id: activeEmpresaId, nome: limpo }).select('id, nome').single()
    setCriandoEtiqueta(false)
    if (error || !data) {
      console.error('[etiquetas] erro ao inserir em precificacao_etiquetas_cadastro:', error, { empresa_id: activeEmpresaId, nome: limpo })
      toast('Erro ao criar etiqueta')
      return
    }
    setEtiquetasCadastro((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    adicionarEtiquetaExistente(data.nome)
  }

  async function removeEtiqueta(etiquetaId) {
    let removida = null
    setForm((f) => {
      removida = f.etiquetas.find((e) => e.id === etiquetaId) || null
      return { ...f, etiquetas: f.etiquetas.filter((e) => e.id !== etiquetaId) }
    })
    const { error } = await supabase.from('precificacao_etiquetas').delete().eq('id', etiquetaId)
    if (error) {
      console.error('[etiquetas] erro ao remover de precificacao_etiquetas:', error, { id: etiquetaId })
      toast('Erro ao remover etiqueta')
      if (removida) {
        setForm((f) => f.etiquetas.some((e) => e.id === etiquetaId) ? f : { ...f, etiquetas: [...f.etiquetas, removida] })
      }
      return
    }
    markSaved()
  }

  // ── Etapas ──
  async function refetchEtapas() { setEtapas(await carregarEtapasTree(id)) }

  async function handleAddEtapa() {
    const { data, error } = await supabase.from('precificacao_etapas')
      .insert({ precificacao_id: id, nome: '', ordem: etapas.length })
      .select('id, nome, ordem').single()
    if (error || !data) { toast('Erro ao criar etapa'); return }
    setEtapas((prev) => [...prev, { ...data, tarefas: [] }])
    markSaved()
    return data.id
  }
  async function handleRenameEtapa(etapaId, nome) {
    setEtapas((prev) => prev.map((e) => e.id === etapaId ? { ...e, nome } : e))
    const { error } = await supabase.from('precificacao_etapas').update({ nome }).eq('id', etapaId)
    if (error) toast('Erro ao renomear etapa'); else markSaved()
  }
  async function handleDeleteEtapa(etapaId) {
    setEtapas((prev) => prev.filter((e) => e.id !== etapaId))
    const { error } = await supabase.from('precificacao_etapas').delete().eq('id', etapaId)
    if (error) toast('Erro ao excluir etapa'); else markSaved()
  }
  async function handleReorderEtapas(draggedId, targetId, position) {
    const fromIdx = etapas.findIndex((e) => e.id === draggedId)
    if (fromIdx === -1) return
    const list = [...etapas]
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex((e) => e.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((e, i) => ({ ...e, ordem: i }))
    setEtapas(reordered)
    await Promise.all(reordered.map((e) => supabase.from('precificacao_etapas').update({ ordem: e.ordem }).eq('id', e.id)))
    markSaved()
  }

  async function handleAddTarefa(etapaId) {
    const etapa = etapas.find((e) => e.id === etapaId)
    const { data, error } = await supabase.from('precificacao_tarefas')
      .insert({ etapa_id: etapaId, nome: '', horas_estimadas_soltas: 0, ordem: (etapa?.tarefas || []).length })
      .select('id, etapa_id, nome, horas:horas_estimadas_soltas, ordem').single()
    if (error || !data) { toast('Erro ao criar tarefa'); return }
    setEtapas((prev) => addTarefaToEtapa(prev, etapaId, { ...data, subtarefas: [] }))
    markSaved()
    return data.id
  }
  async function handleRenameTarefa(tarefaId, nome) {
    setEtapas((prev) => updateTarefaInTree(prev, tarefaId, { nome }))
    const { error } = await supabase.from('precificacao_tarefas').update({ nome }).eq('id', tarefaId)
    if (error) toast('Erro ao renomear tarefa'); else markSaved()
  }
  async function handleSetTarefaHoras(tarefaId, horas) {
    setEtapas((prev) => updateTarefaInTree(prev, tarefaId, { horas }))
    const { error } = await supabase.from('precificacao_tarefas').update({ horas_estimadas_soltas: horas }).eq('id', tarefaId)
    if (error) toast('Erro ao salvar horas'); else markSaved()
  }
  async function handleDeleteTarefa(tarefaId) {
    setEtapas((prev) => removeTarefaFromTree(prev, tarefaId))
    const { error } = await supabase.from('precificacao_tarefas').delete().eq('id', tarefaId)
    if (error) toast('Erro ao excluir tarefa'); else markSaved()
  }
  async function handleReorderTarefas(etapaId, draggedId, targetId, position) {
    const etapa = etapas.find((e) => e.id === etapaId)
    if (!etapa) return
    const list = [...etapa.tarefas]
    const fromIdx = list.findIndex((t) => t.id === draggedId)
    if (fromIdx === -1) return
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex((t) => t.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((t, i) => ({ ...t, ordem: i }))
    setEtapas((prev) => prev.map((e) => e.id === etapaId ? { ...e, tarefas: reordered } : e))
    await Promise.all(reordered.map((t) => supabase.from('precificacao_tarefas').update({ ordem: t.ordem }).eq('id', t.id)))
    markSaved()
  }

  async function handleAddSubtarefa(tarefaId) {
    let subCount = 0
    etapas.forEach((e) => e.tarefas.forEach((t) => { if (t.id === tarefaId) subCount = t.subtarefas.length }))
    const { data, error } = await supabase.from('precificacao_subtarefas')
      .insert({ tarefa_id: tarefaId, nome: '', horas_estimadas: 0, ordem: subCount })
      .select('id, tarefa_id, nome, horas:horas_estimadas, ordem').single()
    if (error || !data) { toast('Erro ao criar subtarefa'); return }
    setEtapas((prev) => addSubtarefaToTarefa(prev, tarefaId, data))
    markSaved()
    return data.id
  }
  async function handleReorderSubtarefas(tarefaId, draggedId, targetId, position) {
    let tarefaAtual = null
    etapas.forEach((e) => e.tarefas.forEach((t) => { if (t.id === tarefaId) tarefaAtual = t }))
    if (!tarefaAtual) return
    const list = [...tarefaAtual.subtarefas]
    const fromIdx = list.findIndex((st) => st.id === draggedId)
    if (fromIdx === -1) return
    const [moved] = list.splice(fromIdx, 1)
    let insertIdx = list.findIndex((st) => st.id === targetId)
    if (position === 'after') insertIdx += 1
    list.splice(insertIdx, 0, moved)
    const reordered = list.map((st, i) => ({ ...st, ordem: i }))
    setEtapas((prev) => prev.map((e) => ({
      ...e,
      tarefas: e.tarefas.map((t) => t.id === tarefaId ? { ...t, subtarefas: reordered } : t),
    })))
    await Promise.all(reordered.map((st) => supabase.from('precificacao_subtarefas').update({ ordem: st.ordem }).eq('id', st.id)))
    markSaved()
  }
  async function handleRenameSubtarefa(subId, nome) {
    setEtapas((prev) => updateSubtarefaInTree(prev, subId, { nome }))
    const { error } = await supabase.from('precificacao_subtarefas').update({ nome }).eq('id', subId)
    if (error) toast('Erro ao renomear subtarefa'); else markSaved()
  }
  async function handleSetSubtarefaHoras(subId, horas) {
    setEtapas((prev) => updateSubtarefaInTree(prev, subId, { horas }))
    const { error } = await supabase.from('precificacao_subtarefas').update({ horas_estimadas: horas }).eq('id', subId)
    if (error) toast('Erro ao salvar horas'); else markSaved()
  }
  async function handleDeleteSubtarefa(subId) {
    setEtapas((prev) => removeSubtarefaFromTree(prev, subId))
    const { error } = await supabase.from('precificacao_subtarefas').delete().eq('id', subId)
    if (error) toast('Erro ao excluir subtarefa'); else markSaved()
  }

  // ── Modelos ──
  async function abrirImportarModelo() {
    const { data, error } = await supabase.from('modelos_precificacao').select('id, nome, empresa_id, is_prolu').order('nome')
    if (error) { toast('Erro ao carregar modelos'); return }
    setModelos(data || [])
    setEscolhaImportar(null)
    setModalImportar(true)
  }

  function escolherModelo(modeloId) {
    // Só pergunta substituir/adicionar se já existe algo pra conflitar.
    if (etapas.length === 0) { importarModelo(modeloId, 'adicionar'); return }
    setEscolhaImportar(modeloId)
  }

  async function importarModelo(modeloId, modo) {
    setImportando(modeloId)
    if (modo === 'substituir') {
      await supabase.from('precificacao_etapas').delete().eq('precificacao_id', id)
    }
    const tree = await carregarModeloTree(modeloId)
    const offset = modo === 'substituir' ? 0 : etapas.length
    for (let i = 0; i < tree.length; i++) {
      const e = tree[i]
      const { data: novaEtapa } = await supabase.from('precificacao_etapas')
        .insert({ precificacao_id: id, nome: e.nome, ordem: offset + i }).select('id').single()
      if (!novaEtapa) continue
      for (let j = 0; j < e.tarefas.length; j++) {
        const t = e.tarefas[j]
        const { data: novaTarefa } = await supabase.from('precificacao_tarefas')
          .insert({ etapa_id: novaEtapa.id, nome: t.nome, horas_estimadas_soltas: t.horas, ordem: j }).select('id').single()
        if (!novaTarefa) continue
        if (t.subtarefas.length) {
          await supabase.from('precificacao_subtarefas').insert(
            t.subtarefas.map((st, k) => ({ tarefa_id: novaTarefa.id, nome: st.nome, horas_estimadas: st.horas, ordem: k }))
          )
        }
      }
    }
    setImportando(null)
    setEscolhaImportar(null)
    setModalImportar(false)
    toast('Modelo importado')
    refetchEtapas()
    markSaved()
  }

  function abrirSalvarModelo() {
    setNomeModelo(form.nome)
    setModalModelo(true)
  }

  async function salvarComoModelo() {
    if (!nomeModelo.trim() || !activeEmpresaId) return
    setSalvandoModelo(true)
    const { data: modelo, error } = await supabase.from('modelos_precificacao')
      .insert({ empresa_id: activeEmpresaId, nome: nomeModelo.trim(), is_prolu: false }).select('id').single()
    if (error || !modelo) { toast('Erro ao salvar modelo'); setSalvandoModelo(false); return }
    for (let i = 0; i < etapas.length; i++) {
      const e = etapas[i]
      const { data: novaEtapa } = await supabase.from('precificacao_modelo_etapas')
        .insert({ modelo_id: modelo.id, nome: e.nome, ordem: i }).select('id').single()
      if (!novaEtapa) continue
      for (let j = 0; j < e.tarefas.length; j++) {
        const t = e.tarefas[j]
        const { data: novaTarefa } = await supabase.from('precificacao_modelo_tarefas')
          .insert({ etapa_id: novaEtapa.id, nome: t.nome, horas_estimadas_soltas: t.horas, ordem: j }).select('id').single()
        if (!novaTarefa) continue
        if (t.subtarefas.length) {
          await supabase.from('precificacao_modelo_subtarefas').insert(
            t.subtarefas.map((st, k) => ({ tarefa_id: novaTarefa.id, nome: st.nome, horas_estimadas: st.horas, ordem: k }))
          )
        }
      }
    }
    setSalvandoModelo(false)
    setModalModelo(false)
    setNomeModelo('')
    toast('Modelo salvo')
  }

  // ── Custos extras ──
  async function addCusto() {
    const { data, error } = await supabase.from('precificacao_custos_extras')
      .insert({ precificacao_id: id, nome: 'Novo custo', valor_estimado: 0, ordem: custos.length })
      .select('id, nome, valor:valor_estimado, ordem').single()
    if (error || !data) { toast('Erro ao criar custo'); return }
    setCustos((prev) => [...prev, data])
    markSaved()
  }
  async function renameCusto(custoId, nome) {
    setCustos((prev) => prev.map((c) => c.id === custoId ? { ...c, nome } : c))
    const { error } = await supabase.from('precificacao_custos_extras').update({ nome }).eq('id', custoId)
    if (error) toast('Erro ao salvar'); else markSaved()
  }
  async function setValorCusto(custoId, valor) {
    setCustos((prev) => prev.map((c) => c.id === custoId ? { ...c, valor } : c))
    const { error } = await supabase.from('precificacao_custos_extras').update({ valor_estimado: valor }).eq('id', custoId)
    if (error) toast('Erro ao salvar'); else markSaved()
  }
  async function deleteCusto(custoId) {
    setCustos((prev) => prev.filter((c) => c.id !== custoId))
    const { error } = await supabase.from('precificacao_custos_extras').delete().eq('id', custoId)
    if (error) toast('Erro ao excluir'); else markSaved()
  }

  if (loading || !form) return <p className="pd-loading">Carregando…</p>

  const clienteSelecionado = clientes.find((c) => c.id === form.clienteId)
  const sugestoesCliente = clienteBusca.trim()
    ? clientes.filter((c) => c.nome.toLowerCase().includes(clienteBusca.trim().toLowerCase()))
    : []

  return (
    <>
      <div className="pd-breadcrumb">
        <button onClick={() => navigate('/precificacao')}>Precificação</button>
        <IconArrowRight />
        <span>{form.nome}</span>
      </div>

      <div className="pd-header">
        {editandoNome ? (
          <input
            className="pd-nome-input"
            autoFocus
            defaultValue={form.nome}
            onBlur={(e) => commitNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditandoNome(false) }}
          />
        ) : (
          <h1 className="pd-nome" onClick={() => setEditandoNome(true)} title="Clique para editar">{form.nome}</h1>
        )}
        <div className="pd-header-actions">
          <button className="btn-cancel" onClick={abrirSalvarModelo}>Salvar como modelo</button>
          <button className="btn-primary" onClick={concluir} disabled={concluindo}>
            {concluindo ? 'Salvando…' : 'Concluir'}
          </button>
        </div>
      </div>

      <div className="pd-tabs">
        <button className={`pd-tab${tab === 'geral' ? ' active' : ''}`} onClick={() => setTab('geral')}>Geral</button>
        <button className={`pd-tab${tab === 'etapas' ? ' active' : ''}`} onClick={() => setTab('etapas')}>Etapas</button>
        <button className={`pd-tab${tab === 'custos' ? ' active' : ''}`} onClick={() => setTab('custos')}>Custos extras</button>
      </div>

      {tab === 'geral' && (
        <div className="pd-geral">
          <div className="pd-geral-fields card">
            <div className="modal-field">
              <label className="modal-label">Nome da precificação</label>
              <input
                className="modal-input"
                value={form.nome}
                onChange={(e) => updateForm({ nome: e.target.value })}
                onBlur={(e) => persistField({ nome: e.target.value.trim() || 'Sem nome' })}
              />
            </div>

            <div className="modal-field pd-cliente-field">
              <label className="modal-label">Cliente</label>
              {clienteSelecionado ? (
                <div className="pd-cliente-chip">
                  <span>{clienteSelecionado.nome}</span>
                  <button onClick={limparCliente} aria-label="Remover cliente"><IconClose /></button>
                </div>
              ) : (
                <div className="pd-cliente-wrap">
                  <input
                    className="modal-input"
                    placeholder="Buscar ou criar cliente…"
                    value={clienteBusca}
                    onChange={(e) => { setClienteBusca(e.target.value); setClienteDropdownAberto(e.target.value.length > 0) }}
                    onBlur={() => setTimeout(() => setClienteDropdownAberto(false), 150)}
                    onFocus={() => setClienteDropdownAberto(clienteBusca.length > 0)}
                  />
                  {clienteDropdownAberto && (
                    <div className="pd-cliente-dropdown">
                      {sugestoesCliente.length > 0
                        ? sugestoesCliente.map((c) => (
                            <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); selecionarCliente(c) }}>
                              {c.nome}
                            </button>
                          ))
                        : (
                            <button type="button" className="pd-cliente-criar" disabled={criandoCliente}
                              onMouseDown={(e) => { e.preventDefault(); criarECliente(clienteBusca) }}>
                              {criandoCliente ? 'Criando…' : `Criar cliente: "${clienteBusca.trim()}"`}
                            </button>
                          )
                      }
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-field pd-cliente-field">
              <label className="modal-label">Pedido de orçamento</label>
              {form.crmLinhaId ? (
                <div className="pd-cliente-chip">
                  <span>{crmLinhaLabel || '(sem nome)'}</span>
                  <button onClick={desvincularCrm} aria-label="Desvincular"><IconClose /></button>
                </div>
              ) : (
                <div className="pd-cliente-wrap">
                  <input
                    className="modal-input"
                    placeholder="Buscar pelo nome do cliente no CRM…"
                    value={crmBusca}
                    onChange={(e) => { setCrmBusca(e.target.value); setCrmDropdownAberto(true) }}
                    onBlur={() => setTimeout(() => setCrmDropdownAberto(false), 150)}
                    onFocus={() => setCrmDropdownAberto(crmBusca.trim().length >= 2)}
                  />
                  {crmDropdownAberto && crmBusca.trim().length >= 2 && (
                    <div className="pd-cliente-dropdown">
                      {crmBuscando && <div className="pd-dropdown-msg">Buscando…</div>}
                      {!crmBuscando && crmResultados.length === 0 && (
                        <div className="pd-dropdown-msg">Nenhum resultado.</div>
                      )}
                      {!crmBuscando && crmResultados.map((l) => (
                        <button key={l.id} type="button" onMouseDown={(e) => { e.preventDefault(); selecionarCrmLinha(l) }}>
                          {l.cliente} · {fmtDate(l.dataEntrada)} · {l.status || '—'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pd-field-row">
              <div className="modal-field">
                <label className="modal-label">Valor da hora (R$)</label>
                <input
                  type="number" min="0" step="1" className="modal-input"
                  value={form.valorHora}
                  onChange={(e) => updateForm({ valorHora: e.target.value })}
                  onFocus={(e) => { if (parseFloat(e.target.value) === 0) e.target.value = '' }}
                  onBlur={(e) => {
                    if (e.target.value === '') e.target.value = '0'
                    persistField({ valor_hora: Number(e.target.value) || 0 })
                  }}
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">Margem de lucro (%)</label>
                <input
                  type="number" min="0" max="99" step="1" className="modal-input"
                  value={form.margemLucro}
                  onChange={(e) => updateForm({ margemLucro: e.target.value })}
                  onFocus={(e) => { if (parseFloat(e.target.value) === 0) e.target.value = '' }}
                  onBlur={(e) => {
                    if (e.target.value === '') e.target.value = '0'
                    persistField({ margem_pct: Number(e.target.value) || 0 })
                  }}
                />
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">Nota Fiscal / Impostos</label>
              <div className="pd-nf-row">
                <div className="pd-opt-pills">
                  <button
                    type="button"
                    className={`pd-opt-pill${form.nfAtivo ? ' selected' : ''}`}
                    onClick={() => { updateForm({ nfAtivo: true }); persistField({ nf_ativo: true }) }}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    className={`pd-opt-pill${!form.nfAtivo ? ' selected' : ''}`}
                    onClick={() => { updateForm({ nfAtivo: false }); persistField({ nf_ativo: false }) }}
                  >
                    Não
                  </button>
                </div>
                {form.nfAtivo && (
                  <div className="pd-nf-percentual-wrap">
                    <input
                      type="number" min="0" max="99" step="0.5" className="modal-input pd-nf-percentual"
                      value={form.nfPercentual}
                      onChange={(e) => updateForm({ nfPercentual: e.target.value })}
                      onFocus={(e) => { if (parseFloat(e.target.value) === 0) e.target.value = '' }}
                      onBlur={(e) => {
                        if (e.target.value === '') e.target.value = '0'
                        persistField({ nf_pct: Number(e.target.value) || 0 })
                      }}
                    />
                    <span className="pd-percent-suffix">%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pd-field-row">
              <div className="modal-field">
                <label className="modal-label">Metragem (m²)</label>
                <input
                  type="number" min="0" step="1" className="modal-input"
                  value={form.metragem}
                  onChange={(e) => updateForm({ metragem: e.target.value })}
                  onFocus={(e) => { if (parseFloat(e.target.value) === 0) e.target.value = '' }}
                  onBlur={(e) => {
                    if (e.target.value === '') e.target.value = '0'
                    persistField({ metragem: Number(e.target.value) || 0 })
                  }}
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">Complexidade</label>
                <div className="pd-opt-pills">
                  {COMPLEXIDADES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`pd-opt-pill${form.complexidade === c.value ? ' selected' : ''}`}
                      onClick={() => { updateForm({ complexidade: c.value }); persistField({ complexidade: c.value }) }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-field pd-etiquetas-field">
              <label className="modal-label">Etiquetas</label>
              <div className="pd-tags-input">
                {form.etiquetas.map((et) => (
                  <span className="pd-itag" key={et.id}>{et.nome}<button onClick={() => removeEtiqueta(et.id)}>×</button></span>
                ))}
                <input
                  className="pd-tag-inline-input"
                  placeholder="+ etiqueta"
                  value={etiquetaBusca}
                  onChange={(e) => { setEtiquetaBusca(e.target.value); setEtiquetaDropdownAberto(e.target.value.trim().length > 0) }}
                  onBlur={() => setTimeout(() => setEtiquetaDropdownAberto(false), 150)}
                  onFocus={() => setEtiquetaDropdownAberto(etiquetaBusca.trim().length > 0)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const exata = etiquetasCadastro.find((et) => et.nome.toLowerCase() === etiquetaBusca.trim().toLowerCase())
                    if (exata) adicionarEtiquetaExistente(exata.nome)
                    else if (etiquetaBusca.trim()) criarEtiqueta(etiquetaBusca)
                  }}
                />
              </div>
              {etiquetaDropdownAberto && etiquetaBusca.trim() && (
                <div className="pd-etiqueta-dropdown">
                  {sugestoesEtiqueta.map((et) => (
                    <button key={et.id} type="button" onMouseDown={(e) => { e.preventDefault(); adicionarEtiquetaExistente(et.nome) }}>
                      {et.nome}
                    </button>
                  ))}
                  {!etiquetaJaExiste && (
                    <button type="button" className="pd-cliente-criar" disabled={criandoEtiqueta}
                      onMouseDown={(e) => { e.preventDefault(); criarEtiqueta(etiquetaBusca) }}>
                      {criandoEtiqueta ? 'Criando…' : `Criar: "${etiquetaBusca.trim()}"`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pd-resultado card">
            <div className="section-title" style={{ marginTop: 0 }}>Resultado</div>
            <div className="pd-res-row"><span>Total de horas estimadas</span><strong>{calc.totalHoras}h</strong></div>
            <div className="pd-res-row"><span>Valor sem margem</span><strong>{fmtMoney(calc.valorSemMargem)}</strong></div>
            <div className="pd-res-row"><span>Valor da margem ({form.margemLucro}%)</span><strong>{fmtMoney(calc.valorMargem)}</strong></div>
            <div className="pd-res-row"><span>Valor com margem</span><strong>{fmtMoney(calc.valorComMargem)}</strong></div>
            {form.nfAtivo && (
              <div className="pd-res-row"><span>Nota fiscal ({form.nfPercentual}%)</span><strong>{fmtMoney(calc.valorNF)}</strong></div>
            )}
            <div className="pd-res-divider" />
            <div className="pd-res-row pd-res-total"><span>VALOR DO PROJETO</span><strong>{fmtMoney(calc.valorFinal)}</strong></div>
          </div>
        </div>
      )}

      {tab === 'etapas' && (
        <EtapasEditor
          etapas={etapas}
          onAddEtapa={handleAddEtapa}
          onRenameEtapa={handleRenameEtapa}
          onDeleteEtapa={handleDeleteEtapa}
          onReorderEtapas={handleReorderEtapas}
          onAddTarefa={handleAddTarefa}
          onRenameTarefa={handleRenameTarefa}
          onSetTarefaHoras={handleSetTarefaHoras}
          onDeleteTarefa={handleDeleteTarefa}
          onReorderTarefas={handleReorderTarefas}
          onAddSubtarefa={handleAddSubtarefa}
          onRenameSubtarefa={handleRenameSubtarefa}
          onSetSubtarefaHoras={handleSetSubtarefaHoras}
          onDeleteSubtarefa={handleDeleteSubtarefa}
          onReorderSubtarefas={handleReorderSubtarefas}
          onImportModelo={abrirImportarModelo}
        />
      )}

      {tab === 'custos' && (
        <div className="pd-custos card">
          {custos.length === 0 && <p className="pd-empty">Nenhum custo extra ainda.</p>}
          {custos.map((c) => (
            <div className="pd-custo-row" key={c.id}>
              <input
                className="pd-custo-nome"
                defaultValue={c.nome}
                onBlur={(e) => renameCusto(c.id, e.target.value.trim() || c.nome)}
              />
              <input
                type="number" min="0" step="1"
                className="pd-custo-valor"
                defaultValue={c.valor}
                onBlur={(e) => setValorCusto(c.id, Number(e.target.value) || 0)}
              />
              <button className="pd-custo-del" onClick={() => deleteCusto(c.id)} aria-label="Excluir custo">
                <IconTrash />
              </button>
            </div>
          ))}
          <button className="pd-add-custo" onClick={addCusto}><IconPlus /> Novo custo</button>
          <div className="pd-custo-total">
            <span>Total de custos extras</span>
            <strong>{fmtMoney(totalCustosExtras)}</strong>
          </div>
        </div>
      )}

      {modalModelo && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalModelo(false) }}>
          <div className="modal">
            <div className="modal-title">Salvar como modelo</div>
            <div className="modal-field">
              <label className="modal-label">Nome do modelo</label>
              <input
                className="modal-input" autoFocus
                value={nomeModelo}
                onChange={(e) => setNomeModelo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && salvarComoModelo()}
                placeholder="Ex.: Projeto residencial padrão"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalModelo(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarComoModelo} disabled={salvandoModelo}>
                {salvandoModelo ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalImportar && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalImportar(false) }}>
          <div className="modal">
            {escolhaImportar ? (
              <>
                <div className="modal-title">Este orçamento já tem etapas</div>
                <p className="pd-empty" style={{ padding: 0, marginBottom: 18 }}>
                  Substituir apaga as etapas atuais e coloca as do modelo no lugar. Adicionar mantém as etapas atuais e coloca as do modelo depois.
                </p>
                <div className="pd-importar-escolha">
                  <button
                    className="btn-cancel"
                    disabled={!!importando}
                    onClick={() => importarModelo(escolhaImportar, 'substituir')}
                  >
                    {importando ? 'Importando…' : 'Substituir tudo'}
                  </button>
                  <button
                    className="btn-confirm"
                    disabled={!!importando}
                    onClick={() => importarModelo(escolhaImportar, 'adicionar')}
                  >
                    {importando ? 'Importando…' : 'Adicionar ao final'}
                  </button>
                </div>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={() => setEscolhaImportar(null)} disabled={!!importando}>Voltar</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title">Importar modelo</div>
                {modelos.length === 0 ? (
                  <p className="pd-empty">Nenhum modelo cadastrado ainda.</p>
                ) : (
                  <div className="pd-modelos-lista">
                    {modelos.map((m) => (
                      <button
                        key={m.id}
                        className="pd-modelo-item"
                        disabled={importando === m.id}
                        onClick={() => escolherModelo(m.id)}
                      >
                        <span>{m.nome}</span>
                        <span className="pd-modelo-tag">{m.is_prolu ? 'Prolu' : 'Empresa'}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={() => setModalImportar(false)}>Fechar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {savedAt && (
        <div className="pd-autosave-toast">
          ✓ Atualizações salvas <span>{fmtHora(savedAt)}</span>
        </div>
      )}
    </>
  )
}
