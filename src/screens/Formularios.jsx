import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus } from '../components/Icons.jsx'
import { slugify, comSufixo } from '../utils/slug.js'
import './Formularios.css'

// Formulários do escritório: builder (Fase 1) + link público /f/:slug (Fase 2).
// Tabelas formularios / formulario_campos — migrations 025 e 026.

function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
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

export default function Formularios() {
  const { activeEmpresaId, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [descNovo, setDescNovo] = useState('')
  const [criando, setCriando] = useState(false)

  // prolu_admin visitando outro escritório só lê (RLS da migration_025)
  const podeEditar = activeEmpresaId != null && activeEmpresaId === user?.empresaId

  useEffect(() => { carregar() }, [activeEmpresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('formularios')
      .select('id, nome, descricao, slug, ativo, updated_at, formulario_campos(count)')
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

  async function criar() {
    if (!nomeNovo.trim() || criando) return
    setCriando(true)
    // endereço público gerado do nome; é único no sistema todo (outro
    // escritório pode já ter usado) — em colisão (23505) tenta com sufixo
    const base = slugify(nomeNovo)
    let data = null, error = null
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      ;({ data, error } = await supabase
        .from('formularios')
        .insert({ empresa_id: activeEmpresaId, nome: nomeNovo.trim(), descricao: descNovo.trim() || null, slug: tentativa ? comSufixo(base) : base })
        .select('id')
        .single())
      if (error?.code !== '23505') break
    }
    setCriando(false)
    if (error || !data) { console.error('[formularios] criar', error); toast('Erro ao criar formulário'); return }
    navigate(`/formularios/${data.id}`)
  }

  function fecharModal() {
    setModalNovo(false)
    setNomeNovo('')
    setDescNovo('')
  }

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Formulários</div>
          <div className="page-sub">Formulários de captação do escritório — um para cada origem, se quiser.</div>
        </div>
        {podeEditar && (
          <button className="btn-primary" onClick={() => setModalNovo(true)}>
            <IconPlus /> Novo formulário
          </button>
        )}
      </div>

      {!podeEditar && activeEmpresaId && (
        <p className="fm-readonly-note">Formulários de outro escritório — somente leitura.</p>
      )}

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
              </tr>
            </thead>
            <tbody>
              {lista.map(f => (
                <tr key={f.id} className="fm-row" onClick={() => navigate(`/formularios/${f.id}`)}>
                  <td>
                    <div className="fm-nome">{f.nome}</div>
                    {f.descricao && <div className="fm-desc">{f.descricao}</div>}
                    <div className="fm-slug">/f/{f.slug}</div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalNovo && (
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
              <button className="btn-cancel" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirm" onClick={criar} disabled={criando || !nomeNovo.trim()}>
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
