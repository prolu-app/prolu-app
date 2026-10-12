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
  calcular, normalizarDados, normalizarCusto, sincronizarDono, dadosVazios, dadosExemplo, formatoAntigo,
  encargosPadrao, pctEstimado, horasSemanais, totalForaProjeto, TIPOS_CUSTO, CATEGORIAS_FORA,
  PADRAO_PRODUTIVO, PADRAO_DONO, fmtMoeda, fmtNum, fmtPct,
} from '../utils/valorHora.js'
import './ValorHora.css'

// Valor-hora: referência de CUSTO-hora do escritório (tabela da migration_053,
// dados no formato versao 3). Independente da Precificação: nada daqui é
// levado para as precificações. Cenários soltos (sem "ativo"/"padrão").
// Um método recomendado (Método Prolu) + comparativo por centro de custo.
// Cenários em formato antigo (v1/v2) não são convertidos: a tela avisa.

const AVISO_CUSTO = 'Valor de custo, sem margem e sem impostos. Aplique-os na precificação.'
const CHAVE_ABA = 'prolu:valor-hora:aba'
const ABAS = [
  { id: 'custos', label: 'Custos' },
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
      empresa_id: activeEmpresaId, nome: `${orig.nome} (cópia)`.slice(0, 120), dados: formatoAntigo(orig.dados) ? orig.dados : normalizarDados(orig.dados), created_by: user.id,
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
        descricao="Referência do custo-hora do escritório. Monte cenários e veja o valor-hora recomendado pelo Método Prolu e o comparativo por centro de custo; o valor que você usa na precificação continua sendo digitado lá."
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
    return ABAS.some(x => x.id === a) ? a : 'custos'
  } catch { return 'custos' }
}

function EditorCenario({ id }) {
  const toast = useToast()
  const navigate = useNavigate()
  const podeEditar = usePodeEditar()

  const [cenario, setCenario] = useState(null)   // { id, nome }
  const [dados, setDados] = useState(null)
  const [antigo, setAntigo] = useState(false)    // formato v1/v2: só avisa
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [status, setStatus] = useState('salvo')  // salvo | pendente | salvando | erro
  const [aba, setAba] = useState(lerAba)
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)

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
    const velho = !!data && formatoAntigo(data.dados)
    setAntigo(velho)
    setDados(data && !velho ? normalizarDados(data.dados) : null)
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

  // toda edição passa por sincronizarDono: o pró-labore segue o toggle do dono
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

  async function excluirAntigo() {
    const { error } = await supabase.from('valor_hora_cenarios').delete().eq('id', id)
    if (error) { toast('Erro ao excluir'); return }
    toast('Cenário excluído')
    navigate('/precificacao/valor-hora')
  }

  const calc = useMemo(() => (dados ? calcular(dados) : null), [dados])

  if (loading) return <PageContainer><p className="vh-vazio">Carregando…</p></PageContainer>
  if (!cenario) {
    return (
      <PageContainer>
        <Link to="/precificacao/valor-hora" className="vh-voltar"><IconBack /> Cenários</Link>
        <p className="vh-vazio">Cenário não encontrado.</p>
      </PageContainer>
    )
  }
  if (antigo) {
    return (
      <PageContainer>
        <Link to="/precificacao/valor-hora" className="vh-voltar"><IconBack /> Cenários</Link>
        <div className="vh-bloco vh-antigo">
          <h1 className="vh-antigo-titulo">{cenario.nome}</h1>
          <p className="vh-alerta"><IconAlert aria-hidden="true" /> Este cenário usa um formato antigo; crie um novo.</p>
          {podeEditar && (
            <div className="vh-antigo-acoes">
              <Link className="btn-primary" to="/precificacao/valor-hora">Voltar e criar um novo</Link>
              <button className="btn-cancel" onClick={() => setConfirmarExcluir(true)}><IconTrash /> Excluir este cenário</button>
            </div>
          )}
        </div>
        {confirmarExcluir && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmarExcluir(false) }}>
            <div className="modal">
              <div className="modal-title">Excluir cenário</div>
              <p className="modal-delete-warn">Excluir o cenário “{cenario.nome}”? Essa ação não pode ser desfeita.</p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setConfirmarExcluir(false)}>Cancelar</button>
                <button className="btn-danger" onClick={excluirAntigo}>Excluir</button>
              </div>
            </div>
          </div>
        )}
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
          <span className="vh-faixa-rotulo">Valor-hora recomendado</span>
          <strong>{calc.prolu.valor == null ? '—' : <>{fmtMoeda(calc.prolu.valor)}<small>/h</small></>}</strong>
        </div>
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
        {aba === 'custos' && <AbaCustos {...ctx} />}
        {aba === 'resultado' && <AbaResultado {...ctx} />}
        {aba === 'comparativo' && <AbaComparativo {...ctx} />}
      </section>
    </PageContainer>
  )
}

function StatusSalvo({ status, podeEditar }) {
  if (!podeEditar) return <span className="vh-status">Somente leitura</span>
  if (status === 'erro') return <span className="vh-status vh-status-erro"><IconAlert aria-hidden="true" /> Erro ao salvar</span>
  if (status === 'salvo') return <span className="vh-status vh-status-ok"><IconCheck aria-hidden="true" /> Atualizações salvas</span>
  return <span className="vh-status">Salvando…</span>
}

// ── peças comuns ──
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

const AJUDA = {
  equipe: 'Equipe produtiva: arquitetos e estagiários que produzem projeto. Não entra quem trabalha só no financeiro ou administrativo.',
  centro: 'Centro de custo: setor (criação, detalhamento, orçamento) ou função (arquitetos, estagiários). Se não usa setores, deixe “Geral”.',
  encargos: 'Encargos: férias, 13º, FGTS e outros custos sobre o salário.',
  pct: '% produtivo: parte do tempo que vira projeto de cliente; o resto é reunião, comercial, administrativo.',
}

// ════════════════════════ aba Custos ════════════════════════
const OPCOES_DONO = [
  { valor: false, titulo: 'Não', texto: 'Você administra e suas horas não entram na produção. O pró-labore continua como custo de estrutura: o escritório precisa se pagar mesmo sem as suas horas. Se você produzir projetos, essas horas ficam como ganho extra.' },
  { valor: true, titulo: 'Sim', texto: 'Você produz projetos e vende suas horas. O pró-labore deixa de ser custo de estrutura e vira uma linha da equipe produtiva. Coloque poucas horas produtivas para você: dono não produz o tempo todo.' },
]

function AbaCustos({ dados, calc, podeEditar, atualizar }) {
  const setCusto = (cid, patch) => atualizar(d => ({ ...d, custos: d.custos.map(x => (x.id === cid ? { ...x, ...patch } : x)) }))

  // o padrão novo só substitui o encargo que ainda era o padrão antigo
  function trocarTipo(c, tipo) {
    const patch = { tipo }
    if (c.encargos_pct === encargosPadrao(c.tipo, c.pro_labore)) patch.encargos_pct = encargosPadrao(tipo, c.pro_labore)
    setCusto(c.id, patch)
  }

  return (
    <>
      <div className="vh-bloco">
        <div className="vh-dono-topo">
          <h2 className="vh-secao-titulo">Considerar as horas produtivas do dono?</h2>
          <div className="vh-sim-nao" role="group" aria-label="Considerar as horas produtivas do dono?">
            {OPCOES_DONO.map(o => (
              <button key={o.titulo} type="button" className={dados.dono_considera_horas === o.valor ? 'on' : ''}
                aria-pressed={dados.dono_considera_horas === o.valor} disabled={!podeEditar}
                onClick={() => atualizar(d => ({ ...d, dono_considera_horas: o.valor }))}>{o.titulo}</button>
            ))}
          </div>
        </div>
        {/* as duas legendas ficam visíveis; a escolhida fica destacada */}
        <div className="vh-dono-opcoes">
          {OPCOES_DONO.map(o => (
            <div key={o.titulo} className={`vh-dono-opcao${dados.dono_considera_horas === o.valor ? ' on' : ''}`}>
              <span className="vh-dono-opcao-titulo">{o.titulo}</span>
              <span className="vh-dono-opcao-texto">{o.texto}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="vh-secao-head">
        <h2 className="vh-secao-titulo">Custos mensais</h2>
        <p className="vh-secao-sub">Inclua todos os custos do escritório: marketing, contabilidade, softwares e assinaturas, depreciação de equipamentos, reserva.</p>
      </div>

      <div className="vh-lista">
        <div className="vh-linha vh-linha-cab" aria-hidden="true">
          <span>Nome</span><span>Tipo</span><span>Custo mensal</span>
          <span className="vh-cab-ajuda">Encargos <Ajuda rotulo="encargos" texto={AJUDA.encargos} /></span>
          <span className="vh-cab-ajuda">Produz projeto? <Ajuda rotulo="equipe produtiva" texto={AJUDA.equipe} /></span>
          <span />
        </div>
        {calc.linhas.map(c => (
          <LinhaCusto key={c.id} c={c} podeEditar={podeEditar} donoSim={dados.dono_considera_horas}
            onChange={(patch) => setCusto(c.id, patch)} onTipo={(t) => trocarTipo(c, t)}
            onRemover={() => atualizar(d => ({ ...d, custos: d.custos.filter(x => x.id !== c.id) }))} />
        ))}
        {podeEditar && (
          <button className="vh-add" onClick={() => atualizar(d => ({ ...d, custos: [...d.custos, normalizarCusto({ tipo: 'Estrutura' })] }))}>
            <IconPlus /> Adicionar custo
          </button>
        )}

        <dl className="vh-resumo">
          <div><dt>Total de estrutura</dt><dd>{fmtMoeda(calc.estrutura)}</dd></div>
          <div><dt>Equipe produtiva (com encargos)</dt><dd>{fmtMoeda(calc.equipe)}</dd></div>
          <div><dt>Custo total</dt><dd>{fmtMoeda(calc.custoTotal)}</dd></div>
          <div><dt>Horas produtivas/mês</dt><dd>{fmtNum(calc.H)} h</dd></div>
        </dl>
      </div>
      <Alertas itens={calc.avisos} />
    </>
  )
}

function LinhaCusto({ c, podeEditar, donoSim, onChange, onTipo, onRemover }) {
  const [estimarAberto, setEstimarAberto] = useState(false)
  const estimado = pctEstimado(c)
  const semana = horasSemanais(c)
  const fora = totalForaProjeto(c)
  const pctMostrado = c.pct_modo === 'estimado' ? (estimado == null ? null : Math.round(estimado * 1000) / 10) : c.pct_produtivo

  function marcarProduz(produz) {
    const patch = { produz_projeto: produz }
    // linha que nunca foi preenchida recebe os padrões de quem produz
    if (produz && c.horas_dia == null && c.dias_semana == null) Object.assign(patch, PADRAO_PRODUTIVO)
    onChange(patch)
  }

  return (
    <div className={`vh-custo${c.produz_projeto ? ' vh-custo-produz' : ''}`}>
      <div className="vh-linha">
        <span className="vh-cel">
          <span className="vh-cel-rotulo">Nome</span>
          <input className="vh-input" value={c.nome} maxLength={80} placeholder="Ex.: Aluguel" disabled={!podeEditar}
            aria-label="Nome do custo" onChange={(e) => onChange({ nome: e.target.value })} />
          {c.pro_labore && <span className="vh-tag-pro">Pró-labore</span>}
        </span>
        <span className="vh-cel"><span className="vh-cel-rotulo">Tipo</span>
          <Select value={c.tipo} options={TIPOS_CUSTO} ariaLabel="Tipo" disabled={!podeEditar} onChange={onTipo} className="vh-select" /></span>
        <span className="vh-cel"><span className="vh-cel-rotulo">Custo mensal</span>
          <Numero valor={c.valor_mensal} prefixo="R$" disabled={!podeEditar} ariaLabel="Custo mensal (sem encargos)" onChange={(v) => onChange({ valor_mensal: v })} /></span>
        <span className="vh-cel"><span className="vh-cel-rotulo">Encargos</span>
          <Numero valor={c.encargos_pct} sufixo="%" max={1000} disabled={!podeEditar} ariaLabel="Encargos" onChange={(v) => onChange({ encargos_pct: v })} /></span>
        <span className="vh-cel"><span className="vh-cel-rotulo">Produz projeto?</span>
          <label className="vh-check" title={c.pro_labore ? 'Segue “Considerar as horas produtivas do dono?”' : undefined}>
            <input type="checkbox" checked={c.produz_projeto} disabled={!podeEditar || c.pro_labore}
              onChange={(e) => marcarProduz(e.target.checked)} />
            <span>{c.pro_labore ? (donoSim ? 'Sim (dono)' : 'Não (dono)') : 'Produz projeto'}</span>
          </label>
        </span>
        <span className="vh-cel-acao">{podeEditar && (
          <button className="vh-icone-btn vh-icone-perigo" aria-label={`Remover ${c.nome || 'custo'}`} title="Remover" onClick={onRemover}><IconTrash /></button>
        )}</span>
      </div>

      {c.produz_projeto && (
        <div className="vh-sublinha">
          <label className="vh-campo vh-campo-curto"><span className="vh-sub-rotulo">Horas/dia</span>
            <Numero valor={c.horas_dia} sufixo="h" max={24} disabled={!podeEditar} onChange={(v) => onChange({ horas_dia: v })} /></label>
          <label className="vh-campo vh-campo-curto"><span className="vh-sub-rotulo">Dias/semana</span>
            <Numero valor={c.dias_semana} max={7} disabled={!podeEditar} onChange={(v) => onChange({ dias_semana: v })} /></label>
          <div className="vh-campo vh-campo-curto"><span className="vh-sub-rotulo">% produtivo <Ajuda rotulo="% produtivo" texto={AJUDA.pct} /></span>
            <Numero valor={pctMostrado} sufixo="%" max={100} disabled={!podeEditar} ariaLabel="% produtivo"
              onChange={(v) => onChange({ pct_produtivo: v, pct_modo: 'digitado' })} /></div>
          <label className="vh-campo vh-campo-centro"><span className="vh-sub-rotulo">Centro de custo <Ajuda rotulo="centro de custo" texto={AJUDA.centro} /></span>
            <input className="vh-input" value={c.centro_custo} maxLength={40} placeholder="Geral" disabled={!podeEditar}
              onChange={(e) => onChange({ centro_custo: e.target.value })} /></label>
          <div className="vh-sub-resumo">
            <span><strong>{fmtNum(c.hp)}</strong> horas produtivas/mês</span>
            <span>custo com encargos <strong>{fmtMoeda(c.total)}</strong></span>
            <button className={`vh-estimar-btn${estimarAberto ? ' on' : ''}`} onClick={() => setEstimarAberto(v => !v)} aria-expanded={estimarAberto}>
              {c.pct_modo === 'estimado' ? '% estimado · ver' : 'Estimar % produtivo'}
            </button>
          </div>
          {c.pro_labore && (
            <p className="vh-hint vh-sub-nota">Padrão do dono: {PADRAO_DONO.horas_dia} h/dia, {PADRAO_DONO.dias_semana} dias, {PADRAO_DONO.pct_produtivo}% produtivo (provisório).</p>
          )}

          {estimarAberto && (
            <div className="vh-estimar">
              <p className="vh-hint">Quantas horas por semana {c.nome || 'esta pessoa'} passa fora de projeto?</p>
              {semana > 0 ? (
                <>
                  <div className="vh-estimar-grade">
                    {CATEGORIAS_FORA.map(k => (
                      <label className="vh-campo" key={k.key}><span className="vh-sub-rotulo">{k.label}</span>
                        <Numero valor={c.fora_projeto[k.key]} sufixo="h/sem" max={168} disabled={!podeEditar}
                          onChange={(v) => onChange({ fora_projeto: { ...c.fora_projeto, [k.key]: v } })} /></label>
                    ))}
                  </div>
                  <p className="vh-estimar-conta">
                    1 − ({fmtNum(fora)} h fora de projeto ÷ {fmtNum(semana)} h na semana) = <strong>{fmtPct(estimado)}</strong> produtivo
                  </p>
                  {podeEditar && (
                    <div className="vh-estimar-acoes">
                      <button className="btn-confirm" onClick={() => { onChange({ pct_modo: 'estimado' }); setEstimarAberto(false) }}>Usar esta estimativa</button>
                      {c.pct_modo === 'estimado' && (
                        <button className="btn-cancel" onClick={() => onChange({ pct_modo: 'digitado', pct_produtivo: estimado == null ? null : Math.round(estimado * 1000) / 10 })}>Digitar o % direto</button>
                      )}
                    </div>
                  )}
                </>
              ) : <p className="vh-hint">Preencha horas por dia e dias por semana para estimar.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════ OP: um único componente para Resultado e Comparativo ════════════════════════
function ControleOP({ dados, podeEditar, atualizar, compacto = false }) {
  const setOp = (v) => atualizar(d => ({ ...d, op: v }))
  return (
    <div className={`vh-bloco vh-op${compacto ? ' vh-op-compacto' : ''}`}>
      <div className="vh-op-linha">
        <label className="vh-op-rotulo" htmlFor={`vh-op-${compacto ? 'c' : 'r'}`}>OP (ocupação produtiva)</label>
        <input type="range" min={0} max={100} step={1} value={dados.op ?? 0} disabled={!podeEditar}
          aria-label="OP (ocupação produtiva)" onChange={(e) => setOp(Number(e.target.value))} />
        <Numero id={`vh-op-${compacto ? 'c' : 'r'}`} valor={dados.op} sufixo="%" max={100} disabled={!podeEditar} onChange={setOp} />
      </div>
      {compacto ? (
        <p className="vh-hint">Percentual das horas produtivas que você espera vender. Alterar aqui altera também o valor recomendado.</p>
      ) : (
        <p className="vh-op-texto">
          É o percentual das horas produtivas que você espera conseguir vender. Em 100%, a hora fica mais barata, mas você precisa vender todas as horas produtivas do mês para a conta fechar. Referência de mercado (escritórios dos EUA): os profissionais técnicos faturam de 75% a 85% do tempo. Sugestão: entre 75% e 85%.
        </p>
      )}
    </div>
  )
}

// ════════════════════════ aba Resultado (Método Prolu) ════════════════════════
function AbaResultado({ dados, calc, podeEditar, atualizar }) {
  const p = calc.prolu
  return (
    <>
      <div className="vh-destaque">
        <span className="vh-selo-prolu">Recomendado pelo Método Prolu</span>
        {p.motivo ? (
          <p className="vh-metodo-falta">{p.motivo}</p>
        ) : (
          <>
            <p className="vh-destaque-valor">{fmtMoeda(p.valor)}<small>/h</small></p>
            <p className="vh-destaque-composicao">
              {fmtMoeda(calc.custoTotal)} de custo total ÷ {fmtNum(calc.horasVendaveis)} horas vendáveis ({fmtNum(calc.H)} horas produtivas × {fmtNum(dados.op, 1)}%)
            </p>
          </>
        )}
      </div>

      <ControleOP dados={dados} podeEditar={podeEditar} atualizar={atualizar} />

      <div className="vh-bloco">
        <h2 className="vh-secao-titulo">Por que recomendamos este cálculo</h2>
        <ul className="vh-porque">
          <li><strong>Protege os custos fixos:</strong> toda a estrutura entra na conta, nenhum custo fica de fora.</li>
          <li><strong>Protege imprevistos:</strong> a ocupação produtiva assume que nem toda hora será vendida.</li>
          <li><strong>Funciona para qualquer porte</strong>, com ou sem o dono produzindo.</li>
        </ul>
        <p className="vh-dica">Ao contratar, atualize a estrutura: se ela continuar a mesma, o valor cai porque se divide por mais horas. Para simular, duplique o cenário.</p>
      </div>
    </>
  )
}

// ════════════════════════ aba Comparativo ════════════════════════
function AbaComparativo({ dados, calc, podeEditar, atualizar, irPara }) {
  const { prolu, centro } = calc
  return (
    <>
      <ControleOP dados={dados} podeEditar={podeEditar} atualizar={atualizar} compacto />
      <div className="vh-metodos">
        <CardMetodo metodo={prolu} titulo="Método Prolu" selo="Recomendado" destaque
          indicado="Custo total ÷ horas vendáveis."
          ressalvas="Depende de uma boa estimativa do % produtivo e da OP (ocupação produtiva): se a equipe produzir ou vender menos do que o informado, o valor fica curto. Revise os números a cada contratação ou mudança de custos.">
          {!prolu.motivo && <p className="vh-metodo-valor">{fmtMoeda(prolu.valor)}<small>/h</small></p>}
          <button className="vh-link-inline vh-metodo-link" onClick={() => irPara('resultado')}>Ver página do Método Prolu</button>
        </CardMetodo>

        <CardMetodo metodo={centro} titulo="Centro de custo" indicado="Indicado para escritórios grandes com departamentos. Centro de custo é um setor ou função da equipe (ex.: criação, detalhamento, arquitetos, estagiários)."
          ressalvas="Se alguém falta e outro cobre a função, o valor por centro deixa de refletir o custo real. Estrutura rateada por horas (simplificação: em escritórios grandes também é comum ratear por área ou nº de pessoas). Com um só centro, o valor é igual ao do Método Prolu.">
          {!centro.motivo && (
            <ul className="vh-metodo-centros">
              {centro.centros.map(g => (
                <li key={g.nome}>
                  <div className="vh-centro-topo">
                    <span>{g.nome}</span>
                    <strong>{g.valor == null ? <span className="vh-hint">{g.motivo}</span> : <>{fmtMoeda(g.valor)}<small>/h</small></>}</strong>
                  </div>
                  {g.valor != null && (
                    <span className="vh-centro-conta">estrutura por hora produtiva {fmtMoeda(g.estruturaHora)} + custo do centro por hora {fmtMoeda(g.centroHora)}, ÷ OP {fmtNum(dados.op, 1)}%</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardMetodo>
      </div>
    </>
  )
}

function CardMetodo({ metodo, titulo, selo, destaque, indicado, ressalvas, children }) {
  const [aberto, setAberto] = useState(null) // 'ressalvas' | 'calculo'
  const alternar = (q) => setAberto(a => (a === q ? null : q))
  return (
    <article className={`vh-metodo${destaque ? ' vh-metodo-destaque' : ''}`}>
      <div className="vh-metodo-topo">
        <h3 className="vh-metodo-titulo">{titulo}</h3>
        {selo && <span className="vh-selo vh-selo-ok">{selo}</span>}
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
