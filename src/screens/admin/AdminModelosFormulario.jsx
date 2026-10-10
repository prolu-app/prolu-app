// Modelos de formulário da Prolu (/admin/modelos-formulario, migration_043).
// Só prolu_admin escreve (RLS). Lista à esquerda (nome, descrição, nº de
// campos, ativo/inativo); à direita nome, descrição, ativo e os campos — com
// o mesmo CampoCard do editor de formulários, sem o mapeamento do CRM (quem
// mapeia é o escritório, depois de criar o formulário a partir do modelo).
// Cada alteração grava na hora, como no editor de formulários.

import { useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { IconPlus, IconTrash } from '../../components/Icons.jsx'
import CampoTextoSalvo from '../../components/CampoTextoSalvo.jsx'
import { FmSwitch, FmConfirmar } from '../Formularios.jsx'
import { CampoCard, posicaoNoAlvo } from '../FormularioEditor.jsx'
import '../Formularios.css'
import './AdminModelosPrecificacao.css'
import './AdminModelosFormulario.css'
import PageHeader, { PageContainer } from '../../components/PageHeader.jsx'

export default function AdminModelosFormulario() {
  const toast = useToast()
  const [modelos, setModelos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selecionadoId, setSelecionadoId] = useState(null)
  const [campos, setCampos] = useState([])
  const [carregandoCampos, setCarregandoCampos] = useState(false)
  const [modalNovo, setModalNovo] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [criando, setCriando] = useState(false)
  const [excluindo, setExcluindo] = useState(null) // modelo a excluir (confirmação)
  const [ocupado, setOcupado] = useState(false)
  const [adicionando, setAdicionando] = useState(false)
  const [focoId, setFocoId] = useState(null)
  // arrastar (mesmo esquema do editor de formulários)
  const [armadoId, setArmadoId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const modelo = modelos.find(m => m.id === selecionadoId) || null

  useEffect(() => { carregarModelos() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!armadoId) return
    const desarmar = () => setArmadoId(null)
    window.addEventListener('mouseup', desarmar)
    return () => window.removeEventListener('mouseup', desarmar)
  }, [armadoId])

  async function carregarModelos() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('form_templates')
      .select('id, nome, descricao, ativo, ordem, form_template_campos(count)')
      .order('ordem').order('nome')
    if (error) { console.error('[modelos-formulario] carregar', error); toast('Erro ao carregar modelos') }
    const lista = (data || []).map(m => ({ ...m, qtdCampos: m.form_template_campos?.[0]?.count ?? 0 }))
    setModelos(lista)
    setLoading(false)
    if (lista.length && !selecionadoId) selecionar(lista[0].id)
  }

  async function selecionar(id) {
    setSelecionadoId(id)
    setCarregandoCampos(true)
    const { data, error } = await supabase.from('form_template_campos').select('*').eq('template_id', id).order('ordem')
    if (error) toast('Erro ao carregar os campos do modelo')
    setCampos(data || [])
    setCarregandoCampos(false)
  }

  const contar = (id, n) => setModelos(prev => prev.map(m => (m.id === id ? { ...m, qtdCampos: n } : m)))

  // ── modelo ──
  async function criarModelo() {
    const nome = nomeNovo.trim()
    if (!nome || criando) return
    setCriando(true)
    const ordem = modelos.reduce((max, m) => Math.max(max, m.ordem + 1), 0)
    const { data, error } = await supabase.from('form_templates')
      .insert({ nome, ordem }).select('id, nome, descricao, ativo, ordem').single()
    setCriando(false)
    if (error || !data) { console.error('[modelos-formulario] criar', error); toast('Erro ao criar modelo'); return }
    setModelos(prev => [...prev, { ...data, qtdCampos: 0 }])
    setModalNovo(false)
    setNomeNovo('')
    selecionar(data.id)
  }

  async function salvarModelo(patch) {
    const id = selecionadoId
    const anterior = modelos
    setModelos(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)))
    const { error } = await supabase.from('form_templates').update(patch).eq('id', id)
    if (error) { setModelos(anterior); toast('Não foi possível salvar o modelo'); return false }
    return true
  }

  async function excluirModelo() {
    const alvo = excluindo
    setOcupado(true)
    const { error } = await supabase.from('form_templates').delete().eq('id', alvo.id)
    setOcupado(false)
    if (error) { toast('Não foi possível excluir o modelo'); return }
    setExcluindo(null)
    const restantes = modelos.filter(m => m.id !== alvo.id)
    setModelos(restantes)
    toast('Modelo excluído')
    if (selecionadoId === alvo.id) {
      setCampos([])
      setSelecionadoId(null)
      if (restantes.length) selecionar(restantes[0].id)
    }
  }

  // ── campos (form_template_campos) ──
  async function adicionarCampo() {
    if (adicionando || !modelo) return
    setAdicionando(true)
    const { data, error } = await supabase.from('form_template_campos')
      .insert({ template_id: modelo.id, label: '', tipo: 'text', obrigatorio: false, ordem: campos.length, opcoes: [] })
      .select('*').single()
    setAdicionando(false)
    if (error || !data) { console.error('[modelos-formulario] adicionar campo', error); toast('Não foi possível adicionar o campo'); return }
    setCampos(prev => [...prev, data])
    contar(modelo.id, campos.length + 1)
    setFocoId(data.id)
  }

  async function salvarCampo(campoId, patch) {
    const { crm_coluna_id, ...dados } = patch // modelo não tem coluna do CRM
    if (!Object.keys(dados).length) return
    const anterior = campos
    setCampos(prev => prev.map(c => (c.id === campoId ? { ...c, ...dados } : c)))
    const { error } = await supabase.from('form_template_campos').update(dados).eq('id', campoId)
    if (error) { setCampos(anterior); toast('Não foi possível salvar o campo') }
  }

  async function removerCampo(campoId) {
    const anterior = campos
    const restantes = campos.filter(c => c.id !== campoId).map((c, i) => ({ ...c, ordem: i }))
    setCampos(restantes)
    const { error } = await supabase.from('form_template_campos').delete().eq('id', campoId)
    if (error) { setCampos(anterior); toast('Não foi possível remover o campo'); return }
    contar(modelo.id, restantes.length)
    await gravarOrdem(anterior, restantes)
  }

  async function gravarOrdem(antes, depois) {
    const mudaram = depois.filter((c, i) => antes.find(x => x.id === c.id)?.ordem !== i)
    const res = await Promise.all(mudaram.map(c => supabase.from('form_template_campos').update({ ordem: c.ordem }).eq('id', c.id)))
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
    gravarOrdem(campos, reordenada)
  }
  function mover(campoId, delta) {
    const i = campos.findIndex(c => c.id === campoId)
    const j = i + delta
    if (i === -1 || j < 0 || j >= campos.length) return
    reordenar(campoId, campos[j].id, delta < 0 ? 'before' : 'after')
  }
  function fimDoArraste() { setDragId(null); setDragOver(null); setArmadoId(null) }

  return (
    <PageContainer>
      <PageHeader
        titulo="Modelos de formulário"
        descricao="Modelos Prolu — os ativos aparecem para todos os escritórios ao criar um formulário."
        acoes={<button className="btn-primary" onClick={() => setModalNovo(true)}><IconPlus /> Novo modelo</button>}
      />

      {loading ? (
        <p className="amp-empty">Carregando…</p>
      ) : modelos.length === 0 ? (
        <p className="amp-empty">Nenhum modelo de formulário cadastrado ainda.</p>
      ) : (
        <div className="amp-layout amf-layout">
          <div className="amp-sidebar" role="list" aria-label="Modelos de formulário">
            {modelos.map(m => (
              <button
                key={m.id} type="button" role="listitem"
                className={`amf-item${m.id === selecionadoId ? ' active' : ''}${m.ativo ? '' : ' inativo'}`}
                onClick={() => selecionar(m.id)} aria-current={m.id === selecionadoId || undefined}
              >
                <span className="amf-item-nome">{m.nome}</span>
                {m.descricao && <span className="amf-item-desc">{m.descricao}</span>}
                <span className="amf-item-meta">
                  {m.qtdCampos} {m.qtdCampos === 1 ? 'campo' : 'campos'}
                  <span className={`pill ${m.ativo ? 'pill-green' : 'pill-gray'}`}>{m.ativo ? 'Ativo' : 'Inativo'}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="amp-content">
            {!modelo ? null : (
              <>
                <div className="fm-publico amf-dados">
                  <div className="fm-publico-row">
                    <span className="fm-publico-label">Nome</span>
                    <CampoTextoSalvo
                      key={`nome-${modelo.id}`} className="fm-pos-input" valor={modelo.nome} obrigatorio maxLength={120}
                      aria-label="Nome do modelo" onSalvar={nome => salvarModelo({ nome }).then(ok => ok && toast('Nome salvo'))}
                    />
                  </div>
                  <div className="fm-publico-row">
                    <span className="fm-publico-label">Descrição</span>
                    <CampoTextoSalvo
                      key={`desc-${modelo.id}`} multilinha rows={2} className="fm-pos-input" valor={modelo.descricao || ''} maxLength={300}
                      placeholder="Para que serve — aparece para o escritório ao escolher o modelo" aria-label="Descrição do modelo"
                      onSalvar={descricao => salvarModelo({ descricao: descricao || null }).then(ok => ok && toast('Descrição salva'))}
                    />
                  </div>
                  <div className="fm-publico-row">
                    <span className="fm-publico-label">Disponível</span>
                    <FmSwitch
                      ligado={modelo.ativo} rotulo={modelo.ativo ? 'Desativar modelo' : 'Ativar modelo'}
                      onChange={ativo => salvarModelo({ ativo }).then(ok => ok && toast(ativo ? 'Modelo ativado' : 'Modelo desativado'))}
                    />
                    <span className="fm-status-texto">{modelo.ativo ? 'Ativo — aparece para os escritórios' : 'Inativo — escondido dos escritórios'}</span>
                  </div>
                  <div className="amf-excluir">
                    <button type="button" className="fm-link-btn amf-excluir-btn" onClick={() => setExcluindo(modelo)}>
                      <IconTrash /> Excluir modelo
                    </button>
                  </div>
                </div>

                <div className="fm-section-title amf-campos-titulo">Campos</div>
                {carregandoCampos ? (
                  <p className="amp-empty">Carregando…</p>
                ) : (
                  <>
                    {campos.length === 0 && <p className="fm-empty fm-empty-inline">Nenhum campo ainda. Adicione a primeira pergunta do modelo.</p>}
                    <div className="fm-campos amf-campos">
                      {campos.map((c, i) => (
                        <CampoCard
                          key={c.id} campo={c} indice={i} total={campos.length} podeEditar semCrm
                          focar={focoId === c.id} onFocado={() => setFocoId(null)}
                          onSalvar={patch => salvarCampo(c.id, patch)}
                          onRemover={() => removerCampo(c.id)}
                          onMover={delta => mover(c.id, delta)}
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
                    <button className="fm-add-campo" onClick={adicionarCampo} disabled={adicionando}>
                      <IconPlus /> {adicionando ? 'Adicionando…' : 'Adicionar campo'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalNovo(false) }}>
          <div className="modal">
            <div className="modal-title">Novo modelo de formulário</div>
            <div className="modal-field">
              <label className="modal-label" htmlFor="amf-nome-novo">Nome do modelo</label>
              <input
                id="amf-nome-novo" className="modal-input" autoFocus value={nomeNovo} maxLength={120}
                onChange={e => setNomeNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && criarModelo()}
                placeholder="Ex.: Orçamento — Interiores"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalNovo(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criarModelo} disabled={criando || !nomeNovo.trim()}>{criando ? 'Criando…' : 'Criar'}</button>
            </div>
          </div>
        </div>
      )}

      {excluindo && (
        <FmConfirmar
          titulo={`Excluir "${excluindo.nome}"?`}
          texto="O modelo e os campos dele serão apagados. Formulários já criados a partir dele não mudam."
          rotulo="Excluir" perigo ocupado={ocupado}
          onConfirmar={excluirModelo} onCancelar={() => setExcluindo(null)}
        />
      )}
    </PageContainer>
  )
}
