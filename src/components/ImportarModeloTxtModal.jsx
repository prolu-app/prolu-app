import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import { useToast } from '../contexts/ToastContext.jsx'
import { IconClose, IconFile, IconSearch, IconAlert, IconBuilding, IconChevronRight } from './Icons.jsx'
import { parseModeloTxt } from '../utils/parseModeloTxt.js'
import { carregarModeloTree } from '../utils/modeloPrecificacaoTree.js'
import './ImportarModeloTxtModal.css'

// Grava a árvore parseada (etapas → tarefas → subtarefas) num modelo já
// existente (modeloId). Insere em 3 passadas (etapas, depois tarefas,
// depois subtarefas) casando pelo par (pai_id, ordem) em vez de confiar na
// ordem de retorno do INSERT — mesmo padrão de cautela do resto do app,
// que sempre reconsulta com .order('ordem') em vez de assumir a ordem do
// array devolvido pelo Supabase.
async function salvarEstruturaNoModelo(modeloId, etapasParseadas) {
  const etapasPayload = etapasParseadas.map((e, i) => ({ modelo_id: modeloId, nome: e.nome, ordem: i }))
  const { data: etapasIns, error: errEtapas } = await supabase
    .from('precificacao_modelo_etapas').insert(etapasPayload).select('id, ordem')
  if (errEtapas) throw errEtapas
  const etapaIdPorOrdem = Object.fromEntries(etapasIns.map((e) => [e.ordem, e.id]))

  const tarefasPayload = []
  etapasParseadas.forEach((e, ei) => {
    const etapaId = etapaIdPorOrdem[ei]
    e.tarefas.forEach((t, ti) => {
      tarefasPayload.push({ etapa_id: etapaId, nome: t.nome, horas_estimadas_soltas: 0, ordem: ti })
    })
  })
  let tarefaIdPorChave = {}
  if (tarefasPayload.length) {
    const { data: tarefasIns, error: errTarefas } = await supabase
      .from('precificacao_modelo_tarefas').insert(tarefasPayload).select('id, etapa_id, ordem')
    if (errTarefas) throw errTarefas
    tarefaIdPorChave = Object.fromEntries(tarefasIns.map((t) => [`${t.etapa_id}:${t.ordem}`, t.id]))
  }

  const subtarefasPayload = []
  etapasParseadas.forEach((e, ei) => {
    const etapaId = etapaIdPorOrdem[ei]
    e.tarefas.forEach((t, ti) => {
      const tarefaId = tarefaIdPorChave[`${etapaId}:${ti}`]
      t.subtarefas.forEach((st, sti) => {
        subtarefasPayload.push({ tarefa_id: tarefaId, nome: st.nome, horas_estimadas: 0, ordem: sti })
      })
    })
  })
  if (subtarefasPayload.length) {
    const { error: errSub } = await supabase.from('precificacao_modelo_subtarefas').insert(subtarefasPayload)
    if (errSub) throw errSub
  }
}

function contarItens(etapas) {
  let tarefas = 0
  let subtarefas = 0
  etapas.forEach((e) => {
    tarefas += e.tarefas.length
    e.tarefas.forEach((t) => { subtarefas += t.subtarefas.length })
  })
  return { etapas: etapas.length, tarefas, subtarefas }
}

// Wizard de importação de modelo de precificação via arquivo .txt.
// Só usado em /admin/modelos-precificacao (prolu_admin) — nunca aparece
// do lado do escritório. Fluxo: escolhe destino (Prolu global ou um
// escritório específico) → escolhe se cria modelo novo ou substitui um
// já existente daquele destino → seleciona o arquivo .txt → prévia da
// árvore, com aviso se for substituir conteúdo → confirma e grava.
export default function ImportarModeloTxtModal({ open, onClose, modelosProlu, onImported }) {
  const toast = useToast()

  const [step, setStep] = useState('destino') // 'destino' | 'arquivo' | 'preview'
  const [destino, setDestino] = useState(null) // 'prolu' | 'empresa'

  const [buscaEmpresa, setBuscaEmpresa] = useState('')
  const [empresas, setEmpresas] = useState([])
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false)
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null) // { id, nome }
  const [modelosEmpresa, setModelosEmpresa] = useState([])

  const [modoAlvo, setModoAlvo] = useState('novo') // 'novo' | 'existente'
  const [nomeNovo, setNomeNovo] = useState('')
  const [modeloExistenteId, setModeloExistenteId] = useState('')

  const [parseError, setParseError] = useState(null)
  const [arquivoNome, setArquivoNome] = useState('')
  const [etapasParseadas, setEtapasParseadas] = useState(null)
  const [etapasExistentesCount, setEtapasExistentesCount] = useState(0)
  const [carregandoPreview, setCarregandoPreview] = useState(false)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('destino')
    setDestino(null)
    setBuscaEmpresa('')
    setEmpresas([])
    setEmpresaSelecionada(null)
    setModelosEmpresa([])
    setModoAlvo('novo')
    setNomeNovo('')
    setModeloExistenteId('')
    setParseError(null)
    setArquivoNome('')
    setEtapasParseadas(null)
    setEtapasExistentesCount(0)
    setImportando(false)
  }, [open])

  async function buscarEmpresas(q) {
    setBuscaEmpresa(q)
    if (!q.trim()) { setEmpresas([]); return }
    setCarregandoEmpresas(true)
    const { data } = await supabase.from('empresas').select('id, nome').ilike('nome', `%${q.trim()}%`).order('nome').limit(8)
    setEmpresas(data || [])
    setCarregandoEmpresas(false)
  }

  async function selecionarEmpresa(emp) {
    setEmpresaSelecionada(emp)
    setEmpresas([])
    setBuscaEmpresa('')
    setModoAlvo('novo')
    setModeloExistenteId('')
    const { data } = await supabase.from('modelos_precificacao').select('id, nome').eq('empresa_id', emp.id).eq('is_prolu', false).order('nome')
    setModelosEmpresa(data || [])
  }

  const modelosAlvo = destino === 'prolu' ? (modelosProlu || []) : modelosEmpresa

  function podeAvancarDestino() {
    if (destino === 'prolu') return modoAlvo === 'novo' ? !!nomeNovo.trim() : !!modeloExistenteId
    if (destino === 'empresa') return !!empresaSelecionada && (modoAlvo === 'novo' ? !!nomeNovo.trim() : !!modeloExistenteId)
    return false
  }

  async function handleArquivoSelecionado(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.txt$/i.test(file.name)) {
      setParseError({ linha: 0, motivo: 'selecione um arquivo .txt' })
      return
    }
    setArquivoNome(file.name)
    setParseError(null)
    const texto = await file.text()
    const resultado = parseModeloTxt(texto)
    if (resultado.error) {
      setParseError(resultado.error)
      setEtapasParseadas(null)
      return
    }
    setEtapasParseadas(resultado.etapas)
    setCarregandoPreview(true)
    if (modoAlvo === 'existente' && modeloExistenteId) {
      const tree = await carregarModeloTree(modeloExistenteId)
      setEtapasExistentesCount(tree.length)
    } else {
      setEtapasExistentesCount(0)
    }
    setCarregandoPreview(false)
    setStep('preview')
  }

  async function confirmarImportacao() {
    setImportando(true)
    try {
      let modeloId = modeloExistenteId
      let modeloNome = modelosAlvo.find((m) => m.id === modeloExistenteId)?.nome

      if (modoAlvo === 'existente') {
        const { error: errDelete } = await supabase.from('precificacao_modelo_etapas').delete().eq('modelo_id', modeloId)
        if (errDelete) throw errDelete
      } else {
        const empresa_id = destino === 'empresa' ? empresaSelecionada.id : null
        const is_prolu = destino === 'prolu'
        const { data, error } = await supabase.from('modelos_precificacao')
          .insert({ empresa_id, is_prolu, nome: nomeNovo.trim() })
          .select('id, nome').single()
        if (error || !data) throw error || new Error('Falha ao criar modelo')
        modeloId = data.id
        modeloNome = data.nome
      }

      await salvarEstruturaNoModelo(modeloId, etapasParseadas)

      toast(destino === 'prolu' ? 'Modelo Prolu importado' : `Modelo importado para ${empresaSelecionada.nome}`)
      onImported?.({ destino, modelo: { id: modeloId, nome: modeloNome } })
      onClose()
    } catch (err) {
      toast('Erro ao importar modelo')
    } finally {
      setImportando(false)
    }
  }

  if (!open) return null

  const contagem = etapasParseadas ? contarItens(etapasParseadas) : null
  const vaiSubstituir = modoAlvo === 'existente' && etapasExistentesCount > 0

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal imt-modal">
        <div className="imt-header">
          <div className="modal-title">Importar modelo (.txt)</div>
          <button className="imt-close" onClick={onClose} aria-label="Fechar"><IconClose /></button>
        </div>

        {step === 'destino' && (
          <div className="imt-step">
            <label className="modal-label">Destino</label>
            <div className="imt-destino-opts">
              <button
                className={`imt-destino-card${destino === 'prolu' ? ' active' : ''}`}
                onClick={() => { setDestino('prolu'); setModoAlvo('novo'); setModeloExistenteId(''); setNomeNovo('') }}
              >
                <div className="imt-destino-title">Modelo Prolu</div>
                <div className="imt-destino-sub">Todos os escritórios</div>
              </button>
              <button
                className={`imt-destino-card${destino === 'empresa' ? ' active' : ''}`}
                onClick={() => { setDestino('empresa'); setModoAlvo('novo'); setModeloExistenteId(''); setNomeNovo(''); setEmpresaSelecionada(null) }}
              >
                <div className="imt-destino-title">Escritório específico</div>
                <div className="imt-destino-sub">Visível só pra ele</div>
              </button>
            </div>

            {destino === 'empresa' && !empresaSelecionada && (
              <div className="imt-field">
                <label className="modal-label">Buscar escritório</label>
                <div className="imt-search">
                  <IconSearch className="imt-search-icon" />
                  <input
                    className="modal-input imt-search-input"
                    placeholder="Nome do escritório…"
                    value={buscaEmpresa}
                    onChange={(e) => buscarEmpresas(e.target.value)}
                    autoFocus
                  />
                </div>
                {carregandoEmpresas && <p className="imt-hint">Buscando…</p>}
                {empresas.length > 0 && (
                  <div className="imt-empresa-list">
                    {empresas.map((emp) => (
                      <button key={emp.id} className="imt-empresa-item" onClick={() => selecionarEmpresa(emp)}>
                        <IconBuilding /> {emp.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {destino === 'empresa' && empresaSelecionada && (
              <div className="imt-field">
                <label className="modal-label">Escritório selecionado</label>
                <div className="imt-empresa-picked">
                  <span><IconBuilding /> {empresaSelecionada.nome}</span>
                  <button onClick={() => { setEmpresaSelecionada(null); setModelosEmpresa([]) }}>Trocar</button>
                </div>
              </div>
            )}

            {destino && (destino === 'prolu' || empresaSelecionada) && (
              <div className="imt-field">
                <label className="modal-label">Modelo</label>
                <div className="imt-modo-opts">
                  <label className="imt-radio">
                    <input type="radio" checked={modoAlvo === 'novo'} onChange={() => setModoAlvo('novo')} />
                    Criar novo modelo
                  </label>
                  <label className="imt-radio">
                    <input
                      type="radio"
                      checked={modoAlvo === 'existente'}
                      disabled={modelosAlvo.length === 0}
                      onChange={() => setModoAlvo('existente')}
                    />
                    Substituir um existente {modelosAlvo.length === 0 && '(nenhum ainda)'}
                  </label>
                </div>

                {modoAlvo === 'novo' ? (
                  <input
                    className="modal-input"
                    placeholder="Nome do modelo"
                    value={nomeNovo}
                    onChange={(e) => setNomeNovo(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <select className="modal-input imt-select" value={modeloExistenteId} onChange={(e) => setModeloExistenteId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {modelosAlvo.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={onClose}>Cancelar</button>
              <button className="btn-confirm" disabled={!podeAvancarDestino()} onClick={() => setStep('arquivo')}>
                Continuar <IconChevronRight />
              </button>
            </div>
          </div>
        )}

        {step === 'arquivo' && (
          <div className="imt-step">
            <p className="imt-hint">
              {destino === 'prolu' ? 'Modelo Prolu (todos os escritórios)' : `Escritório: ${empresaSelecionada?.nome}`}
              {' — '}
              {modoAlvo === 'novo' ? `novo modelo "${nomeNovo.trim()}"` : `substituindo "${modelosAlvo.find((m) => m.id === modeloExistenteId)?.nome}"`}
            </p>

            <label className="imt-file-drop">
              <IconFile />
              <span>{arquivoNome || 'Selecionar arquivo .txt'}</span>
              <input type="file" accept=".txt" onChange={handleArquivoSelecionado} hidden />
            </label>

            {parseError && (
              <div className="imt-error">
                <IconAlert />
                <div>
                  {parseError.linha > 0 ? <strong>Linha {parseError.linha}:</strong> : <strong>Erro:</strong>} {parseError.motivo}
                </div>
              </div>
            )}

            {carregandoPreview && <p className="imt-hint">Processando…</p>}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setStep('destino')}>Voltar</button>
            </div>
          </div>
        )}

        {step === 'preview' && etapasParseadas && (
          <div className="imt-step">
            <p className="imt-hint">
              {contagem.etapas} etapa(s), {contagem.tarefas} tarefa(s), {contagem.subtarefas} subtarefa(s) encontradas em {arquivoNome}.
            </p>

            {vaiSubstituir && (
              <div className="imt-warn">
                <IconAlert />
                <div>Esse modelo já tem {etapasExistentesCount} etapa(s) cadastrada(s). Importar vai <strong>substituir todo o conteúdo atual</strong>.</div>
              </div>
            )}

            <div className="imt-preview-tree">
              {etapasParseadas.map((e, ei) => (
                <div className="imt-preview-etapa" key={ei}>
                  <div className="imt-preview-etapa-nome">{e.nome}</div>
                  {e.tarefas.map((t, ti) => (
                    <div className="imt-preview-tarefa" key={ti}>
                      <div className="imt-preview-tarefa-nome">{t.nome}</div>
                      {t.subtarefas.map((st, sti) => (
                        <div className="imt-preview-sub" key={sti}>{st.nome}</div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setStep('arquivo')} disabled={importando}>Voltar</button>
              <button className="btn-confirm" onClick={confirmarImportacao} disabled={importando}>
                {importando ? 'Importando…' : vaiSubstituir ? 'Substituir e importar' : 'Importar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
