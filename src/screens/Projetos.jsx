import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady, fetchAllRows } from '../services/supabaseClient.js'
import { useSomenteLeitura } from '../components/BloqueioPlano.jsx'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import Select from '../components/Select.jsx'
import { DatePicker } from '../components/DatePicker.jsx'
import { IconPlus, IconSearch, IconClose, IconAlert } from '../components/Icons.jsx'
import {
  SITUACOES, permissoesProjeto, resumoItens, filtrarProjetos, rotuloCliente, fmtData, hojeSP,
  parseValorBR, parseTags,
} from '../utils/projetos.js'
import '../components/estilosCompartilhados.css'
import './Projetos.css'

// Gestão de Projetos — lista (migration_063). Nada de R$ aqui: o financeiro
// só aparece no detalhe e só para o master. Master e gestor criam projeto.
// Gestor/comum não recebem projetos arquivados do servidor.

export const SELECT_PROJETO =
  'id, nome, nome_oficial, cliente_id, cliente_nome, cidade, tags, origem, situacao, data_inicio, prazo_final, created_at, clientes(nome)'

// Mensagem de erro do servidor: os gatilhos da 063 já falam português
export function msgErro(error, padrao) {
  if (!error) return padrao
  if (error.code === '23505') return 'Já existe um projeto com esse nome oficial no escritório.'
  if (['42501', '23514', '23503', 'P0001'].includes(error.code) && error.message && !/policy|violates/i.test(error.message)) return error.message
  if (error.code === '42501') return 'Você não tem permissão para essa ação.'
  return padrao
}

export function PillSituacao({ situacao }) {
  const s = SITUACOES[situacao] || SITUACOES.ativo
  return <span className={`pill pill-${s.cor}`}><span className="dot" />{s.rotulo}</span>
}

export default function Projetos() {
  const { user, activeEmpresaId, impersonatedEmpresaId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const somenteLeitura = useSomenteLeitura()
  const perm = permissoesProjeto({ papel: user?.role, somenteLeitura, outroEscritorio: !!impersonatedEmpresaId })

  const [projetos, setProjetos] = useState([])
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [situacao, setSituacao] = useState('abertos')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)

  useEffect(() => { carregar() }, [activeEmpresaId])

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setCarregando(false); return }
    setCarregando(true)
    const [p, i] = await Promise.all([
      fetchAllRows(() => supabase.from('projetos').select(SELECT_PROJETO).eq('empresa_id', activeEmpresaId).order('created_at', { ascending: false }).order('id')),
      fetchAllRows(() => supabase.from('projeto_itens').select('id, projeto_id, status, prazo').eq('empresa_id', activeEmpresaId).order('id')),
    ])
    if (p.error || i.error) toast('Erro ao carregar projetos')
    setProjetos(p.data || [])
    setItens(i.data || [])
    setCarregando(false)
  }

  const hoje = hojeSP()
  const resumos = useMemo(() => {
    const porProjeto = new Map()
    for (const it of itens) {
      if (!porProjeto.has(it.projeto_id)) porProjeto.set(it.projeto_id, [])
      porProjeto.get(it.projeto_id).push(it)
    }
    return new Map(projetos.map(p => [p.id, resumoItens(porProjeto.get(p.id), hoje)]))
  }, [projetos, itens, hoje])

  const filtrados = filtrarProjetos(projetos, { situacao, busca })

  const opcoesSituacao = [
    { value: 'abertos', label: perm.verArquivados ? 'Todos menos arquivados' : 'Todos' },
    { value: 'ativo', label: 'Ativos' },
    { value: 'pausado', label: 'Pausados' },
    { value: 'concluido', label: 'Concluídos' },
    ...(perm.verArquivados ? [{ value: 'arquivado', label: 'Arquivados' }] : []),
  ]

  return (
    <PageContainer className="pj-pagina">
      <PageHeader
        titulo="Projetos"
        descricao="Etapas, tarefas, prazos e responsáveis de cada projeto do escritório."
        acoes={perm.criarProjeto && (
          <button className="btn-primary" onClick={() => setNovo(true)}>
            <IconPlus /> Novo projeto
          </button>
        )}
      />

      <div className="pj-toolbar">
        <div className="pj-busca">
          <IconSearch className="pj-busca-icone" />
          <input
            className="pj-busca-input"
            placeholder="Buscar por nome, cliente, cidade ou tag…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar projetos"
          />
          {busca && (
            <button className="pj-busca-limpar" onClick={() => setBusca('')} aria-label="Limpar busca"><IconClose /></button>
          )}
        </div>
        <div className="pj-filtro">
          <Select value={situacao} onChange={setSituacao} options={opcoesSituacao} ariaLabel="Filtrar por situação" />
        </div>
      </div>

      {carregando ? (
        <p className="pj-vazio">Carregando…</p>
      ) : projetos.length === 0 ? (
        <div className="pj-vazio">
          <p className="pj-vazio-titulo">Nenhum projeto ainda.</p>
          <p>{perm.criarProjeto
            ? 'Crie o primeiro projeto para organizar etapas, tarefas e prazos da equipe.'
            : 'Quando o escritório criar um projeto, ele aparece aqui.'}</p>
          {perm.criarProjeto && (
            <button className="btn-primary pj-vazio-acao" onClick={() => setNovo(true)}><IconPlus /> Novo projeto</button>
          )}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="pj-vazio">
          <p className="pj-vazio-titulo">Nenhum projeto encontrado.</p>
          <p>Troque o filtro de situação ou a busca.</p>
        </div>
      ) : (
        <ul className="pj-lista">
          {filtrados.map(p => {
            const r = resumos.get(p.id) || { total: 0, pct: 0, atrasados: 0 }
            const cliente = rotuloCliente(p)
            const prazoVencido = p.prazo_final && p.prazo_final < hoje && !['concluido', 'arquivado'].includes(p.situacao)
            return (
              <li key={p.id}>
                <Link to={`/projetos/${p.id}`} className="pj-card">
                  <div className="pj-card-topo">
                    <div className="pj-card-nomes">
                      <span className="pj-card-nome">{p.nome}</span>
                      {cliente && <span className="pj-card-cliente">{cliente}</span>}
                    </div>
                    <PillSituacao situacao={p.situacao} />
                  </div>

                  <div className="pj-progresso" aria-label={`${r.pct}% concluído`}>
                    <div className="pj-progresso-barra"><span style={{ width: `${r.pct}%` }} /></div>
                    <span className="pj-progresso-num">{r.total ? `${r.pct}%` : 'Sem itens'}</span>
                  </div>

                  <div className="pj-card-rodape">
                    <span className={prazoVencido ? 'pj-prazo-vencido' : ''}>
                      {p.prazo_final ? `Prazo ${fmtData(p.prazo_final)}` : 'Sem prazo final'}
                    </span>
                    {r.atrasados > 0 && (
                      <span className="pj-chip-atrasado"><IconAlert /> {r.atrasados} {r.atrasados === 1 ? 'atrasado' : 'atrasados'}</span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {novo && (
        <NovoProjetoModal
          empresaId={activeEmpresaId}
          comValor={perm.editarFinanceiro}
          onClose={() => setNovo(false)}
          onCriado={(id) => { setNovo(false); navigate(`/projetos/${id}`) }}
        />
      )}
    </PageContainer>
  )
}

// ── Formulário do projeto (novo e edição) ──

const CLIENTE_DIGITADO = '__digitado'

export function useClientes(empresaId) {
  const [clientes, setClientes] = useState([])
  useEffect(() => {
    if (!supabaseReady || !empresaId) return
    let ativo = true
    fetchAllRows(() => supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).order('nome').order('id'))
      .then(({ data }) => { if (ativo) setClientes(data || []) })
    return () => { ativo = false }
  }, [empresaId])
  return clientes
}

// Data com "Limpar" (o DatePicker não tem botão de limpar)
export function CampoData({ rotulo, value, onChange, min, max, disabled }) {
  return (
    <div className="modal-field">
      <div className="pj-label-linha">
        <label className="modal-label">{rotulo}</label>
        {value && !disabled && <button type="button" className="pj-link" onClick={() => onChange(null)}>Limpar</button>}
      </div>
      <DatePicker value={value || ''} onChange={(v) => onChange(v || null)} min={min || undefined} max={max || undefined} disabled={disabled} className="pj-data" />
    </div>
  )
}

// Campos compartilhados: nome, cliente, cidade, tags e datas
export function CamposProjeto({ form, setForm, clientes, nomeRef }) {
  const set = (campo) => (v) => setForm(f => ({ ...f, [campo]: v }))
  const opcoesCliente = [
    { value: '', label: 'Sem cliente' },
    { value: CLIENTE_DIGITADO, label: 'Digitar o nome…' },
    ...clientes.map(c => ({ value: c.id, label: c.nome })),
  ]
  return (
    <>
      <div className="modal-field">
        <label className="modal-label" htmlFor="pj-nome">Nome *</label>
        <input id="pj-nome" ref={nomeRef} className="modal-input" maxLength={200} value={form.nome}
          onChange={(e) => set('nome')(e.target.value)} placeholder="Ex.: Casa Jardim Botânico" />
      </div>
      <div className="modal-field">
        <label className="modal-label">Cliente</label>
        <Select value={form.clienteEscolha} onChange={set('clienteEscolha')} options={opcoesCliente} ariaLabel="Cliente" />
        {form.clienteEscolha === CLIENTE_DIGITADO && (
          <input className="modal-input pj-campo-extra" maxLength={200} value={form.clienteNome}
            onChange={(e) => set('clienteNome')(e.target.value)} placeholder="Nome do cliente" aria-label="Nome do cliente" />
        )}
      </div>
      <div className="pj-campos-2">
        <div className="modal-field">
          <label className="modal-label" htmlFor="pj-cidade">Cidade</label>
          <input id="pj-cidade" className="modal-input" maxLength={120} value={form.cidade}
            onChange={(e) => set('cidade')(e.target.value)} />
        </div>
        <div className="modal-field">
          <label className="modal-label" htmlFor="pj-tags">Tags</label>
          <input id="pj-tags" className="modal-input" value={form.tags}
            onChange={(e) => set('tags')(e.target.value)} placeholder="Separe por vírgula" />
        </div>
      </div>
      <div className="pj-campos-2">
        <CampoData rotulo="Início" value={form.dataInicio} onChange={set('dataInicio')} max={form.prazoFinal} />
        <CampoData rotulo="Prazo final" value={form.prazoFinal} onChange={set('prazoFinal')} min={form.dataInicio} />
      </div>
    </>
  )
}

export function formDoProjeto(p) {
  return {
    nome: p?.nome || '',
    clienteEscolha: p?.cliente_id || (p?.cliente_nome ? CLIENTE_DIGITADO : ''),
    clienteNome: p?.cliente_nome || '',
    cidade: p?.cidade || '',
    tags: (p?.tags || []).join(', '),
    dataInicio: p?.data_inicio || null,
    prazoFinal: p?.prazo_final || null,
  }
}

// Linha para o banco; devolve { erro } se algo estiver inválido
export function linhaDoForm(form) {
  const nome = form.nome.trim()
  if (!nome) return { erro: 'Informe o nome do projeto.' }
  if (form.dataInicio && form.prazoFinal && form.prazoFinal < form.dataInicio) return { erro: 'O prazo final não pode ser antes do início.' }
  const tags = parseTags(form.tags)
  if (tags.length > 20) return { erro: 'Use no máximo 20 tags.' }
  const digitado = form.clienteEscolha === CLIENTE_DIGITADO
  return {
    linha: {
      nome,
      cliente_id: !digitado && form.clienteEscolha ? form.clienteEscolha : null,
      cliente_nome: digitado ? form.clienteNome.trim() || null : null,
      cidade: form.cidade.trim() || null,
      tags,
      data_inicio: form.dataInicio,
      prazo_final: form.prazoFinal,
    },
  }
}

// Master e gestor criam; o valor fechado (projeto_financeiro) só o master
function NovoProjetoModal({ empresaId, comValor, onClose, onCriado }) {
  const toast = useToast()
  const clientes = useClientes(empresaId)
  const [form, setForm] = useState(() => ({ ...formDoProjeto(null), valor: '' }))
  const [salvando, setSalvando] = useState(false)
  const nomeRef = useRef(null)

  useEffect(() => { setTimeout(() => nomeRef.current?.focus(), 60) }, [])
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !salvando) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, salvando])

  async function salvar() {
    const { linha, erro } = linhaDoForm(form)
    if (erro) { toast(erro); return }
    const valor = comValor ? parseValorBR(form.valor) : null
    if (Number.isNaN(valor) || valor < 0) { toast('Valor fechado inválido.'); return }

    setSalvando(true)
    const { data, error } = await supabase
      .from('projetos')
      .insert({ ...linha, empresa_id: empresaId, origem: 'avulso' })
      .select('id')
      .single()
    if (error) { setSalvando(false); toast(msgErro(error, 'Não foi possível criar o projeto')); return }

    if (valor != null) {
      const { error: erroFin } = await supabase.from('projeto_financeiro').insert({ projeto_id: data.id, valor_fechado: valor })
      if (erroFin) toast('Projeto criado, mas o valor fechado não foi salvo')
    }
    toast('Projeto criado')
    onCriado(data.id)
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose() }}>
      <div className="modal pj-modal" role="dialog" aria-modal="true" aria-labelledby="pj-novo-titulo">
        <div className="modal-title" id="pj-novo-titulo">Novo projeto</div>
        <CamposProjeto form={form} setForm={setForm} clientes={clientes} nomeRef={nomeRef} />
        {comValor && (
          <div className="modal-field">
            <label className="modal-label" htmlFor="pj-valor">Valor fechado (opcional)</label>
            <input id="pj-valor" className="modal-input" inputMode="decimal" value={form.valor}
              onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="R$ 0,00" />
            <div className="pj-dica">Só o master vê esse valor.</div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="btn-confirm" onClick={salvar} disabled={salvando}>{salvando ? 'Criando…' : 'Criar projeto'}</button>
        </div>
      </div>
    </div>
  )
}
