import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { useSomenteLeitura } from '../components/BloqueioPlano.jsx'
import { PageContainer } from '../components/PageHeader.jsx'
import Select from '../components/Select.jsx'
import { SelectDropdown } from '../components/SelectDropdown.jsx'
import SeletorPessoa, { useEquipe, nomePessoa } from '../components/SeletorPessoa.jsx'
import { IconBack, IconPlus, IconEdit, IconTrash, IconClose, IconAlert, IconCheck, IconChevronDown, IconChevronRight } from '../components/Icons.jsx'
import {
  SITUACOES, STATUS_ITEM, NIVEL_ROTULO, permissoesProjeto, permissoesItem, resumoItens, montarArvore,
  idsDaSubarvore, itemAtrasado, passaDoPrazo, proximaOrdem, moverItem, rotuloCliente, fmtData, hojeSP,
  parseValorBR, fmtValorBR,
} from '../utils/projetos.js'
import {
  SELECT_PROJETO, msgErro, PillSituacao, CamposProjeto, CampoData, formDoProjeto, linhaDoForm, useClientes,
} from './Projetos.jsx'
import '../components/estilosCompartilhados.css'
import './Projetos.css'

// Gestão de Projetos — detalhe (migration_063). Toda gravação também é
// conferida no servidor; aqui as ações que o papel não pode fazer somem.

const SELECT_ITEM = 'id, projeto_id, parent_id, nivel, nome, ordem, data_inicio, prazo, responsavel_id, status, concluido_em, horas_estimadas, created_at'
const SELECT_FIN = 'projeto_id, valor_fechado, data_fechamento, valor_hora_ref, margem_pct, nf_pct, nf_ativo'

export default function ProjetoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, activeEmpresaId, impersonatedEmpresaId } = useAuth()
  const toast = useToast()
  const somenteLeitura = useSomenteLeitura()
  const { pessoas } = useEquipe(activeEmpresaId)

  const [projeto, setProjeto] = useState(null)
  const [itens, setItens] = useState([])
  const [fin, setFin] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [abertoId, setAbertoId] = useState(null)       // item no drawer
  const [recolhidos, setRecolhidos] = useState(() => new Set())
  const [novoEm, setNovoEm] = useState(null)           // 'raiz' | id do pai
  const [editando, setEditando] = useState(false)
  const [editandoFin, setEditandoFin] = useState(false)

  const perm = permissoesProjeto({
    papel: user?.role,
    arquivado: projeto?.situacao === 'arquivado',
    somenteLeitura,
    outroEscritorio: !!impersonatedEmpresaId,
  })

  useEffect(() => { carregar() }, [id, activeEmpresaId])

  async function carregar() {
    if (!supabaseReady || !id) { setCarregando(false); return }
    setCarregando(true)
    const [p, i, f] = await Promise.all([
      supabase.from('projetos').select(SELECT_PROJETO).eq('id', id).maybeSingle(),
      supabase.from('projeto_itens').select(SELECT_ITEM).eq('projeto_id', id).order('ordem').order('created_at'),
      // gestor/comum não leem o financeiro (o servidor devolve vazio)
      permissoesProjeto({ papel: user?.role }).verFinanceiro
        ? supabase.from('projeto_financeiro').select(SELECT_FIN).eq('projeto_id', id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    if (p.error || i.error) toast('Erro ao carregar o projeto')
    setProjeto(p.data || null)
    setItens(i.data || [])
    setFin(f.data || null)
    setCarregando(false)
  }

  const hoje = hojeSP()
  const arvore = useMemo(() => montarArvore(itens), [itens])
  const resumo = useMemo(() => resumoItens(itens, hoje), [itens, hoje])
  const porId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens])
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas])

  // ── gravação dos itens (otimista; volta atrás se o servidor recusar) ──

  async function atualizarItem(itemId, campos) {
    const antes = porId.get(itemId)
    if (!antes) return
    setItens(lista => lista.map(i => (i.id === itemId ? { ...i, ...campos } : i)))
    const { data, error } = await supabase.from('projeto_itens').update(campos).eq('id', itemId).select(SELECT_ITEM).maybeSingle()
    if (error || !data) {
      setItens(lista => lista.map(i => (i.id === itemId ? antes : i)))
      toast(msgErro(error, 'Não foi possível salvar a alteração'))
      return
    }
    setItens(lista => lista.map(i => (i.id === itemId ? data : i)))
  }

  async function criarItem(parentId, nome) {
    const irmaos = itens.filter(i => (i.parent_id || null) === (parentId || null))
    const { data, error } = await supabase
      .from('projeto_itens')
      .insert({ projeto_id: id, parent_id: parentId || null, nome, ordem: proximaOrdem(irmaos) })
      .select(SELECT_ITEM)
      .single()
    if (error) { toast(msgErro(error, 'Não foi possível criar o item')); return false }
    setItens(lista => [...lista, data])
    if (parentId) setRecolhidos(s => { const n = new Set(s); n.delete(parentId); return n })
    return true
  }

  async function excluirItem(itemId) {
    const { data, error } = await supabase.from('projeto_itens').delete().eq('id', itemId).select('id')
    if (error || !data?.length) { toast(msgErro(error, 'Não foi possível excluir')); return }
    const saem = idsDaSubarvore(itens, itemId)
    setItens(lista => lista.filter(i => !saem.has(i.id)))
    setAbertoId(null)
    toast('Excluído')
  }

  async function mover(itemId, direcao) {
    const item = porId.get(itemId)
    const irmaos = itens.filter(i => (i.parent_id || null) === (item.parent_id || null))
    const mudancas = moverItem(irmaos, itemId, direcao)
    if (!mudancas.length) return
    const antes = itens
    const nova = new Map(mudancas.map(m => [m.id, m.ordem]))
    setItens(lista => lista.map(i => (nova.has(i.id) ? { ...i, ordem: nova.get(i.id) } : i)))
    const resultados = await Promise.all(mudancas.map(m =>
      supabase.from('projeto_itens').update({ ordem: m.ordem }).eq('id', m.id).select('id').maybeSingle()))
    const falha = resultados.find(r => r.error || !r.data)
    if (falha) { setItens(antes); toast(msgErro(falha.error, 'Não foi possível reordenar')) }
  }

  // ── telas de estado ──

  if (carregando) return <PageContainer className="pj-pagina"><p className="pj-vazio">Carregando…</p></PageContainer>

  if (!projeto) {
    return (
      <PageContainer className="pj-pagina">
        <Link to="/projetos" className="pj-voltar"><IconBack /> Projetos</Link>
        <div className="pj-vazio">
          <p className="pj-vazio-titulo">Projeto não encontrado.</p>
          <p>Ele pode ter sido excluído ou arquivado.</p>
        </div>
      </PageContainer>
    )
  }

  const cliente = rotuloCliente(projeto)
  const itemAberto = abertoId ? porId.get(abertoId) : null

  return (
    <PageContainer className="pj-pagina">
      <Link to="/projetos" className="pj-voltar"><IconBack /> Projetos</Link>

      {/* Cabeçalho */}
      <header className="pj-cab">
        <div className="pj-cab-topo">
          <div className="pj-cab-nomes">
            <h1 className="page-title pj-cab-titulo">{projeto.nome}</h1>
            {projeto.nome_oficial && <div className="pj-cab-oficial">{projeto.nome_oficial}</div>}
          </div>
          {perm.editarProjeto && (
            <button className="icon-btn" onClick={() => setEditando(true)} aria-label="Editar projeto"><IconEdit /></button>
          )}
        </div>
        <div className="pj-cab-meta">
          <PillSituacao situacao={projeto.situacao} />
          {cliente && <span>{cliente}</span>}
          {projeto.cidade && <span>{projeto.cidade}</span>}
          <span>
            {projeto.data_inicio || projeto.prazo_final
              ? `${projeto.data_inicio ? fmtData(projeto.data_inicio) : '—'} → ${projeto.prazo_final ? fmtData(projeto.prazo_final) : '—'}`
              : 'Sem datas'}
          </span>
        </div>
        {projeto.tags?.length > 0 && (
          <div className="pj-tags">{projeto.tags.map(t => <span key={t} className="pj-tag">{t}</span>)}</div>
        )}
        <div className="pj-progresso pj-cab-progresso" aria-label={`${resumo.pct}% concluído`}>
          <div className="pj-progresso-barra"><span style={{ width: `${resumo.pct}%` }} /></div>
          <span className="pj-progresso-num">
            {resumo.total ? `${resumo.pct}% · ${resumo.concluidos} de ${resumo.total}` : 'Sem itens'}
          </span>
          {resumo.atrasados > 0 && (
            <span className="pj-chip-atrasado"><IconAlert /> {resumo.atrasados} {resumo.atrasados === 1 ? 'atrasado' : 'atrasados'}</span>
          )}
        </div>
        {projeto.situacao === 'arquivado' && !perm.editarItem && (
          <p className="pj-aviso">Projeto arquivado: só leitura.</p>
        )}
      </header>

      {/* Financeiro: só master */}
      {perm.verFinanceiro && (
        <section className="pj-fin">
          <div className="pj-secao-topo">
            <h2 className="pj-secao-titulo">Financeiro</h2>
            {perm.editarFinanceiro && (
              <button className="icon-btn" onClick={() => setEditandoFin(true)} aria-label="Editar financeiro"><IconEdit /></button>
            )}
          </div>
          {fin && (fin.valor_fechado != null || fin.data_fechamento || fin.valor_hora_ref != null || fin.margem_pct != null || fin.nf_ativo) ? (
            <dl className="pj-fin-grade">
              <div><dt>Valor fechado</dt><dd>{fin.valor_fechado != null ? fmtValorBR(fin.valor_fechado) : '—'}</dd></div>
              <div><dt>Fechamento</dt><dd>{fin.data_fechamento ? fmtData(fin.data_fechamento) : '—'}</dd></div>
              <div><dt>Valor-hora ref.</dt><dd>{fin.valor_hora_ref != null ? fmtValorBR(fin.valor_hora_ref) : '—'}</dd></div>
              <div><dt>Margem</dt><dd>{fin.margem_pct != null ? `${Number(fin.margem_pct).toLocaleString('pt-BR')}%` : '—'}</dd></div>
              <div><dt>Nota fiscal</dt><dd>{fin.nf_ativo ? `${Number(fin.nf_pct || 0).toLocaleString('pt-BR')}%` : 'Sem NF'}</dd></div>
            </dl>
          ) : (
            <p className="pj-dica">Nenhum valor registrado. Só o master vê este bloco.</p>
          )}
        </section>
      )}

      {/* Árvore */}
      <section className="pj-arvore">
        <div className="pj-secao-topo">
          <h2 className="pj-secao-titulo">Etapas e tarefas</h2>
        </div>

        {arvore.length === 0 && novoEm !== 'raiz' && (
          <div className="pj-vazio pj-vazio-arvore">
            <p className="pj-vazio-titulo">Nenhuma etapa ainda.</p>
            <p>{perm.criarEtapa
              ? 'Comece pelas etapas do projeto (ex.: Estudo preliminar, Anteprojeto, Executivo) e depois as tarefas de cada uma.'
              : 'As etapas e tarefas do projeto aparecem aqui.'}</p>
          </div>
        )}

        <ul className="pj-nos" role="tree">
          {arvore.map(etapa => (
            <No
              key={etapa.id}
              no={etapa}
              prazoPai={projeto.prazo_final}
              rotuloPai="do projeto"
              perm={perm}
              hoje={hoje}
              pessoaPorId={pessoaPorId}
              recolhidos={recolhidos}
              alternar={(nid) => setRecolhidos(s => { const n = new Set(s); n.has(nid) ? n.delete(nid) : n.add(nid); return n })}
              abrir={setAbertoId}
              novoEm={novoEm}
              setNovoEm={setNovoEm}
              criarItem={criarItem}
              atualizarItem={atualizarItem}
            />
          ))}
        </ul>

        {perm.criarEtapa && (
          novoEm === 'raiz'
            ? <NovoItemInline nivel={1} onCancelar={() => setNovoEm(null)} onSalvar={(nome) => criarItem(null, nome)} />
            : <button className="pj-add pj-add-etapa" onClick={() => setNovoEm('raiz')}><IconPlus /> Nova etapa</button>
        )}
      </section>

      {itemAberto && (
        <ItemDrawer
          key={itemAberto.id}
          item={itemAberto}
          pai={itemAberto.parent_id ? porId.get(itemAberto.parent_id) : null}
          projeto={projeto}
          itens={itens}
          perm={perm}
          hoje={hoje}
          pessoas={pessoas}
          onClose={() => setAbertoId(null)}
          atualizar={(campos) => atualizarItem(itemAberto.id, campos)}
          mover={(direcao) => mover(itemAberto.id, direcao)}
          excluir={() => excluirItem(itemAberto.id)}
        />
      )}

      {editando && (
        <EditarProjetoModal
          projeto={projeto}
          perm={perm}
          empresaId={activeEmpresaId}
          onClose={() => setEditando(false)}
          onSalvo={(p) => { setProjeto(p); setEditando(false) }}
          onExcluido={() => navigate('/projetos')}
        />
      )}

      {editandoFin && (
        <FinanceiroModal
          projetoId={projeto.id}
          fin={fin}
          onClose={() => setEditandoFin(false)}
          onSalvo={(f) => { setFin(f); setEditandoFin(false) }}
        />
      )}
    </PageContainer>
  )
}

// ── Nó da árvore (etapa, tarefa ou subtarefa) ──

function No({ no, prazoPai, rotuloPai, perm, hoje, pessoaPorId, recolhidos, alternar, abrir, novoEm, setNovoEm, criarItem, atualizarItem }) {
  const pi = permissoesItem(perm, no.nivel)
  const temFilhos = no.filhos.length > 0
  const recolhido = recolhidos.has(no.id)
  const atrasado = itemAtrasado(no, hoje)
  const foraDoPrazo = passaDoPrazo(no, prazoPai)
  const resp = no.responsavel_id ? pessoaPorId.get(no.responsavel_id) : null
  const status = STATUS_ITEM[no.status] || STATUS_ITEM.a_fazer
  const concluido = no.status === 'concluido'
  const filhoRotulo = NIVEL_ROTULO[no.nivel + 1]

  return (
    <li className={`pj-no pj-nivel-${no.nivel}`} role="treeitem" aria-expanded={temFilhos ? !recolhido : undefined}>
      <div className={`pj-linha${concluido ? ' pj-linha-feita' : ''}`}>
        {no.nivel < 3 ? (
          <button
            className={`pj-seta${temFilhos ? '' : ' pj-seta-vazia'}`}
            onClick={() => temFilhos && alternar(no.id)}
            aria-label={recolhido ? 'Mostrar itens' : 'Esconder itens'}
            tabIndex={temFilhos ? 0 : -1}
          >
            {recolhido ? <IconChevronRight /> : <IconChevronDown />}
          </button>
        ) : <span className="pj-seta pj-seta-vazia" aria-hidden="true" />}

        <button
          className={`pj-check${concluido ? ' pj-check-on' : ''}`}
          disabled={!pi.editarCampos}
          onClick={() => atualizarItem(no.id, { status: concluido ? 'a_fazer' : 'concluido' })}
          aria-label={concluido ? 'Marcar como não concluído' : 'Marcar como concluído'}
          aria-pressed={concluido}
        >
          {concluido && <IconCheck />}
        </button>

        <button className="pj-linha-corpo" onClick={() => abrir(no.id)}>
          <span className="pj-linha-nome">
            {no.nivel === 1 && <span className="pj-nivel-rotulo">Etapa</span>}
            {no.nome}
          </span>
          <span className="pj-linha-meta">
            {no.status !== 'a_fazer' && !concluido && <span className={`pill pill-${status.cor}`}>{status.rotulo}</span>}
            {atrasado && <span className="pj-chip-atrasado"><IconAlert /> Atrasado</span>}
            {foraDoPrazo && <span className="pj-chip-aviso" title={`Passa do prazo ${rotuloPai}`}><IconAlert /> Passa do prazo {rotuloPai}</span>}
            {no.prazo && <span className="pj-linha-prazo">{fmtData(no.prazo)}</span>}
            <span className={resp ? 'pj-linha-resp' : 'pj-sem-resp'}>{resp ? nomePessoa(resp) : 'Sem responsável'}</span>
          </span>
        </button>
      </div>

      {!recolhido && (temFilhos || novoEm === no.id) && (
        <ul className="pj-nos" role="group">
          {no.filhos.map(f => (
            <No
              key={f.id}
              no={f}
              prazoPai={no.prazo}
              rotuloPai={no.nivel === 1 ? 'da etapa' : 'da tarefa'}
              perm={perm}
              hoje={hoje}
              pessoaPorId={pessoaPorId}
              recolhidos={recolhidos}
              alternar={alternar}
              abrir={abrir}
              novoEm={novoEm}
              setNovoEm={setNovoEm}
              criarItem={criarItem}
              atualizarItem={atualizarItem}
            />
          ))}
          {novoEm === no.id && (
            <li><NovoItemInline nivel={no.nivel + 1} onCancelar={() => setNovoEm(null)} onSalvar={(nome) => criarItem(no.id, nome)} /></li>
          )}
        </ul>
      )}

      {pi.criarFilho && novoEm !== no.id && !recolhido && (
        <button className={`pj-add pj-add-nivel-${no.nivel + 1}`} onClick={() => setNovoEm(no.id)}>
          <IconPlus /> {filhoRotulo}
        </button>
      )}
    </li>
  )
}

// Campo de nome que aparece no lugar do botão "+": Enter salva e abre o
// próximo, Esc cancela.
function NovoItemInline({ nivel, onSalvar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  async function salvar() {
    const n = nome.trim()
    if (!n) { onCancelar(); return }
    setSalvando(true)
    const ok = await onSalvar(n)
    setSalvando(false)
    if (ok) { setNome(''); ref.current?.focus() }
  }

  return (
    <div className={`pj-novo pj-add-nivel-${nivel}`}>
      <input
        ref={ref}
        className="modal-input"
        value={nome}
        maxLength={300}
        disabled={salvando}
        placeholder={`Nome da ${NIVEL_ROTULO[nivel].toLowerCase()}`}
        aria-label={`Nome da nova ${NIVEL_ROTULO[nivel].toLowerCase()}`}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') salvar()
          if (e.key === 'Escape') { e.stopPropagation(); onCancelar() }
        }}
      />
      <button className="btn-confirm" onClick={salvar} disabled={salvando}>Adicionar</button>
      <button className="icon-btn" onClick={onCancelar} aria-label="Cancelar"><IconClose /></button>
    </div>
  )
}

// ── Drawer do item ──

const STATUS_OPCOES = Object.entries(STATUS_ITEM).map(([chave, s]) => ({ chave, value: s.rotulo, color: s.cor }))

function ItemDrawer({ item, pai, projeto, itens, perm, hoje, pessoas, onClose, atualizar, mover, excluir }) {
  const pi = permissoesItem(perm, item.nivel)
  const [nome, setNome] = useState(item.nome)
  const [horas, setHoras] = useState(item.horas_estimadas ?? '')
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const prazoPai = pai ? pai.prazo : projeto.prazo_final
  const rotuloPai = pai ? (pai.nivel === 1 ? 'da etapa' : 'da tarefa') : 'do projeto'
  const descendentes = idsDaSubarvore(itens, item.id).size - 1
  const irmaos = itens.filter(i => (i.parent_id || null) === (item.parent_id || null))
  const pos = [...irmaos].sort((a, b) => a.ordem - b.ordem || String(a.created_at).localeCompare(String(b.created_at))).findIndex(i => i.id === item.id)
  const rotulo = NIVEL_ROTULO[item.nivel]

  function salvarNome() {
    const n = nome.trim()
    if (!n) { setNome(item.nome); return }
    if (n !== item.nome) atualizar({ nome: n })
  }

  function salvarHoras() {
    const texto = String(horas).trim()
    const valor = texto === '' ? null : Number(texto.replace(',', '.'))
    if (valor != null && (!Number.isFinite(valor) || valor < 0 || valor > 100000)) { setHoras(item.horas_estimadas ?? ''); return }
    if (valor !== (item.horas_estimadas == null ? null : Number(item.horas_estimadas))) atualizar({ horas_estimadas: valor })
  }

  return createPortal(
    <>
      <div className="pj-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="pj-drawer" role="dialog" aria-modal="true" aria-label={`${rotulo}: ${item.nome}`}>
        <div className="pj-drawer-cab">
          <span className="pj-drawer-nivel">{rotulo}{pai ? ` · ${pai.nome}` : ''}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><IconClose /></button>
        </div>

        <div className="pj-drawer-corpo">
          <div className="modal-field">
            <label className="modal-label" htmlFor="pj-item-nome">Nome</label>
            {pi.renomear ? (
              <input id="pj-item-nome" className="modal-input" value={nome} maxLength={300}
                onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            ) : <div className="pj-estatico">{item.nome}</div>}
          </div>

          <div className="modal-field">
            <label className="modal-label">Status</label>
            {pi.editarCampos ? (
              <SelectDropdown
                variant="field"
                col={{ options: STATUS_OPCOES }}
                value={STATUS_ITEM[item.status]?.rotulo}
                onChange={(rotuloEscolhido) => {
                  const op = STATUS_OPCOES.find(o => o.value === rotuloEscolhido)
                  if (op && op.chave !== item.status) atualizar({ status: op.chave })
                }}
              />
            ) : <div className="pj-estatico"><span className={`pill pill-${STATUS_ITEM[item.status]?.cor}`}><span className="dot" />{STATUS_ITEM[item.status]?.rotulo}</span></div>}
            {itemAtrasado(item, hoje) && <div className="pj-chip-atrasado pj-drawer-chip"><IconAlert /> Atrasado</div>}
            {item.status === 'concluido' && item.concluido_em && (
              <div className="pj-dica">Concluído em {new Date(item.concluido_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
            )}
          </div>

          <div className="pj-campos-2">
            <CampoData rotulo="Início" value={item.data_inicio} max={item.prazo} disabled={!pi.editarCampos}
              onChange={(v) => atualizar({ data_inicio: v })} />
            <CampoData rotulo="Prazo" value={item.prazo} min={item.data_inicio} disabled={!pi.editarCampos}
              onChange={(v) => atualizar({ prazo: v })} />
          </div>
          {passaDoPrazo(item, prazoPai) && (
            <p className="pj-aviso"><IconAlert /> Passa do prazo {rotuloPai} ({fmtData(prazoPai)}).</p>
          )}

          <div className="modal-field">
            <label className="modal-label">Responsável</label>
            {pi.editarCampos ? (
              <SeletorPessoa pessoas={pessoas} value={item.responsavel_id} onChange={(v) => atualizar({ responsavel_id: v })} />
            ) : (
              <div className="pj-estatico">
                {item.responsavel_id
                  ? nomePessoa(pessoas.find(p => p.id === item.responsavel_id)) || 'Pessoa removida da equipe'
                  : <span className="pj-sem-resp">Sem responsável</span>}
              </div>
            )}
          </div>

          <div className="modal-field">
            <label className="modal-label" htmlFor="pj-item-horas">Horas estimadas</label>
            {pi.editarHoras ? (
              <input id="pj-item-horas" className="modal-input" inputMode="decimal" value={horas}
                onChange={(e) => setHoras(e.target.value)} onBlur={salvarHoras}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder="Ex.: 8" />
            ) : <div className="pj-estatico">{item.horas_estimadas != null ? `${Number(item.horas_estimadas).toLocaleString('pt-BR')} h` : '—'}</div>}
          </div>

          {pi.reordenar && irmaos.length > 1 && (
            <div className="modal-field">
              <label className="modal-label">Posição</label>
              <div className="pj-mover">
                <button className="btn-cancel" onClick={() => mover(-1)} disabled={pos <= 0}>
                  <IconChevronDown className="pj-girar" /> Subir
                </button>
                <button className="btn-cancel" onClick={() => mover(1)} disabled={pos >= irmaos.length - 1}>
                  <IconChevronDown /> Descer
                </button>
              </div>
            </div>
          )}

          {pi.excluir && (
            confirmar ? (
              <div className="pj-confirmar">
                <p>Excluir {rotulo.toLowerCase()} “{item.nome}”{descendentes > 0 ? ` e ${descendentes} ${descendentes === 1 ? 'item abaixo dela' : 'itens abaixo dela'}` : ''}? Não dá para desfazer.</p>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={() => setConfirmar(false)}>Cancelar</button>
                  <button className="btn-danger" onClick={excluir}>Excluir</button>
                </div>
              </div>
            ) : (
              <button className="btn-cancel pj-excluir" onClick={() => setConfirmar(true)}><IconTrash /> Excluir {rotulo.toLowerCase()}</button>
            )
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}

// ── Modais do master ──

function useEsc(fechar, bloqueado) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !bloqueado) fechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fechar, bloqueado])
}

// Master e gestor editam; nome oficial e arquivar só o master (o servidor
// também recusa: gatilho projetos_permissao)
function EditarProjetoModal({ projeto, perm, empresaId, onClose, onSalvo, onExcluido }) {
  const toast = useToast()
  const clientes = useClientes(empresaId)
  const [form, setForm] = useState(() => ({ ...formDoProjeto(projeto), nomeOficial: projeto.nome_oficial || '', situacao: projeto.situacao }))
  const [salvando, setSalvando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  useEsc(onClose, salvando)

  async function salvar() {
    const { linha, erro } = linhaDoForm(form)
    if (erro) { toast(erro); return }
    setSalvando(true)
    const { data, error } = await supabase
      .from('projetos')
      .update({
        ...linha,
        situacao: form.situacao,
        ...(perm.editarNomeOficial ? { nome_oficial: form.nomeOficial.trim() || null } : {}),
      })
      .eq('id', projeto.id)
      .select(SELECT_PROJETO)
      .maybeSingle()
    setSalvando(false)
    if (error || !data) { toast(msgErro(error, 'Não foi possível salvar o projeto')); return }
    toast('Projeto salvo')
    onSalvo(data)
  }

  async function excluir() {
    setSalvando(true)
    const { data, error } = await supabase.from('projetos').delete().eq('id', projeto.id).select('id')
    setSalvando(false)
    if (error || !data?.length) { toast(msgErro(error, 'Não foi possível excluir o projeto')); return }
    toast('Projeto excluído')
    onExcluido()
  }

  const opcoesSituacao = Object.entries(SITUACOES)
    .filter(([value]) => value !== 'arquivado' || perm.arquivarProjeto || projeto.situacao === 'arquivado')
    .map(([value, s]) => ({ value, label: s.rotulo }))

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose() }}>
      <div className="modal pj-modal" role="dialog" aria-modal="true" aria-labelledby="pj-editar-titulo">
        <div className="modal-title" id="pj-editar-titulo">Editar projeto</div>
        {confirmar ? (
          <>
            <p className="pj-confirmar-texto">
              Excluir “{projeto.nome}” com todas as etapas, tarefas{perm.verFinanceiro ? ' e o financeiro' : ''}? Não dá para desfazer.
              {perm.arquivarProjeto && <> Para só tirar da lista, use a situação <strong>Arquivado</strong>.</>}
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmar(false)} disabled={salvando}>Voltar</button>
              <button className="btn-danger" onClick={excluir} disabled={salvando}>Excluir projeto</button>
            </div>
          </>
        ) : (
          <>
            <CamposProjeto form={form} setForm={setForm} clientes={clientes} />
            <div className="pj-campos-2">
              {perm.editarNomeOficial && (
                <div className="modal-field">
                  <label className="modal-label" htmlFor="pj-oficial">Nome oficial</label>
                  <input id="pj-oficial" className="modal-input" maxLength={200} value={form.nomeOficial}
                    onChange={(e) => setForm(f => ({ ...f, nomeOficial: e.target.value }))} placeholder="Ex.: PRJ-2026-014" />
                </div>
              )}
              <div className="modal-field">
                <label className="modal-label">Situação</label>
                <Select value={form.situacao} onChange={(v) => setForm(f => ({ ...f, situacao: v }))} options={opcoesSituacao} ariaLabel="Situação" />
              </div>
            </div>
            {form.situacao === 'arquivado' && projeto.situacao !== 'arquivado' && (
              <p className="pj-dica">Arquivado some da lista da equipe (gestor e comum).</p>
            )}
            <div className="modal-actions pj-modal-acoes">
              {perm.excluirProjeto && (
                <button className="pj-link pj-link-perigo" onClick={() => setConfirmar(true)} disabled={salvando}>Excluir projeto</button>
              )}
              <button className="btn-cancel" onClick={onClose} disabled={salvando}>Cancelar</button>
              <button className="btn-confirm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const numTexto = (n) => (n == null ? '' : String(n).replace('.', ','))

function FinanceiroModal({ projetoId, fin, onClose, onSalvo }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({
    valor: numTexto(fin?.valor_fechado),
    data: fin?.data_fechamento || null,
    hora: numTexto(fin?.valor_hora_ref),
    margem: numTexto(fin?.margem_pct),
    nfAtivo: !!fin?.nf_ativo,
    nf: numTexto(fin?.nf_pct),
  }))
  const [salvando, setSalvando] = useState(false)
  useEsc(onClose, salvando)
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  async function salvar() {
    const valor = parseValorBR(form.valor)
    const hora = parseValorBR(form.hora)
    const margem = parseValorBR(form.margem)
    const nf = parseValorBR(form.nf)
    if ([valor, hora, margem, nf].some(n => Number.isNaN(n) || n < 0)) { toast('Confira os números: use só valores positivos.'); return }
    if (margem != null && margem > 1000) { toast('Margem acima de 1000%.'); return }
    if (nf != null && nf > 100) { toast('A NF vai de 0 a 100%.'); return }

    setSalvando(true)
    const { data, error } = await supabase
      .from('projeto_financeiro')
      .upsert({
        projeto_id: projetoId, valor_fechado: valor, data_fechamento: form.data, valor_hora_ref: hora,
        margem_pct: margem, nf_ativo: form.nfAtivo, nf_pct: nf,
      }, { onConflict: 'projeto_id' })
      .select(SELECT_FIN)
      .maybeSingle()
    setSalvando(false)
    if (error || !data) { toast(msgErro(error, 'Não foi possível salvar o financeiro')); return }
    toast('Financeiro salvo')
    onSalvo(data)
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !salvando) onClose() }}>
      <div className="modal pj-modal" role="dialog" aria-modal="true" aria-labelledby="pj-fin-titulo">
        <div className="modal-title" id="pj-fin-titulo">Financeiro do projeto</div>
        <div className="pj-campos-2">
          <div className="modal-field">
            <label className="modal-label" htmlFor="pj-fin-valor">Valor fechado</label>
            <input id="pj-fin-valor" className="modal-input" inputMode="decimal" value={form.valor} onChange={set('valor')} placeholder="R$ 0,00" />
          </div>
          <CampoData rotulo="Data do fechamento" value={form.data} onChange={(v) => setForm(f => ({ ...f, data: v }))} />
        </div>
        <div className="pj-campos-2">
          <div className="modal-field">
            <label className="modal-label" htmlFor="pj-fin-hora">Valor-hora de referência</label>
            <input id="pj-fin-hora" className="modal-input" inputMode="decimal" value={form.hora} onChange={set('hora')} placeholder="R$ 0,00" />
          </div>
          <div className="modal-field">
            <label className="modal-label" htmlFor="pj-fin-margem">Margem (%)</label>
            <input id="pj-fin-margem" className="modal-input" inputMode="decimal" value={form.margem} onChange={set('margem')} />
          </div>
        </div>
        <div className="modal-field">
          <label className="pj-check-linha">
            <input type="checkbox" checked={form.nfAtivo} onChange={(e) => setForm(f => ({ ...f, nfAtivo: e.target.checked }))} />
            Emite nota fiscal
          </label>
          {form.nfAtivo && (
            <input className="modal-input pj-campo-extra" inputMode="decimal" value={form.nf} onChange={set('nf')} placeholder="Imposto da NF (%)" aria-label="Imposto da NF (%)" />
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="btn-confirm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
