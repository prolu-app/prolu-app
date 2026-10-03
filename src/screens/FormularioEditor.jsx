import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconBack, IconPlus, IconTrash, IconGrip, IconClose, IconChevronDown, IconCopy, IconArrowUpRight, IconCode } from '../components/Icons.jsx'
import { slugify, slugValido, urlPublica } from '../utils/slug.js'
import { FmSwitch, FmConfirmar, TEXTO_EXCLUIR } from './Formularios.jsx'
import { excluirFormulario } from '../services/formulariosAcoes.js'
import IncorporarFormulario from './IncorporarFormulario.jsx'
import { PainelEstilo, PainelPosEnvio, PainelApresentacao } from './FormularioAparencia.jsx'
import PainelNotificacoes from './FormularioNotificacoes.jsx'
import CampoTextoSalvo from '../components/CampoTextoSalvo.jsx'
import './Formularios.css'

// Códigos em inglês no banco (igual crm_colunas.tipo), rótulo em português aqui.
// Abas do editor
const ABAS = [
  { id: 'geral', label: 'Geral' },
  { id: 'campos', label: 'Campos' },
  { id: 'envio', label: 'Depois do envio' },
  { id: 'estilo', label: 'Estilo' },
  { id: 'notificacoes', label: 'Notificações' },
]

const TIPOS = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'select', label: 'Seleção' },
]

// ── Mapeamento campo → coluna do CRM (Fase 2) ──
// Tipos de campo aceitos por tipo de coluna do CRM. Colunas de data, tags e
// checkbox não recebem campos; Status é preenchido sozinho no envio.
const CAMPO_ACEITA = {
  text: ['text', 'textarea', 'phone', 'email'],
  client: ['text'],
  number: ['number'],
  money: ['number'],
  select: ['select'],
  phone: ['phone'], // coluna fixa Telefone (migration_035): recebe o campo de telefone (E.164)
}
const SLUGS_AUTOMATICOS = ['status']
function tipoPadraoPara(colTipo) { return CAMPO_ACEITA[colTipo]?.[0] || 'text' }
function colunaMapeavel(col) { return !!CAMPO_ACEITA[col.tipo] && !SLUGS_AUTOMATICOS.includes(col.slug) }

// crm_colunas.opcoes: fixas = objeto { slug, items }; criadas = array (igual CRM.jsx)
function lerColunaCrm(c) {
  const obj = c.opcoes != null && !Array.isArray(c.opcoes) ? c.opcoes : null
  const itens = obj ? (obj.items || []) : (Array.isArray(c.opcoes) ? c.opcoes : [])
  return { id: c.id, nome: c.nome, tipo: c.tipo, slug: obj?.slug || null, opcoes: itens.map(o => o.value) }
}

// Mesmo critério do EtapasEditor/CRM: metade de cima = antes, de baixo = depois
function posicaoNoAlvo(ev) {
  const rect = ev.currentTarget.getBoundingClientRect()
  return ev.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

export default function FormularioEditor() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [campos, setCampos] = useState([])
  const [loading, setLoading] = useState(true)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [focoId, setFocoId] = useState(null) // campo recém-criado: abre com o foco na pergunta
  const [adicionando, setAdicionando] = useState(false)
  // arrastar só "arma" a partir do grip, pra não brigar com seleção de texto nos inputs
  const [armadoId, setArmadoId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null) // { id, pos: 'before' | 'after' }
  const [colunasCrm, setColunasCrm] = useState([])
  // remonta o input do endereço após cada tentativa: mostra sempre o slug salvo
  // (normalizado), e não o texto digitado quando era inválido ou já estava em uso
  const [slugVersao, setSlugVersao] = useState(0)
  const [incorporar, setIncorporar] = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  // aba ativa na URL (?aba=estilo): recarregar ou voltar mantém a seção
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(a => a.id === params.get('aba')) ? params.get('aba') : 'geral'
  function trocarAba(id) {
    setParams(p => { const n = new URLSearchParams(p); if (id === 'geral') n.delete('aba'); else n.set('aba', id); return n }, { replace: true })
  }

  // prolu_admin visitando outro escritório só lê (RLS da migration_025)
  const podeEditar = !!form && form.empresa_id === user?.empresaId

  useEffect(() => { carregar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clicou no grip e soltou sem arrastar: desarma, senão selecionar texto
  // num input do card começaria a arrastar o card. (Arrastando, o mouseup
  // não dispara até o dragend, que também desarma.)
  useEffect(() => {
    if (!armadoId) return
    const desarmar = () => setArmadoId(null)
    window.addEventListener('mouseup', desarmar)
    return () => window.removeEventListener('mouseup', desarmar)
  }, [armadoId])

  async function carregar() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const [{ data: f, error: e1 }, { data: cs, error: e2 }] = await Promise.all([
      // empresas(slug): o link público é /e/<escritório>/<formulário> (migration_036)
      supabase.from('formularios').select('*, empresas(slug)').eq('id', id).maybeSingle(),
      supabase.from('formulario_campos').select('*').eq('formulario_id', id).order('ordem'),
    ])
    if (e1 || e2) { console.error('[formulario] carregar', e1 || e2); toast('Erro ao carregar formulário') }
    if (!f) setNaoEncontrado(true)
    setForm(f || null)
    setCampos(cs || [])
    if (f) {
      const { data: cols } = await supabase
        .from('crm_colunas').select('id, nome, tipo, opcoes, ordem')
        .eq('empresa_id', f.empresa_id).order('ordem')
      setColunasCrm((cols || []).map(lerColunaCrm))
    }
    setLoading(false)
  }

  // ── formulário ──
  async function salvarForm(patch) {
    const anterior = form
    setForm(prev => ({ ...prev, ...patch }))
    const { error } = await supabase.from('formularios').update(patch).eq('id', id)
    if (error) { setForm(anterior); toast('Não foi possível salvar'); return false }
    return true
  }

  async function salvarSlug(digitado) {
    setSlugVersao(v => v + 1)
    const novo = slugify(digitado)
    if (!slugValido(novo) || novo === form.slug) return
    const anterior = form.slug
    setForm(prev => ({ ...prev, slug: novo }))
    const { error } = await supabase.from('formularios').update({ slug: novo }).eq('id', id)
    if (error) {
      setForm(prev => ({ ...prev, slug: anterior }))
      toast(error.code === '23505' ? 'Esse endereço já está em uso — escolha outro' : 'Não foi possível salvar o endereço')
      return
    }
    toast('Endereço atualizado — o link anterior deixou de funcionar')
  }

  async function excluir() {
    setExcluindo(true)
    try {
      await excluirFormulario(form)
      toast('Formulário excluído')
      navigate('/formularios')
    } catch (e) {
      console.error('[formulario] excluir', e)
      toast('Não foi possível excluir o formulário')
      setExcluindo(false)
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(urlPublica(form.empresas?.slug, form.slug))
      toast('Link copiado')
    } catch {
      toast('Não foi possível copiar — selecione o link e copie manualmente')
    }
  }

  // ── campos ──
  async function adicionarCampo() {
    if (adicionando) return
    setAdicionando(true)
    const { data, error } = await supabase
      .from('formulario_campos')
      .insert({ formulario_id: id, label: '', tipo: 'text', obrigatorio: false, ordem: campos.length, opcoes: [] })
      .select('*')
      .single()
    setAdicionando(false)
    if (error || !data) { console.error('[formulario] adicionar campo', error); toast('Não foi possível adicionar o campo'); return }
    setCampos(prev => [...prev, data])
    setFocoId(data.id)
  }

  async function salvarCampo(campoId, patch) {
    const anterior = campos
    setCampos(prev => prev.map(c => c.id === campoId ? { ...c, ...patch } : c))
    const { error } = await supabase.from('formulario_campos').update(patch).eq('id', campoId)
    if (error) {
      setCampos(anterior)
      toast(error.code === '23505' ? 'Essa coluna do CRM já recebe outro campo deste formulário' : 'Não foi possível salvar o campo')
    }
  }

  async function removerCampo(campoId) {
    const anterior = campos
    const restantes = campos.filter(c => c.id !== campoId).map((c, i) => ({ ...c, ordem: i }))
    setCampos(restantes)
    const { error } = await supabase.from('formulario_campos').delete().eq('id', campoId)
    if (error) { setCampos(anterior); toast('Não foi possível remover o campo'); return }
    await gravarOrdem(restantes)
  }

  async function gravarOrdem(lista) {
    const mudaram = lista.filter((c, i) => campos.find(x => x.id === c.id)?.ordem !== i)
    const res = await Promise.all(mudaram.map(c => supabase.from('formulario_campos').update({ ordem: c.ordem }).eq('id', c.id)))
    if (res.some(r => r.error)) toast('Não foi possível salvar a ordem dos campos')
  }

  function reordenar(origemId, alvoId, pos) {
    if (origemId === alvoId) return
    const lista = [...campos]
    const de = lista.findIndex(c => c.id === origemId)
    if (de === -1) return
    const [movido] = lista.splice(de, 1)
    let para = lista.findIndex(c => c.id === alvoId)
    if (para === -1) return
    if (pos === 'after') para += 1
    lista.splice(para, 0, movido)
    const reordenada = lista.map((c, i) => ({ ...c, ordem: i }))
    setCampos(reordenada)
    gravarOrdem(reordenada)
  }

  function mover(campoId, delta) {
    const i = campos.findIndex(c => c.id === campoId)
    const j = i + delta
    if (i === -1 || j < 0 || j >= campos.length) return
    reordenar(campoId, campos[j].id, delta < 0 ? 'before' : 'after')
  }

  function fimDoArraste() {
    setDragId(null)
    setDragOver(null)
    setArmadoId(null)
  }

  if (loading) return <p className="fm-empty">Carregando…</p>
  if (!supabaseReady) return <p className="fm-empty">Formulários precisam do Supabase configurado.</p>
  if (naoEncontrado || !form) {
    return (
      <>
        <button className="fm-back" onClick={() => navigate('/formularios')}><IconBack /> Formulários</button>
        <p className="fm-empty">Formulário não encontrado.</p>
      </>
    )
  }

  return (
    <>
      <button className="fm-back" onClick={() => navigate('/formularios')}><IconBack /> Formulários</button>

      {!podeEditar && <p className="fm-readonly-note">Formulário de outro escritório — somente leitura.</p>}

      <div className="fm-editor-head">
        <div className="fm-editor-titulo">{form.nome}</div>
        <span className={`pill ${form.ativo ? 'pill-green' : 'pill-gray'}`}>{form.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>

      {/* Abas ficam todas montadas (só escondidas): trocar de aba não perde
          nada digitado — os campos gravam no blur, que acontece antes do clique */}
      <div className="fm-abas" role="tablist" aria-label="Seções do formulário">
        {ABAS.map(a => (
          <button
            key={a.id} type="button" role="tab" id={`fm-aba-${a.id}`}
            aria-selected={aba === a.id} aria-controls={`fm-painel-${a.id}`}
            className={`fm-aba${aba === a.id ? ' on' : ''}`}
            onClick={() => trocarAba(a.id)}
          >
            {a.label}{a.id === 'campos' && <span className="fm-count">{campos.length}</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel" id="fm-painel-geral" aria-labelledby="fm-aba-geral" hidden={aba !== 'geral'}>
      <div className="fm-publico fm-geral">
        <div className="fm-publico-row">
          <span className="fm-publico-label">Nome</span>
          <CampoTextoSalvo
            className="fm-pos-input"
            valor={form.nome}
            placeholder="Nome interno do formulário"
            disabled={!podeEditar}
            obrigatorio
            maxLength={120}
            aria-label="Nome do formulário"
            onSalvar={nome => salvarForm({ nome })}
          />
        </div>
        <div className="fm-publico-row fm-row-topo">
          <span className="fm-publico-label">Descrição</span>
          <CampoTextoSalvo
            multilinha
            rows={3}
            className="fm-pos-input"
            valor={form.descricao || ''}
            placeholder="Uso interno — não aparece no formulário"
            disabled={!podeEditar}
            aria-label="Descrição do formulário"
            onSalvar={descricao => salvarForm({ descricao: descricao || null })}
          />
        </div>
        <div className="fm-publico-row">
          <span className="fm-publico-label">Status</span>
          <div className="fm-status">
            <FmSwitch
              ligado={form.ativo}
              onChange={ativo => salvarForm({ ativo }).then(ok => ok && toast(ativo ? 'Formulário ativado' : 'Formulário desativado'))}
              disabled={!podeEditar}
              rotulo={form.ativo ? 'Desativar formulário' : 'Ativar formulário'}
            />
            <span className="fm-status-texto">{form.ativo ? 'Ativo — recebendo respostas' : 'Inativo — não recebe respostas'}</span>
          </div>
        </div>
      </div>

      <div className="fm-publico">
        <div className="fm-publico-row">
          <span className="fm-publico-label">Link público</span>
          <div className="fm-publico-link">
            <span className="fm-publico-prefixo">{window.location.host}/e/{form.empresas?.slug}/</span>
            <CampoTextoSalvo
              key={slugVersao}
              className="fm-slug-input"
              valor={form.slug}
              disabled={!podeEditar}
              obrigatorio
              aria-label="Endereço do formulário"
              onSalvar={salvarSlug}
            />
          </div>
          <div className="fm-publico-acoes">
            <button type="button" className="fm-icon-btn" onClick={copiarLink} title="Copiar link" aria-label="Copiar link"><IconCopy /></button>
            <a className="fm-icon-btn" href={urlPublica(form.empresas?.slug, form.slug)} target="_blank" rel="noreferrer" title="Abrir formulário" aria-label="Abrir formulário"><IconArrowUpRight /></a>
            <button type="button" className="fm-embed-btn" onClick={() => setIncorporar(true)}><IconCode /> Incorporar</button>
          </div>
        </div>
        {!form.ativo && <p className="fm-publico-aviso">Formulário inativo: o link mostra "Formulário indisponível" e não recebe respostas.</p>}
        {(() => {
          const colOrigem = colunasCrm.find(c => c.slug === 'origem')
          if (!colOrigem) return null
          return (
            <div className="fm-publico-row">
              <span className="fm-publico-label">Origem no CRM</span>
              <select
                className="fm-tipo fm-origem"
                value={form.origem_crm || ''}
                disabled={!podeEditar}
                onChange={e => salvarForm({ origem_crm: e.target.value || null })}
                aria-label="Origem preenchida no CRM"
              >
                <option value="">Não preencher</option>
                {colOrigem.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
                {form.origem_crm && !colOrigem.opcoes.includes(form.origem_crm) && (
                  <option value={form.origem_crm}>{form.origem_crm} (não existe mais na coluna)</option>
                )}
              </select>
              <span className="fm-publico-dica">Preenche a coluna Origem de cada pedido que chegar por este formulário.</span>
            </div>
          )
        })()}
      </div>
      <PainelApresentacao form={form} podeEditar={podeEditar} salvarForm={salvarForm} />
      {podeEditar && (
        <div className="fm-excluir-rodape">
          <button type="button" className="fm-excluir-btn" onClick={() => setConfirmarExcluir(true)}><IconTrash /> Excluir formulário</button>
        </div>
      )}
      </section>

      {incorporar && <IncorporarFormulario form={form} campos={campos} onFechar={() => setIncorporar(false)} />}
      {confirmarExcluir && (
        <FmConfirmar
          titulo="Excluir formulário?" texto={TEXTO_EXCLUIR} rotulo="Excluir" perigo
          ocupado={excluindo} onConfirmar={excluir} onCancelar={() => setConfirmarExcluir(false)}
        />
      )}

      <section role="tabpanel" id="fm-painel-campos" aria-labelledby="fm-aba-campos" hidden={aba !== 'campos'}>
      {campos.length === 0 && (
        <p className="fm-empty fm-empty-inline">Nenhum campo ainda. {podeEditar && 'Adicione a primeira pergunta do formulário.'}</p>
      )}

      <div className="fm-campos">
        {campos.map((c, i) => (
          <CampoCard
            key={c.id}
            campo={c}
            indice={i}
            total={campos.length}
            podeEditar={podeEditar}
            focar={focoId === c.id}
            onFocado={() => setFocoId(null)}
            onSalvar={patch => salvarCampo(c.id, patch)}
            onRemover={() => removerCampo(c.id)}
            onMover={delta => mover(c.id, delta)}
            colunasMapeaveis={colunasCrm.filter(colunaMapeavel)}
            colunasUsadas={new Set(campos.filter(x => x.id !== c.id && x.crm_coluna_id).map(x => x.crm_coluna_id))}
            // arrastar
            armado={armadoId === c.id}
            onArmar={() => setArmadoId(c.id)}
            arrastando={dragId === c.id}
            dragOverPos={dragOver?.id === c.id ? dragOver.pos : null}
            onDragStart={e => { setDragId(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
            onDragOver={e => {
              if (!dragId) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragId !== c.id) setDragOver({ id: c.id, pos: posicaoNoAlvo(e) })
            }}
            onDrop={e => {
              e.preventDefault()
              if (dragId && dragId !== c.id) reordenar(dragId, c.id, dragOver?.pos || 'before')
              fimDoArraste()
            }}
            onDragEnd={fimDoArraste}
          />
        ))}
      </div>

      {podeEditar && (
        <button className="fm-add-campo" onClick={adicionarCampo} disabled={adicionando}>
          <IconPlus /> {adicionando ? 'Adicionando…' : 'Adicionar campo'}
        </button>
      )}
      </section>

      <section role="tabpanel" id="fm-painel-envio" aria-labelledby="fm-aba-envio" hidden={aba !== 'envio'}>
        <PainelPosEnvio form={form} podeEditar={podeEditar} salvarForm={salvarForm} />
      </section>

      <section role="tabpanel" id="fm-painel-estilo" aria-labelledby="fm-aba-estilo" hidden={aba !== 'estilo'}>
        <PainelEstilo form={form} campos={campos} podeEditar={podeEditar} salvarForm={salvarForm} />
      </section>

      <section role="tabpanel" id="fm-painel-notificacoes" aria-labelledby="fm-aba-notificacoes" hidden={aba !== 'notificacoes'}>
        <PainelNotificacoes form={form} podeEditar={podeEditar} salvarForm={salvarForm} />
      </section>
    </>
  )
}

function CampoCard({
  campo, indice, total, podeEditar, focar, onFocado, onSalvar, onRemover, onMover, colunasMapeaveis, colunasUsadas,
  armado, onArmar, arrastando, dragOverPos, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const labelRef = useRef(null)
  const [novaOpcao, setNovaOpcao] = useState('')
  const opcoes = Array.isArray(campo.opcoes) ? campo.opcoes : []

  useEffect(() => {
    if (focar && labelRef.current) {
      labelRef.current.focus()
      onFocado()
    }
  }, [focar]) // eslint-disable-line react-hooks/exhaustive-deps

  function adicionarOpcao() {
    const v = novaOpcao.trim()
    if (!v) return
    if (opcoes.some(o => o.value.toLowerCase() === v.toLowerCase())) { setNovaOpcao(''); return }
    onSalvar({ opcoes: [...opcoes, { value: v }] })
    setNovaOpcao('')
  }

  const colMapeada = campo.crm_coluna_id ? colunasMapeaveis.find(c => c.id === campo.crm_coluna_id) : null
  // mapeado para seleção do CRM: as opções são as da coluna (decisão da Fase 2)
  const opcoesDaColuna = colMapeada?.tipo === 'select'
  const semOpcoes = campo.tipo === 'select' && (opcoesDaColuna ? colMapeada.opcoes.length === 0 : opcoes.length === 0)

  function mudarMapeamento(colId) {
    if (!colId) { onSalvar({ crm_coluna_id: null }); return }
    const col = colunasMapeaveis.find(c => c.id === colId)
    if (!col) return
    const patch = { crm_coluna_id: col.id }
    if (!CAMPO_ACEITA[col.tipo].includes(campo.tipo)) patch.tipo = tipoPadraoPara(col.tipo)
    onSalvar(patch)
  }

  function mudarTipo(tipo) {
    // tipo novo incompatível com a coluna mapeada → volta a ser campo extra
    if (colMapeada && !CAMPO_ACEITA[colMapeada.tipo].includes(tipo)) {
      onSalvar({ tipo, crm_coluna_id: null })
      return
    }
    onSalvar({ tipo })
  }

  return (
    <div
      className={[
        'fm-campo',
        arrastando ? 'dragging' : '',
        dragOverPos === 'before' ? 'drag-over-before' : '',
        dragOverPos === 'after' ? 'drag-over-after' : '',
      ].filter(Boolean).join(' ')}
      draggable={podeEditar && armado}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {podeEditar && (
        <div className="fm-campo-handle">
          <span
            className="fm-grip"
            onMouseDown={onArmar}
            title="Arraste para reordenar"
            aria-hidden="true"
          >
            <IconGrip />
          </span>
          <button type="button" className="fm-mover" onClick={() => onMover(-1)} disabled={indice === 0} aria-label="Mover para cima" title="Mover para cima">
            <IconChevronDown style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button type="button" className="fm-mover" onClick={() => onMover(1)} disabled={indice === total - 1} aria-label="Mover para baixo" title="Mover para baixo">
            <IconChevronDown />
          </button>
        </div>
      )}

      <div className="fm-campo-body">
        <div className="fm-campo-row">
          <CampoTextoSalvo
            inputRef={labelRef}
            className="fm-label-input"
            valor={campo.label}
            placeholder={`Pergunta ${indice + 1}`}
            disabled={!podeEditar}
            onSalvar={label => onSalvar({ label })}
          />
          <select
            className="fm-tipo"
            value={campo.tipo}
            disabled={!podeEditar || opcoesDaColuna}
            title={opcoesDaColuna ? 'Definido pela coluna do CRM' : undefined}
            onChange={e => mudarTipo(e.target.value)}
            aria-label="Tipo do campo"
          >
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="fm-mapa">
          <span className="fm-mapa-label">Vai para o CRM</span>
          <select
            className="fm-tipo fm-mapa-select"
            value={campo.crm_coluna_id || ''}
            disabled={!podeEditar}
            onChange={e => mudarMapeamento(e.target.value)}
            aria-label="Coluna do CRM que recebe este campo"
          >
            <option value="">Campo extra (ficha do pedido)</option>
            {colunasMapeaveis.map(col => (
              <option key={col.id} value={col.id} disabled={colunasUsadas.has(col.id)}>
                {col.nome}{colunasUsadas.has(col.id) ? ' (já usada)' : ''}
              </option>
            ))}
          </select>
          {!campo.crm_coluna_id && <span className="fm-mapa-dica">Fica só no drawer do registro, não vira coluna</span>}
        </div>

        {campo.tipo === 'select' && opcoesDaColuna && (
          <div className="fm-opcoes">
            {colMapeada.opcoes.map(o => <span className="fm-opcao fm-opcao-crm" key={o}>{o}</span>)}
            <span className="fm-mapa-dica">Opções da coluna {colMapeada.nome} do CRM — edite no CRM</span>
            {semOpcoes && <span className="fm-aviso">A coluna não tem opções</span>}
          </div>
        )}

        {campo.tipo === 'select' && !opcoesDaColuna && (
          <div className="fm-opcoes">
            {opcoes.map(o => (
              <span className="fm-opcao" key={o.value}>
                {o.value}
                {podeEditar && (
                  <button type="button" onClick={() => onSalvar({ opcoes: opcoes.filter(x => x.value !== o.value) })} aria-label={`Remover opção ${o.value}`}>
                    <IconClose />
                  </button>
                )}
              </span>
            ))}
            {podeEditar && (
              <input
                className="fm-opcao-input"
                value={novaOpcao}
                onChange={e => setNovaOpcao(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarOpcao() } }}
                onBlur={adicionarOpcao}
                placeholder="+ Nova opção (Enter)"
              />
            )}
            {semOpcoes && <span className="fm-aviso">Adicione ao menos uma opção</span>}
          </div>
        )}

        <div className="fm-campo-foot">
          <label className={`fm-obrigatorio${podeEditar ? '' : ' disabled'}`}>
            <FmSwitch
              ligado={campo.obrigatorio}
              onChange={obrigatorio => onSalvar({ obrigatorio })}
              disabled={!podeEditar}
              rotulo={campo.obrigatorio ? 'Tornar opcional' : 'Tornar obrigatório'}
            />
            Obrigatório
          </label>
          {podeEditar && (
            <button type="button" className="fm-remover" onClick={onRemover} aria-label="Remover campo" title="Remover campo">
              <IconTrash />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
