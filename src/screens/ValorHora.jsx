import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import Select from '../components/Select.jsx'
import { useSomenteLeitura } from '../components/BloqueioPlano.jsx'
import { IconPlus, IconTrash, IconCopy, IconEdit, IconBack, IconAlert, IconChevronDown } from '../components/Icons.jsx'
import {
  calcular, normalizarDados, normalizarItemEstrutura, normalizarPessoa, dadosVazios, dadosExemplo,
  encargosPadraoTipo, funcaoInfo, produtivoEstimado, foraProjetoSugerido, horasSemanais, totalForaProjeto,
  custoPorHoraVendida, fmtMoeda, fmtNum, fmtPct,
} from '../utils/valorHora.js'
import { TIPOS_CUSTO, FUNCOES, CATEGORIAS_FORA, OCUPACOES_SIMULADOR } from '../utils/valorHoraPadroes.js'
import './ValorHora.css'

// Valor-hora: referência de CUSTO-hora do escritório (migration_053).
// Independente da Precificação: nada daqui é levado para as precificações.
// Cenários soltos (sem "ativo"/"padrão"); `dados` guarda só as entradas e os
// resultados saem de src/utils/valorHora.js.

const AVISO_CUSTO = 'Valor de custo, sem margem e sem impostos. Aplique-os na precificação.'

function fmtDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
const fmtHora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

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
    const nome = (novo?.nome || '').trim() || (comExemplo ? 'Cenário de exemplo' : 'Novo cenário')
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
        descricao="Referência do custo-hora do escritório. Monte cenários e compare os métodos de cálculo; o valor que você usa na precificação continua sendo digitado lá."
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
          {podeEditar && <p className="vh-hint">Crie um cenário do zero ou comece pelo exemplo, com dados fictícios para ver como o cálculo funciona.</p>}
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
                <strong>Começar do zero</strong>
                <span>Cenário em branco para preencher com os custos do escritório.</span>
              </button>
              <button className="vh-novo-opcao" onClick={() => criar(true)} disabled={criando}>
                <strong>Começar com exemplo</strong>
                <span>Dados fictícios de um escritório com 2 arquitetos e 1 estagiário.</span>
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

function EditorCenario({ id }) {
  const toast = useToast()
  const podeEditar = usePodeEditar()

  const [cenario, setCenario] = useState(null)   // { id, nome }
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [savedAt, setSavedAt] = useState(null)

  const pendenteRef = useRef(null)      // dados ainda não gravados
  const timerRef = useRef(null)
  const savedTimeoutRef = useRef(null)

  useEffect(() => { carregar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('valor_hora_cenarios').select('id, nome, dados').eq('id', id).maybeSingle()
    if (error) toast('Erro ao carregar cenário')
    setCenario(data || null)
    setNome(data?.nome || '')
    setDados(data ? normalizarDados(data.dados) : null)
    setLoading(false)
  }

  const markSaved = useCallback(() => {
    setSavedAt(new Date())
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSavedAt(null), 3000)
  }, [])

  const salvarAgora = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const pendente = pendenteRef.current
    if (!pendente) return
    pendenteRef.current = null
    const { error } = await supabase.from('valor_hora_cenarios').update({ dados: pendente }).eq('id', id)
    if (error) toast('Erro ao salvar')
    else markSaved()
  }, [id, toast, markSaved])

  // ao sair da tela, grava o que estiver pendente
  useEffect(() => () => {
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    salvarAgora()
  }, [salvarAgora])
  useEffect(() => {
    const antesDeSair = (e) => { if (pendenteRef.current) { salvarAgora(); e.preventDefault() } }
    window.addEventListener('beforeunload', antesDeSair)
    return () => window.removeEventListener('beforeunload', antesDeSair)
  }, [salvarAgora])

  function atualizar(fn) {
    if (!podeEditar) return
    setDados(atual => {
      const novo = fn(atual)
      pendenteRef.current = novo
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(salvarAgora, ATRASO_SALVAR)
      return novo
    })
  }
  const setCampo = (patch) => atualizar(d => ({ ...d, ...patch }))
  const setItem = (lista, itemId, patch) => atualizar(d => ({ ...d, [lista]: d[lista].map(x => (x.id === itemId ? { ...x, ...patch } : x)) }))
  const removerItem = (lista, itemId) => atualizar(d => ({ ...d, [lista]: d[lista].filter(x => x.id !== itemId) }))

  async function salvarNome() {
    const limpo = nome.trim() || 'Sem nome'
    setNome(limpo)
    if (limpo === cenario.nome) return
    const { error } = await supabase.from('valor_hora_cenarios').update({ nome: limpo }).eq('id', id)
    if (error) { toast('Erro ao renomear'); return }
    setCenario(c => ({ ...c, nome: limpo }))
    markSaved()
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

  // "Dono produz?": Sim põe o dono na equipe (custo = pró-labore); Não o tira
  function setDonoProduz(sim) {
    atualizar(d => {
      if (!sim) return { ...d, donoProduz: false, equipe: d.equipe.filter(p => p.funcao !== 'dono') }
      if (d.equipe.some(p => p.funcao === 'dono')) return { ...d, donoProduz: true }
      const proLabore = d.estrutura.filter(i => i.proLabore)
        .reduce((s, i) => s + (i.custo || 0) * (1 + (i.encargosPct || 0) / 100), 0)
      const dono = normalizarPessoa({ nome: 'Dono/sócio', funcao: 'dono', custo: proLabore || null })
      return { ...d, donoProduz: true, equipe: [dono, ...d.equipe] }
    })
  }

  // troca de tipo/função: o padrão novo só substitui o valor que ainda era o padrão antigo
  function trocarTipo(item, tipo) {
    const patch = { tipo }
    if (!item.proLabore && item.encargosPct === encargosPadraoTipo(item.tipo)) patch.encargosPct = encargosPadraoTipo(tipo)
    setItem('estrutura', item.id, patch)
  }
  function trocarProLabore(item, proLabore) {
    const patch = { proLabore }
    if (proLabore && item.encargosPct === encargosPadraoTipo(item.tipo)) patch.encargosPct = 0
    if (!proLabore && item.encargosPct === 0) patch.encargosPct = encargosPadraoTipo(item.tipo)
    setItem('estrutura', item.id, patch)
  }
  function trocarFuncao(p, funcao) {
    const antes = funcaoInfo(p.funcao)
    const depois = funcaoInfo(funcao)
    const patch = { funcao }
    if (p.encargosPct === antes.encargosPct) patch.encargosPct = depois.encargosPct
    if (p.produtivoPct === antes.produtivoPct) patch.produtivoPct = depois.produtivoPct
    setItem('equipe', p.id, patch)
  }

  return (
    <PageContainer className="vh-editor">
      <Link to="/precificacao/valor-hora" className="vh-voltar"><IconBack /> Cenários</Link>
      <div className="vh-titulo-linha">
        <input className="vh-titulo-input page-title" value={nome} maxLength={120} aria-label="Nome do cenário"
          disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </div>
      <p className="vh-aviso-custo">{AVISO_CUSTO}</p>
      {!podeEditar && <p className="vh-leitura">Cenário de outro escritório — somente leitura.</p>}

      {/* ── 1. estrutura ── */}
      <section className="vh-secao">
        <div className="vh-secao-head">
          <h2 className="vh-secao-titulo">Custos da estrutura</h2>
          <p className="vh-secao-sub">Tudo o que o escritório gasta por mês para funcionar, inclusive pessoas que não produzem projeto.</p>
        </div>
        <div className="vh-tabela vh-tabela-estrutura" role="table" aria-label="Custos da estrutura">
          <div className="vh-linha vh-linha-cab" role="row">
            <span role="columnheader">Nome</span><span role="columnheader">Tipo</span><span role="columnheader">Custo mensal</span>
            <span role="columnheader">Encargos</span><span role="columnheader">Pró-labore do dono</span><span role="columnheader">Total</span><span />
          </div>
          {calc.estrutura.map(i => (
            <div className={`vh-linha${i.fora ? ' vh-linha-fora' : ''}`} role="row" key={i.id}>
              <Celula rotulo="Nome"><input className="vh-input" value={i.nome} maxLength={80} placeholder="Ex.: Aluguel" disabled={!podeEditar}
                onChange={(e) => setItem('estrutura', i.id, { nome: e.target.value })} /></Celula>
              <Celula rotulo="Tipo"><Select value={i.tipo} options={TIPOS_CUSTO} ariaLabel="Tipo" disabled={!podeEditar}
                onChange={(v) => trocarTipo(i, v)} className="vh-select" /></Celula>
              <Celula rotulo="Custo mensal"><Numero valor={i.custo} prefixo="R$" disabled={!podeEditar} onChange={(v) => setItem('estrutura', i.id, { custo: v })} ariaLabel="Custo mensal" /></Celula>
              <Celula rotulo="Encargos"><Numero valor={i.encargosPct} sufixo="%" max={1000} disabled={!podeEditar} onChange={(v) => setItem('estrutura', i.id, { encargosPct: v })} ariaLabel="Acréscimo/encargos" /></Celula>
              <Celula rotulo="Pró-labore do dono">
                <label className="vh-check"><input type="checkbox" checked={i.proLabore} disabled={!podeEditar}
                  onChange={(e) => trocarProLabore(i, e.target.checked)} /> <span>Pró-labore</span></label>
              </Celula>
              <Celula rotulo="Total"><span className="vh-calc">{fmtMoeda(i.total)}</span>
                {i.fora && <span className="vh-fora-nota">fora do cálculo: o dono está na equipe</span>}</Celula>
              <span className="vh-cel-acao">{podeEditar && <button className="vh-icone-btn vh-icone-perigo" aria-label="Remover custo" title="Remover" onClick={() => removerItem('estrutura', i.id)}><IconTrash /></button>}</span>
            </div>
          ))}
          {podeEditar && <button className="vh-add" onClick={() => atualizar(d => ({ ...d, estrutura: [...d.estrutura, normalizarItemEstrutura({ tipo: 'estrutura' })] }))}><IconPlus /> Adicionar custo</button>}
          <div className="vh-total-linha"><span>Total da estrutura no cálculo</span><strong>{fmtMoeda(calc.totalEstrutura)}</strong></div>
        </div>
      </section>

      {/* ── 2. horas e ocupação ── */}
      <section className="vh-secao">
        <div className="vh-secao-head"><h2 className="vh-secao-titulo">Funcionamento e dono</h2></div>
        <div className="vh-campos">
          <label className="vh-campo">
            <span className="modal-label">Horas de funcionamento por mês</span>
            <Numero valor={dados.horasFuncionamento} sufixo="h" max={744} disabled={!podeEditar} onChange={(v) => setCampo({ horasFuncionamento: v })} />
            <span className="vh-hint">Horas em que o escritório fica aberto no mês.</span>
          </label>
          <label className="vh-campo">
            <span className="modal-label">Ocupação esperada</span>
            <Numero valor={dados.ocupacaoPct} sufixo="%" max={100} disabled={!podeEditar} onChange={(v) => setCampo({ ocupacaoPct: v })} />
            <span className="vh-hint">Parte das horas produtivas que você espera vender. Usada no simulador.</span>
          </label>
          <div className="vh-campo">
            <span className="modal-label">Dono produz?</span>
            <div className="vh-sim-nao" role="group" aria-label="Dono produz?">
              <button className={!dados.donoProduz ? 'on' : ''} aria-pressed={!dados.donoProduz} disabled={!podeEditar} onClick={() => setDonoProduz(false)}>Não</button>
              <button className={dados.donoProduz ? 'on' : ''} aria-pressed={dados.donoProduz} disabled={!podeEditar} onClick={() => setDonoProduz(true)}>Sim</button>
            </div>
            <span className="vh-hint">{dados.donoProduz
              ? 'O dono entra na equipe produtiva (custo = pró-labore) e o pró-labore sai da estrutura em todos os métodos.'
              : 'O pró-labore fica na estrutura e o dono não entra na equipe produtiva.'}</span>
          </div>
        </div>
      </section>

      {/* ── 3. equipe ── */}
      <section className="vh-secao">
        <div className="vh-secao-head">
          <h2 className="vh-secao-titulo">Equipe produtiva</h2>
          <p className="vh-secao-sub">Quem produz projeto. O % produtivo é a parte das horas que vira projeto; use “Estimar” para calcular a partir das horas fora de projeto.</p>
        </div>
        <div className="vh-equipe">
          {calc.pessoas.map(p => (
            <LinhaPessoa key={p.id} p={p} podeEditar={podeEditar}
              onChange={(patch) => setItem('equipe', p.id, patch)}
              onFuncao={(f) => trocarFuncao(p, f)}
              onRemover={() => removerItem('equipe', p.id)} />
          ))}
          {podeEditar && <button className="vh-add" onClick={() => atualizar(d => ({ ...d, equipe: [...d.equipe, normalizarPessoa({ funcao: 'arquiteto' })] }))}><IconPlus /> Adicionar pessoa</button>}
          <div className="vh-total-linha">
            <span>Equipe com encargos · horas produtivas</span>
            <strong>{fmtMoeda(calc.custoEquipe)} · {fmtNum(calc.horasProdutivas)} h/mês</strong>
          </div>
        </div>
      </section>

      {(calc.avisos.length > 0 || calc.pendencias.length > 0) && (
        <div className="vh-alertas" role="status">
          {calc.avisos.map((a, n) => <p key={`a${n}`} className={`vh-alerta${a.tipo === 'duplicado' ? ' vh-alerta-forte' : ''}`}><IconAlert aria-hidden="true" /> {a.texto}</p>)}
          {calc.pendencias.map((t, n) => <p key={`p${n}`} className="vh-alerta vh-alerta-pendencia"><IconAlert aria-hidden="true" /> {t}</p>)}
        </div>
      )}

      {/* ── 4. métodos ── */}
      <section className="vh-secao">
        <div className="vh-secao-head">
          <h2 className="vh-secao-titulo">Métodos de cálculo</h2>
          <p className="vh-secao-sub">Quatro formas de chegar ao valor-hora de custo. Nenhuma é a única certa: leia as ressalvas e escolha com consciência.</p>
        </div>
        <div className="vh-metodos">
          {['m1', 'm2', 'm3', 'm4'].map(m => <CardMetodo key={m} metodo={calc.metodos[m]} calc={calc} donoProduz={dados.donoProduz} />)}
        </div>
      </section>

      {/* ── 5. simulador ── */}
      <Simulador calc={calc} ocupacaoPct={dados.ocupacaoPct} podeEditar={podeEditar} onOcupacao={(v) => setCampo({ ocupacaoPct: v })} />

      {savedAt && <div className="vh-autosave-toast">✓ Atualizações salvas <span>{fmtHora(savedAt)}</span></div>}
    </PageContainer>
  )
}

// ── peças ──
function Celula({ rotulo, children }) {
  return <span className="vh-cel" role="cell"><span className="vh-cel-rotulo" aria-hidden="true">{rotulo}</span>{children}</span>
}

function Numero({ valor, onChange, prefixo, sufixo, max = 1e9, disabled, ariaLabel, step = 'any' }) {
  return (
    <span className={`vh-numero${disabled ? ' disabled' : ''}`}>
      {prefixo && <span className="vh-numero-afixo">{prefixo}</span>}
      <input type="number" inputMode="decimal" min={0} max={max} step={step} aria-label={ariaLabel} disabled={disabled}
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

function LinhaPessoa({ p, podeEditar, onChange, onFuncao, onRemover }) {
  const [estimarAberto, setEstimarAberto] = useState(false)
  const estimado = produtivoEstimado(p)
  const semana = horasSemanais(p)
  const fora = totalForaProjeto(p)
  const pctMostrado = p.produtivoModo === 'estimado'
    ? (estimado == null ? null : Math.round(estimado * 1000) / 10)
    : p.produtivoPct

  function abrirEstimar() {
    const vazio = CATEGORIAS_FORA.every(c => p.foraProjeto[c.key] == null)
    if (vazio && podeEditar && semana > 0) onChange({ foraProjeto: foraProjetoSugerido(p) })
    setEstimarAberto(v => !v)
  }

  return (
    <div className="vh-pessoa">
      <div className="vh-pessoa-grade">
        <label className="vh-campo vh-campo-nome"><span className="modal-label">Nome/função</span>
          <input className="vh-input" value={p.nome} maxLength={80} placeholder="Ex.: Arquiteta Ana" disabled={!podeEditar}
            onChange={(e) => onChange({ nome: e.target.value })} /></label>
        <div className="vh-campo"><span className="modal-label">Função</span>
          <Select value={p.funcao} options={FUNCOES} ariaLabel="Função" disabled={!podeEditar} onChange={onFuncao} className="vh-select" /></div>
        <label className="vh-campo"><span className="modal-label">Custo mensal</span>
          <Numero valor={p.custo} prefixo="R$" disabled={!podeEditar} onChange={(v) => onChange({ custo: v })} /></label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Encargos</span>
          <Numero valor={p.encargosPct} sufixo="%" max={1000} disabled={!podeEditar} onChange={(v) => onChange({ encargosPct: v })} /></label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Horas/dia</span>
          <Numero valor={p.horasDia} sufixo="h" max={24} disabled={!podeEditar} onChange={(v) => onChange({ horasDia: v })} /></label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Dias/semana</span>
          <Numero valor={p.diasSemana} max={7} disabled={!podeEditar} onChange={(v) => onChange({ diasSemana: v })} /></label>
        <label className="vh-campo vh-campo-curto"><span className="modal-label">Semanas/mês</span>
          <Numero valor={p.semanasMes} max={5} disabled={!podeEditar} onChange={(v) => onChange({ semanasMes: v })} /></label>
        <div className="vh-campo vh-campo-curto"><span className="modal-label">% produtivo</span>
          <Numero valor={pctMostrado} sufixo="%" max={100} disabled={!podeEditar} ariaLabel="% produtivo"
            onChange={(v) => onChange({ produtivoPct: v, produtivoModo: 'digitado' })} />
          <button className={`vh-estimar-btn${estimarAberto ? ' on' : ''}`} onClick={abrirEstimar} aria-expanded={estimarAberto}>
            {p.produtivoModo === 'estimado' ? 'Estimado · ver' : 'Estimar'}
          </button>
        </div>
        <div className="vh-pessoa-resumo">
          <span>{fmtNum(p.horasProdutivas)} h produtivas/mês</span>
          <span>{fmtMoeda(p.custoComEncargos)} com encargos</span>
        </div>
        {podeEditar && <button className="vh-icone-btn vh-icone-perigo vh-pessoa-remover" aria-label={`Remover ${p.nome || 'pessoa'}`} title="Remover" onClick={onRemover}><IconTrash /></button>}
      </div>

      {estimarAberto && (
        <div className="vh-estimar">
          <p className="vh-estimar-titulo">Estimativa do % produtivo <span className="vh-tag-estimativa">estimativa editável</span></p>
          <p className="vh-hint">Informe quantas horas por semana {p.nome || 'esta pessoa'} passa fora de projeto. Os valores iniciais são sugestões pela função.</p>
          {semana > 0 ? (
            <>
              <div className="vh-estimar-grade">
                {CATEGORIAS_FORA.map(c => (
                  <label className="vh-campo" key={c.key}><span className="vh-estimar-rotulo">{c.label}</span>
                    <Numero valor={p.foraProjeto[c.key]} sufixo="h/sem" max={168} disabled={!podeEditar}
                      onChange={(v) => onChange({ foraProjeto: { ...p.foraProjeto, [c.key]: v } })} /></label>
                ))}
              </div>
              <p className="vh-estimar-conta">
                1 − {fmtNum(fora)} h fora de projeto ÷ {fmtNum(semana)} h semanais = <strong>{fmtPct(estimado)}</strong> produtivo
              </p>
              {podeEditar && (
                <div className="vh-estimar-acoes">
                  <button className="btn-confirm" onClick={() => { onChange({ produtivoModo: 'estimado' }); setEstimarAberto(false) }}>Usar esta estimativa</button>
                  <button className="btn-cancel" onClick={() => onChange({ foraProjeto: foraProjetoSugerido(p) })}>Voltar às sugestões da função</button>
                  {p.produtivoModo === 'estimado' && (
                    <button className="btn-cancel" onClick={() => onChange({ produtivoModo: 'digitado', produtivoPct: estimado == null ? null : Math.round(estimado * 1000) / 10 })}>Digitar o % direto</button>
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

// textos dos métodos (selo, nota e ressalvas)
function infoMetodo(id, calc, donoProduz) {
  const x = calc.ocupacaoEmbutida != null ? fmtPct(calc.ocupacaoEmbutida, 0) : null
  switch (id) {
    case 'm1': return {
      titulo: 'Funcionamento + produtiva',
      selo: { texto: 'Indicado na planilha Prolu', tom: 'ok' },
      nota: x ? `Este método embute uma ocupação de ${x} na estrutura.` : null,
      ressalvas: `Soma a estrutura por hora de funcionamento ao custo da equipe por hora produtiva. Como a equipe tem mais horas produtivas do que o escritório tem de funcionamento, a estrutura é cobrada acima do custo real; é como supor uma ocupação de ${x || 'menos de 100%'} sem avisar. Pode servir de colchão para horas ociosas, mas deve ser uma escolha consciente. O preço pode ficar pouco competitivo.`,
    }
    case 'm2': return {
      titulo: 'Por setor/pessoa',
      selo: donoProduz
        ? { texto: 'Não recomendado', tom: 'alerta', motivo: 'O dono conta como equipe produtiva: o custo por pessoa fica distorcido e é fácil duplicar o pró-labore.' }
        : { texto: 'Recomendado se o dono não conta como equipe produtiva', tom: 'info' },
      nota: calc.fator != null ? `Fator ${fmtNum(calc.fator, 4)} (${fmtNum(calc.pessoasEquivalentes)} pessoas produtivas equivalentes) · hora de funcionamento rateada ${fmtMoeda(calc.horaRateada)}.` : null,
      ressalvas: 'Cada tarefa usa a hora de quem executa. Em equipe pequena, se a pessoa mais barata falta e outra assume, o custo real sobe e o preço fixado não muda. O custo por hora sai de salário ÷ horas e pode inverter a hierarquia (estagiário parecer mais caro que arquiteto). Contar o dono como produtivo e manter o pró-labore na estrutura duplica custo.',
    }
    case 'm3': return {
      titulo: 'Tudo ÷ horas de funcionamento',
      selo: { texto: 'Não recomendado', tom: 'alerta' },
      nota: x ? `Equivale a supor ocupação de ${x}.` : null,
      ressalvas: 'É o método que mais eleva o valor-hora. Supõe uma ocupação baixa sem avisar e tende a deixar o preço pouco competitivo.',
    }
    default: return {
      titulo: 'Tudo ÷ horas produtivas',
      selo: { texto: 'Bom método, exige agenda cheia', tom: 'info' },
      nota: 'Ponto de equilíbrio com 100% de ocupação.',
      ressalvas: 'É o ponto de equilíbrio com 100% de ocupação: exige agenda lotada, e cada hora produtiva não vendida vira prejuízo. Margem apertada; use o simulador de ocupação. Parcelamento do projeto não muda o valor-hora, mas aperta o caixa, porque a hora é gasta antes de o dinheiro entrar.',
    }
  }
}

function CardMetodo({ metodo, calc, donoProduz }) {
  const [aberto, setAberto] = useState(null) // 'ressalvas' | 'calculo'
  const info = infoMetodo(metodo.id, calc, donoProduz)
  const numero = { m1: 'M1', m2: 'M2', m3: 'M3', m4: 'M4' }[metodo.id]
  const alternar = (q) => setAberto(a => (a === q ? null : q))
  return (
    <article className="vh-metodo">
      <div className="vh-metodo-topo">
        <span className="vh-metodo-num">{numero}</span>
        <span className={`vh-selo vh-selo-${info.selo.tom}`}>{info.selo.texto}</span>
      </div>
      <h3 className="vh-metodo-titulo">{info.titulo}</h3>
      {info.selo.motivo && <p className="vh-selo-motivo">{info.selo.motivo}</p>}

      {metodo.motivo ? (
        <p className="vh-metodo-falta">{metodo.motivo}</p>
      ) : metodo.id === 'm2' ? (
        <ul className="vh-metodo-pessoas">
          {metodo.pessoas.length === 0 && <li className="vh-hint">Nenhuma pessoa na equipe.</li>}
          {metodo.pessoas.map(p => (
            <li key={p.id}>
              <span>{p.nome || funcaoInfo(p.funcao).label}</span>
              <strong>{p.valor == null ? <span className="vh-hint">{p.motivo}</span> : <>{fmtMoeda(p.valor)}<small>/h</small></>}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vh-metodo-valor">{fmtMoeda(metodo.valor)}<small>/h</small></p>
      )}
      {!metodo.motivo && info.nota && <p className="vh-metodo-nota">{info.nota}</p>}

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
      {aberto === 'ressalvas' && <p className="vh-metodo-ressalvas">{info.ressalvas}</p>}
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

const OPCOES_METODO = [
  { value: 'm1', label: 'M1 · Funcionamento + produtiva' },
  { value: 'm2', label: 'M2 · Por setor/pessoa' },
  { value: 'm3', label: 'M3 · Tudo ÷ horas de funcionamento' },
  { value: 'm4', label: 'M4 · Tudo ÷ horas produtivas' },
]

function Simulador({ calc, ocupacaoPct, podeEditar, onOcupacao }) {
  const [metodoId, setMetodoId] = useState('m4')
  const metodo = calc.metodos[metodoId]
  // M2 tem um valor por pessoa: uma coluna para cada
  const colunas = metodoId === 'm2'
    ? metodo.pessoas.map(p => ({ id: p.id, rotulo: p.nome || funcaoInfo(p.funcao).label, valor: p.valor }))
    : [{ id: 'v', rotulo: 'Custo por hora vendida', valor: metodo.valor }]
  const linhas = OCUPACOES_SIMULADOR.map(o => ({ o, fixa: true }))
  const x = calc.ocupacaoEmbutida != null ? fmtPct(calc.ocupacaoEmbutida, 0) : null

  return (
    <section className="vh-secao">
      <div className="vh-secao-head">
        <h2 className="vh-secao-titulo">Simulador de ocupação</h2>
        <p className="vh-secao-sub">O valor-hora de equilíbrio supõe que todas as horas produtivas são vendidas. Se vender menos, o custo por hora vendida sobe.</p>
      </div>
      <div className="vh-sim card">
        <div className="vh-sim-topo">
          <span className="modal-label">Método</span>
          <Select value={metodoId} options={OPCOES_METODO} onChange={setMetodoId} ariaLabel="Método do simulador" className="vh-select vh-sim-select" />
        </div>
        {(metodoId === 'm1' || metodoId === 'm3') && (
          <p className="vh-sim-lembrete"><IconAlert aria-hidden="true" /> Este método já embute uma ocupação{x ? ` de ${x}` : ''}{metodoId === 'm1' ? ' na estrutura' : ''}. Reduzir a ocupação aqui conta a ociosidade de novo.</p>
        )}
        {metodo.motivo ? <p className="vh-metodo-falta">{metodo.motivo}</p> : colunas.length === 0 ? <p className="vh-hint">Nenhuma pessoa na equipe.</p> : (
          <div className="vh-sim-tabela-wrap">
            <table className="vh-sim-tabela">
              <thead>
                <tr><th>Ocupação</th>{colunas.map(c => <th key={c.id}>{c.rotulo}</th>)}</tr>
              </thead>
              <tbody>
                {linhas.map(({ o }) => (
                  <tr key={o}>
                    <td>{o}%</td>
                    {colunas.map(c => <td key={c.id}>{fmtMoeda(custoPorHoraVendida(c.valor, o))}</td>)}
                  </tr>
                ))}
                <tr className="vh-sim-editavel">
                  <td>
                    <Numero valor={ocupacaoPct} sufixo="%" max={100} disabled={!podeEditar} onChange={onOcupacao} ariaLabel="Ocupação esperada" />
                  </td>
                  {colunas.map(c => <td key={c.id}>{ocupacaoPct > 0 ? fmtMoeda(custoPorHoraVendida(c.valor, ocupacaoPct)) : <span className="vh-hint">Informe a ocupação</span>}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
