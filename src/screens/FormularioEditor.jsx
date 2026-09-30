import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconBack, IconPlus, IconTrash, IconGrip, IconClose, IconChevronDown } from '../components/Icons.jsx'
import { FmSwitch } from './Formularios.jsx'
import './Formularios.css'

// Códigos em inglês no banco (igual crm_colunas.tipo), rótulo em português aqui.
const TIPOS = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'select', label: 'Seleção' },
]

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
      supabase.from('formularios').select('*').eq('id', id).maybeSingle(),
      supabase.from('formulario_campos').select('*').eq('formulario_id', id).order('ordem'),
    ])
    if (e1 || e2) { console.error('[formulario] carregar', e1 || e2); toast('Erro ao carregar formulário') }
    if (!f) setNaoEncontrado(true)
    setForm(f || null)
    setCampos(cs || [])
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
    if (error) { setCampos(anterior); toast('Não foi possível salvar o campo') }
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
        <div className="fm-editor-head-main">
          <CampoTextoSalvo
            className="fm-title-input"
            valor={form.nome}
            placeholder="Nome do formulário"
            disabled={!podeEditar}
            obrigatorio
            onSalvar={nome => salvarForm({ nome })}
          />
          <CampoTextoSalvo
            multilinha
            className="fm-desc-input"
            valor={form.descricao || ''}
            placeholder="Descrição (opcional)"
            disabled={!podeEditar}
            onSalvar={descricao => salvarForm({ descricao: descricao || null })}
          />
        </div>
        <div className="fm-status fm-editor-status">
          <FmSwitch
            ligado={form.ativo}
            onChange={ativo => salvarForm({ ativo }).then(ok => ok && toast(ativo ? 'Formulário ativado' : 'Formulário desativado'))}
            disabled={!podeEditar}
            rotulo={form.ativo ? 'Desativar formulário' : 'Ativar formulário'}
          />
          <span className={`pill ${form.ativo ? 'pill-green' : 'pill-gray'}`}>{form.ativo ? 'Ativo' : 'Inativo'}</span>
        </div>
      </div>

      <div className="fm-section-title">
        Campos <span className="fm-count">{campos.length}</span>
      </div>

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
    </>
  )
}

// Input que só grava no blur/Enter (e só se mudou) — mesmo padrão dos nomes no CRM/etapas
function CampoTextoSalvo({ valor, onSalvar, multilinha, obrigatorio, className, inputRef, ...resto }) {
  const [texto, setTexto] = useState(valor)
  useEffect(() => { setTexto(valor) }, [valor])
  function confirmar() {
    const limpo = texto.trim()
    if (obrigatorio && !limpo) { setTexto(valor); return }
    if (limpo !== (valor || '').trim()) onSalvar(limpo)
  }
  const props = {
    ...resto,
    ref: inputRef,
    className,
    value: texto,
    onChange: e => setTexto(e.target.value),
    onBlur: confirmar,
  }
  return multilinha
    ? <textarea rows={2} {...props} />
    : <input {...props} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setTexto(valor); e.target.blur() } }} />
}

function CampoCard({
  campo, indice, total, podeEditar, focar, onFocado, onSalvar, onRemover, onMover,
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

  const semOpcoes = campo.tipo === 'select' && opcoes.length === 0

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
            disabled={!podeEditar}
            onChange={e => onSalvar({ tipo: e.target.value })}
            aria-label="Tipo do campo"
          >
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {campo.tipo === 'select' && (
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
