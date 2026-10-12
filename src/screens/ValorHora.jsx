import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import Select from '../components/Select.jsx'
import { useSomenteLeitura } from '../components/BloqueioPlano.jsx'
import { IconPlus, IconTrash, IconCopy, IconEdit, IconBack, IconAlert, IconChevronDown, IconCheck } from '../components/Icons.jsx'
import {
  calcular, normalizarDados, normalizarItemEstrutura, normalizarPessoa, sincronizarDono, dadosVazios, dadosExemplo,
  encargosPadraoItem, crescePadraoItem, funcaoInfo, pctEstimado, foraProjetoSugerido, horasSemanais, totalForaProjeto,
  horaNecessaria, fmtMoeda, fmtNum, fmtPct,
} from '../utils/valorHora.js'
import { TIPOS_CUSTO, FUNCOES, CATEGORIAS_FORA, LEMBRETE_CUSTOS, NOTA_UTILIZACAO } from '../utils/valorHoraPadroes.js'
import './ValorHora.css'

// Valor-hora: referência de CUSTO-hora do escritório (tabela da migration_053).
// Independente da Precificação: nada daqui é levado para as precificações.
// Cenários soltos (sem "ativo"/"padrão"); `dados` guarda só as entradas e os
// resultados saem de src/utils/valorHora.js. Três métodos, um por porte:
// Método Prolu (recomendado), Centro de custo e Começando.

const AVISO_CUSTO = 'Valor de custo, sem margem e sem impostos. Aplique-os na precificação.'
const CHAVE_ABA = 'prolu:valor-hora:aba'
const ABAS = [
  { id: 'estrutura', label: 'Estrutura' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'resultado', label: 'Resultado' },
  { id: 'comparativo', label: 'Comparativo' },
]

function fmtDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// prolu_admin visitando outro escritório só lê (RLS da migration_053)
function usePodeEditar() {
  const { activeEmpresaId, user } = useAuth()
  const somenteLeitura = useSomenteLeitura()
  return !somenteLeitura && activeEmpresaId != null && activeEmpresaId === user?.empresaId
}

export default function ValorHora() {
  const { id } = useParams()
  return id ? <EditorCenario id={id} /> : <ListaCenarios />
}

// ════════════════════════ lista de cenários ════════════════════════
function ListaCenarios() {
  const { activeEmpresaId, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const podeEditar = usePodeEditar()

  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState(null)            // { nome } do modal "Novo cenário"
  const [criando, setCriando] = useState(false)
  const [renomear, setRenomear] = useState(null)    // { id, nome }
  const [excluir, setExcluir] = useState(null)      // cenário
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => { carregar() }, [activeEmpresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('valor_hora_cenarios')
      .select('id, nome, created_at, updated_at')
      .eq('empresa_id', activeEmpresaId)
      .order('updated_at', { ascending: false })
    if (error) toast('Erro ao carregar cenários')
    setLista(data || [])
    setLoading(false)
  }

  async function criar(comExemplo) {
    if (criando) return
    setCriando(true)
    const nome = (novo?.nome || '').trim() || (comExemplo ? 'Exemplo da planilha Prolu' : 'Novo cenário')
    const { data, error } = await supabase
      .from('valor_hora_cenarios')
      .insert({ empresa_id: activeEmpresaId, nome, dados: comExemplo ? dadosExemplo() : dadosVazios(), created_by: user.id })
      .select('id')
      .single()
    setCriando(false)
    if (error || !data) { toast('Erro ao criar cenário'); return }
    setNovo(null)
    navigate(`/precificacao/valor-hora/${data.id}`)
  }

  async function salvarNome() {
    const nome = renomear.nome.trim()
    if (!nome) return
    setOcupado(true)
    const { error } = await supabase.from('valor_hora_cenarios').update({ nome }).eq('id', renomear.id)
    setOcupado(false)
    if (error) { toast('Erro ao renomear'); return }
    setRenomear(null)
    carregar()
  }

  async function duplicar(c) {
    setOcupado(true)
    const { data: orig, error: e1 } = await supabase.from('valor_hora_cenarios').select('nome, dados').eq('id', c.id).single()
    const { error } = e1 ? { error: e1 } : await supabase.from('valor_hora_cenarios').insert({
      empresa_id: activeEmpresaId, nome: `${orig.nome} (cópia)`.slice(0, 120), dados: normalizarDados(orig.dados), created_by: user.id,
    })
    setOcupado(false)
    if (error) { toast('Erro ao duplicar'); return }
    toast('Cenário duplicado')
    carregar()
  }

  async function confirmarExcluir() {
    setOcupado(true)
    const { error } = await supabase.from('valor_hora_cenarios').delete().eq('id', excluir.id)
    setOcupado(false)
    if (error) { toast('Erro ao excluir'); return }
    setExcluir(null)
    toast('Cenário excluído')
    carregar()
  }

  return (
    <PageContainer>
      <Link to="/precificacao" className="vh-voltar"><IconBack /> Precificação</Link>
      <PageHeader
        titulo="Valor-hora"
        descricao="Referência do custo-hora do escritório. Monte cenários e veja o valor-hora pelo Método Prolu e pelos outros métodos; o valor que você usa na precificação continua sendo digitado lá."
        acoes={podeEditar && (
          <button className="btn-primary" onClick={() => setNovo({ nome: '' })}><IconPlus /> Novo cenário</button>
        )}
      />
      <p className="vh-aviso-custo">{AVISO_CUSTO}</p>
      {!podeEditar && activeEmpresaId && <p className="vh-leitura">Cenários de outro escritório — somente leitura.</p>}

      {loading ? (
        <p className="vh-vazio">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="vh-vazio-card">
          <p>Nenhum cenário ainda.</p>
          {podeEditar && <p className="vh-hint">Crie um cenário do zero ou comece pelo exemplo da planilha Prolu, com dados fictícios, para ver como o cálculo funciona.</p>}
        </div>
      ) : (
        <div className="vh-cards">
          {lista.map(c => (
            <div className="vh-card-cenario" key={c.id}>
              <button className="vh-card-abrir" onClick={() => navigate(`/precificacao/valor-hora/${c.id}`)}>
                <span className="vh-card-nome">{c.nome}</span>
                <span className="vh-card-meta">Atualizado em {fmtDataHora(c.updated_at)}</span>
              </button>
              {podeEditar && (
                <div className="vh-card-acoes">
                  <button className="vh-icone-btn" title="Renomear" aria-label={`Renomear ${c.nome}`} onClick={() => setRenomear({ id: c.id, nome: c.nome })} disabled={ocupado}><IconEdit /></button>
                  <button className="vh-icone-btn" title="Duplicar" aria-label={`Duplicar ${c.nome}`} onClick={() => duplicar(c)} disabled={ocupado}><IconCopy /></button>
                  <button className="vh-icone-btn vh-icone-perigo" title="Excluir" aria-label={`Excluir ${c.nome}`} onClick={() => setExcluir(c)} disabled={ocupado}><IconTrash /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {novo && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setNovo(null) }}>
          <div className="modal vh-modal">
            <div className="modal-title">Novo cenário</div>
            <div className="modal-field">
              <label className="modal-label" htmlFor="vh-novo-nome">Nome</label>
              <input id="vh-novo-nome" className="modal-input" autoFocus maxLength={120} placeholder="Ex.: Equipe atual"
                value={novo.nome} onChange={(e) => setNovo({ nome: e.target.value })} />
            </div>
            <div className="vh-novo-opcoes">
              <button className="vh-novo-opcao" onClick={() => criar(false)} disabled={criando}>
                <strong>Do zero</strong>
                <span>Cenário em branco para preencher com os custos do escritório.</span>
              </button>
              <button className="vh-novo-opcao" onClick={() => criar(true)} disabled={criando}>
                <strong>Com o exemplo da planilha Prolu</strong>
                <span>Dados fictícios: estrutura de R$ 17.960, 2 arquitetos e 1 estagiário.</span>
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setNovo(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {renomear && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRenomear(null) }}>
          <div className="modal">
            <div className="modal-title">Renomear cenário</div>
            <div className="modal-field">
              <label className="modal-label" htmlFor="vh-renomear">Nome</label>
              <input id="vh-renomear" className="modal-input" autoFocus maxLength={120} value={renomear.nome}
                onChange={(e) => setRenomear({ ...renomear, nome: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') salvarNome() }} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setRenomear(null)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarNome} disabled={ocupado || !renomear.nome.trim()}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {excluir && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setExcluir(null) }}>
          <div className="modal">
            <div className="modal-title">Excluir cenário</div>
            <p className="modal-delete-warn">Excluir o cenário “{excluir.nome}”? Essa ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setExcluir(null)}>Cancelar</button>
              <button className="btn-danger" onClick={confirmarExcluir} disabled={ocupado}>{ocupado ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

// ════════════════════════ editor ════════════════════════
const ATRASO_SALVAR = 800

function lerAba() {
  try {
    const a = localStorage.getItem(CHAVE_ABA)
    return ABAS.some(x => x.id === a) ? a : 'estrutura'
  } catch { return 'estrutura' }
}

function EditorCenario({ id }) {
  const toast = useToast()
  const podeEditar = usePodeEditar()

  const [cenario, setCenario] = useState(null)   // { id, nome }
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [status, setStatus] = useState('salvo')  // salvo | pendente | salvando | erro
  const [aba, setAba] = useState(lerAba)

  const pendenteRef = useRef(null)      // dados ainda não gravados
  const timerRef = useRef(null)

  useEffect(() => { carregar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('valor_hora_cenarios').select('id, nome, dados').eq('id', id).maybeSingle()
    if (error) toast('Erro ao carregar cenário')
    setCenario(data || null)
    setNome(data?.nome || '')
    // cenários da primeira versão da tela são convertidos aqui (e gravados na próxima edição)
    setDados(data ? normalizarDados(data.dados) : null)
    setLoading(false)
  }

  const salvarAgora = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const pendente = pendenteRef.current
    if (!pendente) return
    pendenteRef.current = null
    setStatus('salvando')
    const { error } = await supabase.from('valor_hora_cenarios').update({ dados: pendente }).eq('id', id)
    if (error) { setStatus('erro'); toast('Erro ao salvar') }
    else setStatus(pendenteRef.current ? 'pendente' : 'salvo')
  }, [id, toast])

  // ao sair da tela, grava o que estiver pendente
  useEffect(() => () => { salvarAgora() }, [salvarAgora])
  useEffect(() => {
    const antesDeSair = (e) => { if (pendenteRef.current) { salvarAgora(); e.preventDefault() } }
    window.addEventListener('beforeunload', antesDeSair)
    return () => window.removeEventListener('beforeunload', antesDeSair)
  }, [salvarAgora])

  // toda edição passa por sincronizarDono: as linhas do dono acompanham o pró-labore
  const atualizar = useCallback((fn) => {
    if (!podeEditar) return
    setDados(atual => {
      const novo = sincronizarDono(fn(atual))
      pendenteRef.current = novo
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(salvarAgora, ATRASO_SALVAR)
      return novo
    })
    setStatus('pendente')
  }, [podeEditar, salvarAgora])

  function trocarAba(a) {
    setAba(a)
    try { localStorage.setItem(CHAVE_ABA, a) } catch { /* sem localStorage: só não lembra */ }
  }

  async function salvarNome() {
    const limpo = nome.trim() || 'Sem nome'
    setNome(limpo)
    if (limpo === cenario.nome) return
    setStatus('salvando')
    const { error } = await supabase.from('valor_hora_cenarios').update({ nome: limpo }).eq('id', id)
    if (error) { setStatus('erro'); toast('Erro ao renomear'); return }
    setCenario(c => ({ ...c, nome: limpo }))
    setStatus(pendenteRef.current ? 'pendente' : 'salvo')
  }

  const calc = useMemo(() => (dados ? calcular(dados) : null), [dados])

  if (loading) return <PageContainer><p className="vh-vazio">Carregando…</p></PageContainer>
  if (!cenario || !dados) {
    return (
      <PageContainer>
        <Link to="/precificacao/valor-hora" className="vh-voltar"><IconBack /> Cenários</Link>
        <p className="vh-vazio">Cenário não encontrado.</p>
      </PageContainer>
    )
  }

  const ctx = { dados, calc, podeEditar, atualizar, irPara: trocarAba }

  return (
    <PageContainer className="vh-editor">
      <Link to="/precificacao/valor-hora" className="vh-voltar"><IconBack /> Cenários</Link>

      {/* faixa fixa: acompanha a rolagem em todas as abas */}
      <div className="vh-faixa">
        <input className="vh-faixa-nome" value={nome} maxLength={120} aria-label="Nome do cenário"
          disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <div className="vh-faixa-valor">
          <span className="vh-faixa-rotulo">Valor-hora recomendado (Método Prolu)</span>
          <strong>{calc.metodos.m1.valor == null ? '—' : <>{fmtMoeda(calc.metodos.m1.valor)}<small>/h</small></>}</strong>
        </div>
        <span className="vh-faixa-fo" title="Ocupação produtiva">FO {fmtNum(dados.fo, 1)}%</span>
        <StatusSalvo status={status} podeEditar={podeEditar} />
      </div>

      <p className="vh-aviso-custo">{AVISO_CUSTO}</p>
      {!podeEditar && <p className="vh-leitura">Cenário de outro escritório — somente leitura.</p>}

      <div className="vh-abas" role="tablist" aria-label="Seções do cenário">
        {ABAS.map(a => (
          <button key={a.id} type="button" role="tab" id={`vh-aba-${a.id}`}
            aria-selected={aba === a.id} aria-controls={`vh-painel-${a.id}`}
            className={`vh-aba${aba === a.id ? ' on' : ''}`} onClick={() => trocarAba(a.id)}>
            {a.label}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`vh-painel-${aba}`} aria-labelledby={`vh-aba-${aba}`}>
        {aba === 'estrutura' && <AbaEstrutura {...ctx} />}
        {aba === 'equipe' && <AbaEquipe {...ctx} />}
        {aba === 'resultado' && <AbaResultado {...ctx} />}
        {aba === 'comparativo' && <AbaComparativo {...ctx} />}
      </section>
    </PageContainer>
  )
}

function StatusSalvo({ status, podeEditar }) {
  if (!podeEditar) return <span className="vh-status">Somente leitura</span>
  if (status === 'erro') return <span className="vh-status vh-status-erro"><IconAlert aria-hidden="true" /> Erro ao salvar</span>
  if (status === 'salvo') return <span className="vh-status vh-status-ok"><IconCheck aria-hidden="true" /> Salvo</span>
  return <span className="vh-status">Salvando…</span>
}

// ── peças comuns ──
function Celula({ rotulo, children, className = '' }) {
  return <span className={`vh-cel ${className}`} role="cell"><span className="vh-cel-rotulo" aria-hidden="true">{rotulo}</span>{children}</span>
}

function Numero({ valor, onChange, prefixo, sufixo, max = 1e9, disabled, ariaLabel, id }) {
  return (
    <span className={`vh-numero${disabled ? ' disabled' : ''}`}>
      {prefixo && <span className="vh-numero-afixo">{prefixo}</span>}
      <input id={id} type="number" inputMode="decimal" min={0} max={max} step="any" aria-label={ariaLabel} disabled={disabled}
        value={valor == null ? '' : valor}
        onChange={(e) => {
          const t = e.target.value
          if (t === '') return onChange(null)
          const n = Number(t)
          if (Number.isFinite(n)) onChange(Math.min(Math.max(n, 0), max))
        }} />
      {sufixo && <span className="vh-numero-afixo">{sufixo}</span>}
    </span>
  )
}

function Alertas({ itens }) {
  if (!itens.length) return null
  return (
    <div className="vh-alertas" role="status">
      {itens.map((t, n) => <p key={n} className="vh-alerta"><IconAlert aria-hidden="true" /> {t}</p>)}
    </div>
  )
}

// "?" com explicação curta, abre/fecha no clique
function Ajuda({ texto, rotulo }) {
  const [aberto, setAberto] = useState(false)
  return (
    <span className="vh-ajuda">
      <button type="button" className="vh-ajuda-btn" aria-expanded={aberto} aria-label={`O que é ${rotulo}?`} onClick={() => setAberto(v => !v)}>?</button>
      {aberto && <span className="vh-ajuda-texto" role="note">{texto}</span>}
    </span>
  )
}

// ════════════════════════ aba Estrutura ════════════════════════
function AbaEstrutura({ dados, calc, podeEditar, atualizar }) {
  const setItem = (itemId, patch) => atualizar(d => ({ ...d, estrutura: d.estrutura.map(x => (x.id === itemId ? { ...x, ...patch } : x)) }))

  // troca de tipo / pró-labore: o padrão novo só substitui o valor que ainda era o padrão antigo
  function trocarTipo(i, tipo) {
    const patch = { tipo }
    if (i.encargos_pct === encargosPadraoItem(i.tipo, i.pro_labore)) patch.encargos_pct = encargosPadraoItem(tipo, i.pro_labore)
    if (i.cresce_com_equipe === crescePadraoItem(i.tipo, i.pro_labore)) patch.cresce_com_equipe = crescePadraoItem(tipo, i.pro_labore)
    setItem(i.id, patch)
  }
  function trocarProLabore(i, proLabore) {
    const patch = { pro_labore: proLabore }
    if (i.encargos_pct === encargosPadraoItem(i.tipo, i.pro_labore)) patch.encargos_pct = encargosPadraoItem(i.tipo, proLabore)
    if (i.cresce_com_equipe === crescePadraoItem(i.tipo, i.pro_labore)) patch.cresce_com_equipe = crescePadraoItem(i.tipo, proLabore)
    setItem(i.id, patch)
  }

  return (
    <>
      <div className="vh-bloco vh-campos-linha">
        <label className="vh-campo vh-campo-hf">
          <span className="modal-label">Horas de funcionamento por mês</span>
          <Numero valor={dados.horas_funcionamento} sufixo="h" max={744} disabled={!podeEditar}
            onChange={(v) => atualizar(d => ({ ...d, horas_funcionamento: v }))} />
          <span className="vh-hint">Horas em que o escritório fica aberto no mês, no relógio.</span>
        </label>
        <div className="vh-resumo-num">
          <span>Hora de funcionamento</span>
          <strong>{fmtMoeda(calc.horaFuncionamento)}<small>/h</small></strong>
          <span className="vh-hint">Estrutura ÷ horas de funcionamento</span>
        </div>
      </div>

      <div className="vh-secao-head">
        <h2 className="vh-secao-titulo">Custos da estrutura</h2>
        <p className="vh-secao-sub">Tudo o que o escritório gasta por mês para funcionar, inclusive pessoas que não produzem projeto e o pró-labore do dono.</p>
      </div>
      <div className="vh-tabela" role="table" aria-label="Custos da estrutura">
        <div className="vh-linha vh-linha-cab" role="row">
          <span role="columnheader">Nome</span><span role="columnheader">Tipo</span><span role="columnheader">Valor mensal</span>
          <span role="columnheader">Encargos</span><span role="columnheader">Pró-labore</span><span role="columnheader">Total</span><span />
        </div>
        {calc.estrutura.map(i => (
          <div className={`vh-linha${i.fora ? ' vh-linha-fora' : ''}`} role="row" key={i.id}>
            <Celula rotulo="Nome"><input className="vh-input" value={i.nome} maxLength={80} placeholder="Ex.: Aluguel" disabled={!podeEditar}
              aria-label="Nome do custo" onChange={(e) => setItem(i.id, { nome: e.target.value })} /></Celula>
            <Celula rotulo="Tipo"><Select value={i.tipo} options={TIPOS_CUSTO} ariaLabel="Tipo" disabled={!podeEditar}
              onChange={(v) => trocarTipo(i, v)} className="vh-select" /></Celula>
            <Celula rotulo="Valor mensal"><Numero valor={i.valor_mensal} prefixo="R$" disabled={!podeEditar} ariaLabel="Valor mensal"
              onChange={(v) => setItem(i.id, { valor_mensal: v })} /></Celula>
            <Celula rotulo="Encargos"><Numero valor={i.encargos_pct} sufixo="%" max={1000} disabled={!podeEditar} ariaLabel="Encargos"
              onChange={(v) => setItem(i.id, { encargos_pct: v })} /></Celula>
            <Celula rotulo="Pró-labore">
              <label className="vh-check"><input type="checkbox" checked={i.pro_labore} disabled={!podeEditar}
                onChange={(e) => trocarProLabore(i, e.target.checked)} /> <span>Pró-labore do dono</span></label>
            </Celula>
            <Celula rotulo="Total"><span className="vh-calc">{fmtMoeda(i.total)}</span>
              {i.fora && <span className="vh-fora-nota">na equipe: o dono produz</span>}</Celula>
            <span className="vh-cel-acao">{podeEditar && (
              <button className="vh-icone-btn vh-icone-perigo" aria-label={`Remover ${i.nome || 'custo'}`} title="Remover"
                onClick={() => atualizar(d => ({ ...d, estrutura: d.estrutura.filter(x => x.id !== i.id) }))}><IconTrash /></button>
            )}</span>
          </div>
        ))}
        {podeEditar && (
          <button className="vh-add" onClick={() => atualizar(d => ({ ...d, estrutura: [...d.estrutura, normalizarItemEstrutura({ tipo: 'estrutura' })] }))}>
            <IconPlus /> Adicionar custo
          </button>
        )}
        <div className="vh-total-linha"><span>Total da estrutura</span><strong>{fmtMoeda(calc.E)}</strong></div>
      </div>

      <div className="vh-lembrete">
        <strong>Costuma ficar de fora:</strong> {LEMBRETE_CUSTOS.join(', ')}.
      </div>

      <details className="vh-opcoes">
        <summary>Opções do Método Prolu <IconChevronDown aria-hidden="true" /></summary>
        <div className="vh-opcoes-corpo">
          <p className="vh-secao-sub">Quais custos crescem quando a equipe cresce (aluguel maior, mais equipamentos e softwares)? Eles formam o FE: ao simular mais profissionais do que a referência, essa parte da estrutura cresce junto no Método Prolu.</p>
          {dados.estrutura.length === 0 ? <p className="vh-hint">Nenhum custo na estrutura.</p> : (
            <ul className="vh-cresce-lista">
              {calc.estrutura.map(i => (
                <li key={i.id}>
                  <label className="vh-check">
                    <input type="checkbox" checked={i.cresce_com_equipe} disabled={!podeEditar || i.pro_labore}
                      onChange={(e) => setItem(i.id, { cresce_com_equipe: e.target.checked })} />
                    <span>{i.nome || 'Sem nome'}</span>
                  </label>
                  <span className="vh-hint">{i.pro_labore ? 'pró-labore não cresce' : fmtMoeda(i.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="vh-fe-linha">FE: <strong>{fmtPct(calc.FE)}</strong> da estrutura cresce com a equipe</p>

          <div className="vh-ref">
            <label className="vh-campo">
              <span className="modal-label">Estrutura informada para quantos profissionais produtivos?</span>
              <Numero valor={dados.equipe_referencia} max={1000} disabled={!podeEditar}
                onChange={(v) => atualizar(d => ({ ...d, equipe_referencia: v }))} />
              <span className="vh-hint">Vazio = usa a equipe atual ({calc.n} {calc.n === 1 ? 'profissional' : 'profissionais'}, sem contar o dono).</span>
            </label>
            {podeEditar && (
              <button className="btn-cancel vh-ref-btn" onClick={() => atualizar(d => ({ ...d, equipe_referencia: calc.n }))}>
                Aceitar a equipe atual como referência
              </button>
            )}
          </div>
        </div>
      </details>
    </>
  )
}

// ════════════════════════ aba Equipe ════════════════════════
function AbaEquipe({ dados, calc, podeEditar, atualizar, irPara }) {
  const setPessoa = (pid, patch) => atualizar(d => ({ ...d, equipe: d.equipe.map(x => (x.id === pid ? { ...x, ...patch } : x)) }))
  function trocarFuncao(p, funcao) {
    const antes = funcaoInfo(p.funcao)
    const depois = funcaoInfo(funcao)
    const patch = { funcao }
    if (p.encargos_pct === antes.encargosPct) patch.encargos_pct = depois.encargosPct
    if (p.pct_produtivo === antes.pctProdutivo) patch.pct_produtivo = depois.pctProdutivo
    setPessoa(p.id, patch)
  }
  const temProLabore = dados.estrutura.some(i => i.pro_labore)
  const avisos = calc.avisos.map(a => a.texto)

  return (
    <>
      <div className="vh-bloco vh-dono">
        <div className="vh-campo">
          <span className="modal-label">O dono produz?</span>
          <div className="vh-sim-nao" role="group" aria-label="O dono produz?">
            <button className={!dados.dono_produz ? 'on' : ''} aria-pressed={!dados.dono_produz} disabled={!podeEditar}
              onClick={() => atualizar(d => ({ ...d, dono_produz: false }))}>Não</button>
            <button className={dados.dono_produz ? 'on' : ''} aria-pressed={dados.dono_produz} disabled={!podeEditar}
              onClick={() => atualizar(d => ({ ...d, dono_produz: true }))}>Sim</button>
          </div>
        </div>
        <p className="vh-dono-texto">
          {dados.dono_produz
            ? 'O pró-labore saiu da estrutura e virou uma linha da equipe (custo e encargos vêm da Estrutura). Coloque poucas horas produtivas para o dono: ele não produz o tempo todo.'
            : 'O pró-labore fica na estrutura e o dono fica fora da equipe produtiva: se o escritório funcionar, independente do dono produzir, ele tem que ganhar dinheiro.'}
        </p>
        {dados.dono_produz && !temProLabore && (
          <p className="vh-alerta"><IconAlert aria-hidden="true" /> Nenhum custo está marcado como pró-labore. Marque o pró-labore na <button className="vh-link-inline" onClick={() => irPara('estrutura')}>aba Estrutura</button> para o dono entrar na equipe.</p>
        )}
      </div>

      <div className="vh-secao-head">
        <h2 className="vh-secao-titulo">Equipe produtiva</h2>
        <p className="vh-secao-sub">Quem produz projeto. O % produtivo é a parte das horas que vira projeto; use “Estimar” para calcular a partir das horas fora de projeto. Encargos de 20% podem ficar baixos para CLT (férias, 13º, FGTS, INSS): ajuste por pessoa.</p>
      </div>
      <div className="vh-equipe">
        {calc.pessoas.length === 0 && <p className="vh-hint vh-equipe-vazia">Nenhuma pessoa na equipe produtiva.</p>}
        {calc.pessoas.map(p => (
          <LinhaPessoa key={p.id} p={p} podeEditar={podeEditar}
            onChange={(patch) => setPessoa(p.id, patch)} onFuncao={(f) => trocarFuncao(p, f)}
            onRemover={() => atualizar(d => ({ ...d, equipe: d.equipe.filter(x => x.id !== p.id) }))} />
        ))}
        {podeEditar && (
          <button className="vh-add" onClick={() => atualizar(d => ({ ...d, equipe: [...d.equipe, normalizarPessoa({ funcao: 'arquiteto' })] }))}>
            <IconPlus /> Adicionar pessoa
          </button>
        )}
        <div className="vh-total-linha">
          <span>Equipe com encargos (Q) · horas produtivas (H)</span>
          <strong>{fmtMoeda(calc.Q)} · {fmtNum(calc.H)} h/mês</strong>
        </div>
      </div>

      {calc.extras > 0 && (
        <p className="vh-nota-fe">
          Você está simulando {calc.extras} {calc.extras === 1 ? 'profissional' : 'profissionais'} a mais: a estrutura efetiva do Método Prolu foi ajustada em {fmtMoeda(calc.ajusteEstrutura)} (FE).
        </p>
      )}
      <Alertas itens={avisos} />
    </>
  )
}

function LinhaPessoa({ p, podeEditar, onChange, onFuncao, onRemover }) {
  const [estimarAberto, setEstimarAberto] = useState(false)
  const estimado = pctEstimado(p)
  const semana = horasSemanais(p)
  const fora = totalForaProjeto(p)
  const pctMostrado = p.pct_modo === 'estimado' ? (estimado == null ? null : Math.round(estimado * 1000) / 10) : p.pct_produtivo
  const vinculada = p.dono

  function abrirEstimar() {
    const vazio = CATEGORIAS_FORA.every(c => p.fora_projeto[c.key] == null)
    if (vazio && podeEditar && semana > 0) onChange({ fora_projeto: foraProjetoSugerido(p) })
    setEstimarAberto(v => !v)
  }

  return (
    <div className={`vh-pessoa${vinculada ? ' vh-pessoa-dono' : ''}`}>
      <div className="vh-pessoa-grade">
        <label className="vh-campo vh-campo-nome"><span className="modal-label">Nome</span>
          <input className="vh-input" value={p.nome} maxLength={80} placeholder="Ex.: Arquiteta Ana" disabled={!podeEditar || vinculada}
            onChange={(e) => onChange({ nome: e.target.value })} /></label>
        <div className="vh-campo"><span className="modal-label">Função</span>
          {vinculada ? <span className="vh-fixo">Dono/sócio</span> : (
            <Select value={p.funcao} options={FUNCOES} ariaLabel="Função" disabled={!podeEditar} onChange={onFuncao} className="vh-select" />
          )}</div>
        <label className="vh-campo"><span className="modal-label">Centro de custo</span>
          <input className="vh-input" value={p.centro_custo} maxLength={40} placeholder="Geral" disabled={!podeEditar}
            onChange={(e) => onChange({ centro_custo: e.target.value })} /></label>
        <label className="vh-campo"><span className="modal-label">Custo mensal</span>
          {vinculada ? <span className="vh-fixo" title="Editar na aba Estrutura">{fmtMoeda(p.custo_mensal || 0)}</span> : (
            <Numero valor={p.custo_mensal} prefixo="R$" disabled={!podeEditar} onChange={(v) => onChange({ custo_mensal: v })} />
          )}</label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Encargos</span>
          {vinculada ? <span className="vh-fixo">{fmtNum(p.encargos_pct || 0, 1)}%</span> : (
            <Numero valor={p.encargos_pct} sufixo="%" max={1000} disabled={!podeEditar} onChange={(v) => onChange({ encargos_pct: v })} />
          )}</label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Horas/dia</span>
          <Numero valor={p.horas_dia} sufixo="h" max={24} disabled={!podeEditar} onChange={(v) => onChange({ horas_dia: v })} /></label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Dias/semana</span>
          <Numero valor={p.dias_semana} max={7} disabled={!podeEditar} onChange={(v) => onChange({ dias_semana: v })} /></label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Semanas/mês</span>
          <Numero valor={p.semanas_mes} max={5} disabled={!podeEditar} onChange={(v) => onChange({ semanas_mes: v })} /></label>
        <div className="vh-campo vh-campo-curto"><span className="modal-label">% produtivo</span>
          <Numero valor={pctMostrado} sufixo="%" max={100} disabled={!podeEditar} ariaLabel="% produtivo"
            onChange={(v) => onChange({ pct_produtivo: v, pct_modo: 'digitado' })} />
          <button className={`vh-estimar-btn${estimarAberto ? ' on' : ''}`} onClick={abrirEstimar} aria-expanded={estimarAberto}>
            {p.pct_modo === 'estimado' ? 'Estimado · ver' : 'Estimar'}
          </button>
        </div>
        <div className="vh-pessoa-resumo">
          <span><strong>{fmtNum(p.hp)} h</strong> produtivas/mês</span>
          <span>{fmtMoeda(p.custo)} com encargos</span>
          {vinculada && <span className="vh-hint">Custo e encargos vêm do pró-labore: edite na aba Estrutura.</span>}
        </div>
        {podeEditar && !vinculada && (
          <button className="vh-icone-btn vh-icone-perigo vh-pessoa-remover" aria-label={`Remover ${p.nome || 'pessoa'}`} title="Remover" onClick={onRemover}><IconTrash /></button>
        )}
      </div>

      {estimarAberto && (
        <div className="vh-estimar">
          <p className="vh-estimar-titulo">Estimar % produtivo <span className="vh-tag-estimativa">estimativa editável</span></p>
          <p className="vh-hint">Quantas horas por semana {p.nome || 'esta pessoa'} passa fora de projeto? Os valores iniciais são sugestões pela função.</p>
          {semana > 0 ? (
            <>
              <div className="vh-estimar-grade">
                {CATEGORIAS_FORA.map(c => (
                  <label className="vh-campo" key={c.key}><span className="vh-estimar-rotulo">{c.label}</span>
                    <Numero valor={p.fora_projeto[c.key]} sufixo="h/sem" max={168} disabled={!podeEditar}
                      onChange={(v) => onChange({ fora_projeto: { ...p.fora_projeto, [c.key]: v } })} /></label>
                ))}
              </div>
              <p className="vh-estimar-conta">
                1 − ({fmtNum(fora)} h fora de projeto ÷ {fmtNum(semana)} h na semana) = <strong>{fmtPct(estimado)}</strong> produtivo
              </p>
              {podeEditar && (
                <div className="vh-estimar-acoes">
                  <button className="btn-confirm" onClick={() => { onChange({ pct_modo: 'estimado' }); setEstimarAberto(false) }}>Usar esta estimativa</button>
                  <button className="btn-cancel" onClick={() => onChange({ fora_projeto: foraProjetoSugerido(p) })}>Voltar às sugestões da função</button>
                  {p.pct_modo === 'estimado' && (
                    <button className="btn-cancel" onClick={() => onChange({ pct_modo: 'digitado', pct_produtivo: estimado == null ? null : Math.round(estimado * 1000) / 10 })}>Digitar o % direto</button>
                  )}
                </div>
              )}
            </>
          ) : <p className="vh-hint">Preencha horas por dia e dias por semana para estimar.</p>}
        </div>
      )}
    </div>
  )
}

// ════════════════════════ painel de ocupação (Resultado e Comparativo) ════════════════════════
function PainelOcupacao({ dados, podeEditar, atualizar }) {
  return (
    <div className="vh-bloco vh-ocupacao">
      <h2 className="vh-secao-titulo">Ocupação</h2>
      <p className="vh-secao-sub">
        Ocupação é quanto das horas você espera conseguir vender. Seus custos são os mesmos com a agenda cheia ou vazia: quanto menos horas você vende, mais cada hora vendida precisa valer. Contamos horas de dois jeitos. Horas de funcionamento são as horas em que o escritório está aberto, no relógio. Horas produtivas são as horas de trabalho em projeto, somando todas as pessoas. Cada método usa uma das duas.
      </p>
      <div className="vh-ocupacao-controles">
        <ControleOcupacao id="vh-fo" rotulo="Ocupação produtiva (FO)" valor={dados.fo} disabled={!podeEditar}
          afeta="Afeta o Método Prolu e o Centro de custo (base: horas produtivas)."
          onChange={(v) => atualizar(d => ({ ...d, fo: v }))} />
        <ControleOcupacao id="vh-of" rotulo="Ocupação do funcionamento" valor={dados.of} disabled={!podeEditar}
          afeta="Afeta só o método Começando (base: horas de funcionamento)."
          onChange={(v) => atualizar(d => ({ ...d, of: v }))} />
      </div>
    </div>
  )
}

function ControleOcupacao({ id, rotulo, valor, onChange, afeta, disabled }) {
  return (
    <div className="vh-campo vh-controle">
      <label className="modal-label" htmlFor={id}>{rotulo}</label>
      <div className="vh-controle-linha">
        <input type="range" min={0} max={100} step={1} value={valor ?? 0} disabled={disabled} aria-label={rotulo}
          onChange={(e) => onChange(Number(e.target.value))} />
        <Numero id={id} valor={valor} sufixo="%" max={100} disabled={disabled} onChange={onChange} />
      </div>
      <span className="vh-hint">{afeta}</span>
    </div>
  )
}

// ════════════════════════ aba Resultado (Método Prolu) ════════════════════════
function AbaResultado({ dados, calc, podeEditar, atualizar }) {
  const m1 = calc.metodos.m1
  const foPct = dados.fo
  return (
    <>
      <div className="vh-destaque">
        <span className="vh-selo-prolu">Recomendado pelo Método Prolu</span>
        {m1.motivo ? (
          <p className="vh-metodo-falta">{m1.motivo}</p>
        ) : (
          <>
            <p className="vh-destaque-valor">{fmtMoeda(m1.valor)}<small>/h</small></p>
            <p className="vh-destaque-composicao">
              Estrutura rateada {fmtMoeda(calc.rateadaEf)} + equipe {fmtMoeda(calc.horaEquipe)} = {fmtMoeda(calc.semFO)} por hora produtiva, ÷ FO {fmtNum(foPct, 1)}%
            </p>
          </>
        )}
      </div>
      <Alertas itens={calc.pendencias} />

      <PainelOcupacao dados={dados} podeEditar={podeEditar} atualizar={atualizar} />

      <div className="vh-bloco">
        <h2 className="vh-secao-titulo">Por que este é o melhor cálculo</h2>
        <ul className="vh-porque">
          <li><strong>Protege os custos fixos.</strong> A estrutura inteira entra, diluída pelas horas realmente produtivas, sem cobrar duas vezes.</li>
          <li><strong>Protege os imprevistos.</strong> A ocupação produtiva (FO) assume que nem toda hora produtiva será vendida.</li>
          <li><strong>Acompanha o crescimento.</strong> Parte da estrutura cresce junto com a equipe (FE), então o valor não despenca quando a equipe aumenta; o crescimento se justifica por mais capacidade de pegar projetos.</li>
          <li><strong>Deixa o dono fora da conta produtiva.</strong> O escritório se paga mesmo quando ele não produz.</li>
          <li><strong>Sem margem e sem impostos.</strong> Eles entram na Precificação, não aqui.</li>
        </ul>
      </div>

      <div className="vh-chips">
        <div className="vh-chip">
          <span className="vh-chip-sigla">FD <Ajuda rotulo="FD" texto="Horas de funcionamento ÷ horas produtivas. A estrutura é dividida pelas horas produtivas da equipe, e não pelas horas do relógio." /></span>
          <strong>{fmtNum(calc.FD, 4)}</strong>
          <span className="vh-hint">{calc.pessoasEquivalentes == null ? '—' : `${fmtNum(calc.pessoasEquivalentes)} pessoas produtivas por hora aberta`}</span>
        </div>
        <div className="vh-chip">
          <span className="vh-chip-sigla">FE <Ajuda rotulo="FE" texto="Parte da estrutura que cresce quando a equipe cresce (aluguel, equipamentos, softwares). Ao simular mais profissionais que a referência, essa parte cresce junto." /></span>
          <strong>{fmtPct(calc.FE)}</strong>
          <span className="vh-hint">da estrutura cresce com a equipe</span>
        </div>
        <div className="vh-chip">
          <span className="vh-chip-sigla">FO <Ajuda rotulo="FO" texto="Ocupação produtiva: quanto das horas produtivas você espera vender. Nem toda hora produtiva vira projeto vendido." /></span>
          <Numero valor={dados.fo} sufixo="%" max={100} disabled={!podeEditar} ariaLabel="Ocupação produtiva (FO)"
            onChange={(v) => atualizar(d => ({ ...d, fo: v }))} />
          <span className="vh-hint">das horas produtivas vendidas</span>
        </div>
      </div>

      <div className="vh-bloco">
        <p className="vh-utilizacao">Utilização efetiva: <strong>{calc.utilizacao == null ? '—' : fmtPct(calc.utilizacao, 0)}</strong> <span className="vh-hint">(% produtivo × FO)</span></p>
        <p className="vh-hint">{NOTA_UTILIZACAO}</p>
      </div>

      <SimuladorProlu calc={calc} fo={dados.fo} valor={m1.valor} />
    </>
  )
}

function SimuladorProlu({ calc, fo, valor }) {
  const [ocupacao, setOcupacao] = useState(() => Math.min(100, Math.max(50, Math.round(fo || 80))))
  const necessaria = horaNecessaria(calc, ocupacao)
  const fecha = valor != null && necessaria != null && valor >= necessaria - 0.005
  return (
    <div className="vh-bloco vh-simulador">
      <h2 className="vh-secao-titulo">Simulador</h2>
      <label className="vh-campo" htmlFor="vh-sim-ocupacao">
        <span className="vh-sim-pergunta">Quanto da sua agenda você espera vender? <strong>{ocupacao}%</strong></span>
        <input id="vh-sim-ocupacao" type="range" min={50} max={100} step={1} value={ocupacao} onChange={(e) => setOcupacao(Number(e.target.value))} />
      </label>
      {necessaria == null || valor == null ? <p className="vh-hint">Preencha a equipe e a ocupação para simular.</p> : (
        <p className={`vh-sim-frase ${fecha ? 'fecha' : 'nao-fecha'}`}>
          Com {ocupacao}% da agenda vendida, a hora precisa valer <strong>{fmtMoeda(necessaria)}</strong> para cobrir seus custos.
          O valor recomendado é <strong>{fmtMoeda(valor)}</strong>, então a conta {fecha ? <strong>fecha</strong> : <><strong>não fecha</strong>: faltam {fmtMoeda(necessaria - valor)} por hora</>}.
        </p>
      )}
      <p className="vh-hint">Seus custos não diminuem quando a agenda tem horas vagas. Quanto menos horas você vende, mais cada hora vendida precisa valer.</p>
      {valor != null && <p className="vh-sim-fixo">Seu valor recomendado fecha a conta se você vender pelo menos {fmtNum(fo, 1)}% das horas.</p>}
    </div>
  )
}

// ════════════════════════ aba Comparativo ════════════════════════
function AbaComparativo({ dados, calc, podeEditar, atualizar, irPara }) {
  const { m1, m2, m3 } = calc.metodos
  return (
    <>
      <PainelOcupacao dados={dados} podeEditar={podeEditar} atualizar={atualizar} />
      <Alertas itens={calc.pendencias} />
      <div className="vh-metodos">
        <CardMetodo metodo={m1} titulo="Método Prolu" selo="Recomendado" tom="ok" indicado="Para escritórios em crescimento."
          ressalvas="Depende de uma boa estimativa do % produtivo e da ocupação: se a equipe produzir ou vender menos do que o informado, o valor fica curto. Revise os números a cada contratação ou mudança de custos.">
          {!m1.motivo && <p className="vh-metodo-valor">{fmtMoeda(m1.valor)}<small>/h</small></p>}
          <button className="vh-link-inline vh-metodo-link" onClick={() => irPara('resultado')}>Ver página do Método Prolu</button>
        </CardMetodo>

        <CardMetodo metodo={m2} titulo="Centro de custo" indicado="Indicado para escritórios grandes com departamentos."
          ressalvas="Se alguém falta e outro cobre a função, o valor por centro deixa de refletir o custo real. Estrutura rateada por horas (simplificação: em escritórios grandes também é comum ratear por área ou nº de pessoas). Com um só centro, o valor é igual ao do Método Prolu.">
          {!m2.motivo && (
            <>
              <ul className="vh-metodo-centros">
                {m2.centros.map(c => (
                  <li key={c.nome}>
                    <span>{c.nome}</span>
                    <strong>{c.valor == null ? <span className="vh-hint">{c.motivo}</span> : <>{fmtMoeda(c.valor)}<small>/h</small></>}</strong>
                  </li>
                ))}
              </ul>
              <p className="vh-metodo-nota">FD {fmtNum(m2.FD, 4)} · estrutura rateada {fmtMoeda(m2.rateada)}/h</p>
            </>
          )}
        </CardMetodo>

        <CardMetodo metodo={m3} titulo="Começando" indicado="Indicado para quem trabalha sozinho ou está começando."
          ressalvas="Divide todos os custos pelas horas de funcionamento. Com muitas pessoas o valor sobe mais que nos outros métodos; para quem está começando costuma ficar baixo, porque o custo é baixo.">
          {!m3.motivo && <p className="vh-metodo-valor">{fmtMoeda(m3.valor)}<small>/h</small></p>}
          {m3.alerta && (
            <p className="vh-alerta vh-alerta-card"><IconAlert aria-hidden="true" /> Este valor pressupõe que todas as horas que você trabalha são vendidas e pode ficar abaixo do ponto de equilíbrio. Ajuste a ocupação do funcionamento.</p>
          )}
        </CardMetodo>
      </div>
    </>
  )
}

function CardMetodo({ metodo, titulo, selo, tom, indicado, ressalvas, children }) {
  const [aberto, setAberto] = useState(null) // 'ressalvas' | 'calculo'
  const alternar = (q) => setAberto(a => (a === q ? null : q))
  return (
    <article className={`vh-metodo${tom === 'ok' ? ' vh-metodo-destaque' : ''}`}>
      <div className="vh-metodo-topo">
        <h3 className="vh-metodo-titulo">{titulo}</h3>
        {selo && <span className={`vh-selo vh-selo-${tom}`}>{selo}</span>}
      </div>
      <p className="vh-metodo-indicado">{indicado}</p>
      {metodo.motivo && <p className="vh-metodo-falta">{metodo.motivo}</p>}
      {children}
      <div className="vh-metodo-botoes">
        <button className={`vh-link-btn${aberto === 'ressalvas' ? ' on' : ''}`} aria-expanded={aberto === 'ressalvas'} onClick={() => alternar('ressalvas')}>
          Ressalvas <IconChevronDown aria-hidden="true" />
        </button>
        {!metodo.motivo && (
          <button className={`vh-link-btn${aberto === 'calculo' ? ' on' : ''}`} aria-expanded={aberto === 'calculo'} onClick={() => alternar('calculo')}>
            Ver cálculo <IconChevronDown aria-hidden="true" />
          </button>
        )}
      </div>
      {aberto === 'ressalvas' && <p className="vh-metodo-ressalvas">{ressalvas}</p>}
      {aberto === 'calculo' && (
        <dl className="vh-memoria">
          {metodo.memoria.map((l, n) => (
            <Fragment key={n}>
              <dt>{l.rotulo}</dt>
              <dd><span className="vh-memoria-conta">{l.conta}</span> = <strong>{l.resultado}</strong></dd>
            </Fragment>
          ))}
        </dl>
      )}
    </article>
  )
}
