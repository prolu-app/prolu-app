import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconCopy, IconTrash, IconAlert } from '../components/Icons.jsx'
import { useConta } from '../contexts/ContaContext.jsx'
import { PLANOS, nivelPlano, limitePlano, rotuloPlano } from '../utils/planos.js'
import '../components/BloqueioPlano.css'
import { excluirFormulario, duplicarFormulario } from '../services/formulariosAcoes.js'
import { slugify, comSufixo } from '../utils/slug.js'
import './Formularios.css'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'

// Formulários do escritório: builder (Fase 1) + link público (Fase 2),
// hoje em /e/:slugEscritorio/:slugFormulario (migration_036).
// Tabelas formularios / formulario_campos — migrations 025 e 026.

function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Envios de formulário do mês (migration_054), só quando o plano tem limite:
// contador, aviso no penúltimo envio e card de upgrade no limite. Os números
// vêm do banco (form_envios_mes); quem bloqueia é a formulario-publico.
function EnviosDoMes({ empresaId }) {
  const { plano } = useConta()
  const navigate = useNavigate()
  const [situacao, setSituacao] = useState(null)

  useEffect(() => {
    let vivo = true
    setSituacao(null)
    if (!supabaseReady || !empresaId) return
    supabase.rpc('form_envios_mes', { p_empresa_id: empresaId }).then(({ data, error }) => {
      if (error) console.error('[formularios] envios do mês', error)
      if (vivo) setSituacao(data || null)
    })
    return () => { vivo = false }
  }, [empresaId])

  const limite = situacao?.limite
  if (!Number.isFinite(limite)) return null
  const usados = Math.min(situacao.usados || 0, limite)
  // menor plano acima do atual sem esse limite
  const destino = PLANOS.find(p => nivelPlano(p) > nivelPlano(plano) && limitePlano(p, 'envios_form_mes') == null) || 'pro'

  if (usados >= limite) {
    return (
      <section className="bp-card fm-envios-card" aria-labelledby="fm-envios-titulo">
        <span className="bp-tag">Formulários</span>
        <h2 className="bp-titulo" id="fm-envios-titulo">Os formulários pararam de receber respostas este mês</h2>
        <p className="bp-texto">
          Você usou os {limite} envios do plano {rotuloPlano(plano) || 'atual'}. Os pedidos que já chegaram continuam no CRM.
          A contagem recomeça no dia 1º; para voltar a receber agora, sem limite, mude para o plano <strong>{rotuloPlano(destino)}</strong>.
        </p>
        <button className="btn-primary bp-btn" onClick={() => navigate(`/planos?plano=${destino}`)}>Fazer upgrade</button>
        <Link className="bp-link" to="/planos">Ver planos</Link>
      </section>
    )
  }

  const quase = usados >= limite - 1
  return (
    <div className={`fm-envios${quase ? ' fm-envios-quase' : ''}`} role="status">
      <div className="fm-envios-linha">
        <span><strong>{usados} de {limite}</strong> envios usados este mês</span>
        <span className="fm-envios-barra" aria-hidden="true"><span style={{ width: `${(usados / limite) * 100}%` }} /></span>
      </div>
      {quase && (
        <p className="fm-envios-aviso">
          <IconAlert aria-hidden="true" /> Falta 1 envio para o limite do plano {rotuloPlano(plano)} neste mês. Depois dele, os formulários param de receber respostas até o dia 1º. <Link to={`/planos?plano=${destino}`}>Ver planos</Link>
        </p>
      )}
    </div>
  )
}

// Liga/desliga usado na lista e no editor
export function FmSwitch({ ligado, onChange, disabled, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={rotulo}
      className={`fm-switch${ligado ? ' on' : ''}`}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange(!ligado) }}
      disabled={disabled}
    >
      <span className="fm-switch-knob" />
    </button>
  )
}

// Confirmação usada na listagem e no editor (mesmo visual dos outros modais do app)
export const TEXTO_EXCLUIR = 'Esta ação não pode ser desfeita. Todos os campos e configurações do formulário serão perdidos.'
export function FmConfirmar({ titulo, texto, rotulo, perigo, ocupado, onConfirmar, onCancelar }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !ocupado) onCancelar() }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="fm-confirmar-titulo" aria-describedby="fm-confirmar-texto">
        <div className="modal-title" id="fm-confirmar-titulo">{titulo}</div>
        <p className="fm-confirmar-texto" id="fm-confirmar-texto">{texto}</p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          <button className={perigo ? 'btn-danger' : 'btn-confirm'} onClick={onConfirmar} disabled={ocupado} autoFocus>
            {ocupado ? 'Aguarde…' : rotulo}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Formularios() {
  const { activeEmpresaId, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  // "Novo formulário": primeiro escolhe começar do zero ou de um modelo da
  // Prolu (form_templates, migration_043); "zero" segue para nome/descrição
  const [passoNovo, setPassoNovo] = useState('escolher') // escolher | zero
  const [modelosForm, setModelosForm] = useState(null) // null = carregando
  const [criandoModeloId, setCriandoModeloId] = useState(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [descNovo, setDescNovo] = useState('')
  const [criando, setCriando] = useState(false)
  const [confirmar, setConfirmar] = useState(null) // { tipo: 'duplicar' | 'excluir', form }
  const [ocupado, setOcupado] = useState(false)

  // prolu_admin visitando outro escritório só lê (RLS da migration_025)
  const podeEditar = activeEmpresaId != null && activeEmpresaId === user?.empresaId

  useEffect(() => { carregar() }, [activeEmpresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('formularios')
      .select('id, empresa_id, nome, descricao, slug, ativo, updated_at, empresas(slug), formulario_campos(count)')
      .eq('empresa_id', activeEmpresaId)
      .order('created_at', { ascending: true })
    if (error) { console.error('[formularios] carregar', error); toast('Erro ao carregar formulários') }
    setLista((data || []).map(f => ({ ...f, qtdCampos: f.formulario_campos?.[0]?.count ?? 0 })))
    setLoading(false)
  }

  async function alternarAtivo(f, ativo) {
    setLista(prev => prev.map(x => x.id === f.id ? { ...x, ativo } : x))
    const { error } = await supabase.from('formularios').update({ ativo }).eq('id', f.id)
    if (error) {
      setLista(prev => prev.map(x => x.id === f.id ? { ...x, ativo: !ativo } : x))
      toast('Não foi possível alterar o formulário')
      return
    }
    toast(ativo ? 'Formulário ativado' : 'Formulário desativado')
  }

  // endereço público gerado do nome; único dentro do escritório — em
  // colisão (23505) tenta com sufixo
  async function inserirFormulario(nome, descricao) {
    const base = slugify(nome)
    let data = null, error = null
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      ;({ data, error } = await supabase
        .from('formularios')
        .insert({ empresa_id: activeEmpresaId, nome, descricao, slug: tentativa ? comSufixo(base) : base })
        .select('id')
        .single())
      if (error?.code !== '23505') break
    }
    return { data, error }
  }

  async function criar() {
    if (!nomeNovo.trim() || criando) return
    setCriando(true)
    const { data, error } = await inserirFormulario(nomeNovo.trim(), descNovo.trim() || null)
    setCriando(false)
    if (error || !data) { console.error('[formularios] criar', error); toast('Erro ao criar formulário'); return }
    navigate(`/formularios/${data.id}`)
  }

  async function abrirNovo() {
    setPassoNovo('escolher')
    setModelosForm(null)
    setModalNovo(true)
    const { data, error } = await supabase.from('form_templates')
      .select('id, nome, descricao, form_template_campos(count)').eq('ativo', true).order('ordem').order('nome')
    if (error) console.error('[formularios] modelos', error)
    const lista = (data || []).map(m => ({ ...m, qtdCampos: m.form_template_campos?.[0]?.count ?? 0 }))
    setModelosForm(lista)
    if (!lista.length) setPassoNovo('zero') // sem modelos: vai direto para o nome
  }

  // a partir de um modelo: formulário com o nome do modelo (editável depois)
  // e os campos copiados, sem coluna do CRM — o escritório mapeia no editor
  async function criarDoModelo(modelo) {
    if (criandoModeloId) return
    setCriandoModeloId(modelo.id)
    try {
      const { data: camposModelo, error: e1 } = await supabase.from('form_template_campos')
        .select('label, tipo, obrigatorio, ordem, opcoes').eq('template_id', modelo.id).order('ordem')
      if (e1) throw e1
      const { data: form, error: e2 } = await inserirFormulario(modelo.nome, modelo.descricao || null)
      if (e2 || !form) throw e2 || new Error('sem formulário')
      if (camposModelo.length) {
        const { error: e3 } = await supabase.from('formulario_campos').insert(camposModelo.map((c, i) => ({
          formulario_id: form.id, label: c.label, tipo: c.tipo, obrigatorio: c.obrigatorio, ordem: i,
          opcoes: Array.isArray(c.opcoes) ? c.opcoes : [], crm_coluna_id: null,
        })))
        if (e3) {
          await supabase.from('formularios').delete().eq('id', form.id) // não deixa formulário pela metade
          throw e3
        }
      }
      navigate(`/formularios/${form.id}`)
    } catch (e) {
      console.error('[formularios] criar do modelo', e)
      toast('Não foi possível criar o formulário a partir do modelo')
      setCriandoModeloId(null)
    }
  }

  async function confirmarAcao() {
    const { tipo, form } = confirmar
    setOcupado(true)
    try {
      if (tipo === 'excluir') {
        await excluirFormulario(form)
        setLista(prev => prev.filter(x => x.id !== form.id))
        toast('Formulário excluído')
      } else {
        const copia = { ...(await duplicarFormulario(form.id)), empresas: form.empresas }
        // logo abaixo do original (a lista é por data de criação; recarregar põe no fim)
        setLista(prev => {
          const i = prev.findIndex(x => x.id === form.id)
          return [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)]
        })
        toast('Formulário duplicado com sucesso')
      }
      setConfirmar(null)
    } catch (e) {
      console.error(`[formularios] ${tipo}`, e)
      toast(tipo === 'excluir' ? 'Não foi possível excluir o formulário' : 'Não foi possível duplicar o formulário')
    } finally {
      setOcupado(false)
    }
  }

  function fecharModal() {
    if (criandoModeloId) return
    setModalNovo(false)
    setPassoNovo('escolher')
    setNomeNovo('')
    setDescNovo('')
  }

  return (
    <PageContainer>
      <PageHeader
        titulo="Formulários"
        descricao="Formulários de captação do escritório — um para cada origem, se quiser."
        acoes={podeEditar && (
          <button className="btn-primary" onClick={abrirNovo}>
            <IconPlus /> Novo formulário
          </button>
        )}
      />

      {!podeEditar && activeEmpresaId && (
        <p className="fm-readonly-note">Formulários de outro escritório — somente leitura.</p>
      )}

      <EnviosDoMes empresaId={activeEmpresaId} />

      {loading ? (
        <p className="fm-empty">Carregando…</p>
      ) : !supabaseReady ? (
        <p className="fm-empty">Formulários precisam do Supabase configurado.</p>
      ) : lista.length === 0 ? (
        <div className="fm-empty-card">
          <p className="fm-empty-title">Nenhum formulário ainda</p>
          <p className="fm-empty-sub">Crie um formulário para cada origem de contato — por exemplo, "Instagram" ou "Google Ads".</p>
          {podeEditar && (
            <button className="btn-primary" onClick={() => setModalNovo(true)}>
              <IconPlus /> Novo formulário
            </button>
          )}
        </div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Campos</th>
                <th>Atualizado em</th>
                <th>Ativo</th>
                {podeEditar && <th className="fm-acoes-th" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {lista.map(f => (
                <tr key={f.id} className="fm-row" onClick={() => navigate(`/formularios/${f.id}`)}>
                  <td>
                    <div className="fm-nome">{f.nome}</div>
                    {f.descricao && <div className="fm-desc">{f.descricao}</div>}
                    <div className="fm-slug">/e/{f.empresas?.slug}/{f.slug}</div>
                  </td>
                  <td className="fm-meta">{f.qtdCampos} {f.qtdCampos === 1 ? 'campo' : 'campos'}</td>
                  <td className="fm-meta">{fmtData(f.updated_at)}</td>
                  <td>
                    <div className="fm-status">
                      <FmSwitch
                        ligado={f.ativo}
                        onChange={v => alternarAtivo(f, v)}
                        disabled={!podeEditar}
                        rotulo={f.ativo ? 'Desativar formulário' : 'Ativar formulário'}
                      />
                      <span className={`pill ${f.ativo ? 'pill-green' : 'pill-gray'}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </td>
                  {podeEditar && (
                    // aparecem no hover/foco da linha; o espaço da coluna já existe (não desloca nada)
                    <td className="fm-acoes" onClick={e => e.stopPropagation()}>
                      <button type="button" className="fm-acao" title="Duplicar formulário" aria-label={`Duplicar formulário ${f.nome}`}
                        onClick={() => setConfirmar({ tipo: 'duplicar', form: f })}><IconCopy /></button>
                      <button type="button" className="fm-acao fm-acao-perigo" title="Excluir formulário" aria-label={`Excluir formulário ${f.nome}`}
                        onClick={() => setConfirmar({ tipo: 'excluir', form: f })}><IconTrash /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmar && (
        <FmConfirmar
          {...(confirmar.tipo === 'excluir'
            ? { titulo: 'Excluir formulário?', texto: TEXTO_EXCLUIR, rotulo: 'Excluir', perigo: true }
            : {
                titulo: 'Duplicar formulário?',
                texto: `Será criada uma cópia com o nome "${confirmar.form.nome} (cópia)". Os campos serão copiados mas as respostas não. A cópia começa inativa.`,
                rotulo: 'Duplicar',
              })}
          ocupado={ocupado}
          onConfirmar={confirmarAcao}
          onCancelar={() => setConfirmar(null)}
        />
      )}

      {modalNovo && passoNovo === 'escolher' && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="modal fm-novo-modal" role="dialog" aria-modal="true" aria-labelledby="fm-novo-titulo">
            <div className="modal-title" id="fm-novo-titulo">Novo formulário</div>
            <p className="fm-novo-sub">Comece do zero ou a partir de um modelo pronto da Prolu.</p>
            <div className="fm-novo-opcoes">
              <button type="button" className="fm-novo-opcao fm-novo-zero" onClick={() => setPassoNovo('zero')} disabled={!!criandoModeloId}>
                <span className="fm-novo-opcao-nome"><IconPlus /> Começar do zero</span>
                <span className="fm-novo-opcao-desc">Formulário em branco — você cria as perguntas.</span>
              </button>
              {modelosForm === null && <p className="fm-novo-carregando">Carregando modelos…</p>}
              {modelosForm?.map(m => (
                <button key={m.id} type="button" className="fm-novo-opcao" onClick={() => criarDoModelo(m)} disabled={!!criandoModeloId}>
                  <span className="fm-novo-opcao-nome">{m.nome}</span>
                  {m.descricao && <span className="fm-novo-opcao-desc">{m.descricao}</span>}
                  <span className="fm-novo-opcao-meta">
                    {criandoModeloId === m.id ? 'Criando formulário…' : `${m.qtdCampos} ${m.qtdCampos === 1 ? 'campo' : 'campos'} · Modelo Prolu`}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={fecharModal} disabled={!!criandoModeloId}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalNovo && passoNovo === 'zero' && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="modal">
            <div className="modal-title">Novo formulário</div>
            <div className="modal-field">
              <label className="modal-label">Nome</label>
              <input
                className="modal-input" autoFocus
                value={nomeNovo}
                onChange={e => setNomeNovo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && criar()}
                placeholder="Ex.: Formulário Instagram"
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Descrição (opcional)</label>
              <textarea
                className="modal-input fm-textarea"
                rows={3}
                value={descNovo}
                onChange={e => setDescNovo(e.target.value)}
                placeholder="Para que serve este formulário"
              />
            </div>
            <div className="modal-actions">
              {modelosForm?.length > 0 && <button className="btn-cancel fm-novo-voltar" onClick={() => setPassoNovo('escolher')}>Voltar</button>}
              <button className="btn-cancel" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirm" onClick={criar} disabled={criando || !nomeNovo.trim()}>
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
