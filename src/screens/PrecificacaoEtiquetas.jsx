import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconBack, IconPlus, IconTrash } from '../components/Icons.jsx'
import './PrecificacaoEtiquetas.css'

export default function PrecificacaoEtiquetas() {
  const { activeEmpresaId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [etiquetas, setEtiquetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const criadaAgoraRef = useRef(null)

  useEffect(() => { carregar() }, [activeEmpresaId])

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('precificacao_etiquetas_cadastro')
      .select('id, nome')
      .eq('empresa_id', activeEmpresaId)
      .order('nome')
    if (error) toast('Erro ao carregar etiquetas')
    setEtiquetas(data || [])
    setLoading(false)
  }

  async function novaEtiqueta() {
    if (!supabaseReady || !activeEmpresaId) return
    setCriando(true)
    const { data, error } = await supabase
      .from('precificacao_etiquetas_cadastro')
      .insert({ empresa_id: activeEmpresaId, nome: 'Nova etiqueta' })
      .select('id, nome')
      .single()
    setCriando(false)
    if (error || !data) { toast('Erro ao criar etiqueta'); return }
    criadaAgoraRef.current = data.id
    setEtiquetas((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    setEditandoId(data.id)
  }

  async function renomear(etiquetaId, nome) {
    const limpo = nome.trim() || 'Sem nome'
    setEtiquetas((prev) => prev.map((e) => e.id === etiquetaId ? { ...e, nome: limpo } : e))
    setEditandoId(null)
    await supabase.from('precificacao_etiquetas_cadastro').update({ nome: limpo }).eq('id', etiquetaId)
  }

  async function excluir(etiquetaId) {
    setEtiquetas((prev) => prev.filter((e) => e.id !== etiquetaId))
    await supabase.from('precificacao_etiquetas_cadastro').delete().eq('id', etiquetaId)
  }

  return (
    <>
      <div className="pe-breadcrumb">
        <button onClick={() => navigate('/precificacao')}><IconBack /> Precificação</button>
      </div>

      <div className="page-header between">
        <div>
          <div className="page-title">Etiquetas</div>
          <div className="page-sub">Etiquetas reutilizáveis pra classificar suas precificações.</div>
        </div>
        <button className="btn-primary" onClick={novaEtiqueta} disabled={criando}>
          <IconPlus /> {criando ? 'Criando…' : 'Nova etiqueta'}
        </button>
      </div>

      {loading ? (
        <p className="pe-empty">Carregando…</p>
      ) : etiquetas.length === 0 ? (
        <p className="pe-empty">Nenhuma etiqueta cadastrada ainda.</p>
      ) : (
        <div className="pe-lista">
          {etiquetas.map((e) => (
            <div className="pe-item" key={e.id}>
              {editandoId === e.id ? (
                <input
                  className="pe-item-input"
                  autoFocus={criadaAgoraRef.current === e.id}
                  defaultValue={e.nome}
                  onFocus={(ev) => ev.target.select()}
                  onBlur={(ev) => renomear(e.id, ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') ev.target.blur() }}
                />
              ) : (
                <span className="pe-item-nome" onClick={() => setEditandoId(e.id)} title="Clique para editar">
                  {e.nome}
                </span>
              )}
              <button className="pe-item-del" onClick={() => excluir(e.id)} aria-label="Excluir etiqueta">
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
