import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconTrash } from '../components/Icons.jsx'
import './Equipe.css'

export default function Equipe() {
  const { user, isEmpresaMaster } = useAuth()
  const toast = useToast()
  const [usuarios, setUsuarios] = useState([])
  const [convites, setConvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ email: '', nome: '', role: 'comum' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    if (!supabaseReady || !user?.empresaId) { setLoading(false); return }
    setLoading(true)
    const [{ data: us }, { data: cv }] = await Promise.all([
      supabase.from('usuarios').select('id, nome, email, role').eq('empresa_id', user.empresaId),
      supabase.from('convites').select('id, nome, email, role, status').eq('empresa_id', user.empresaId).eq('status', 'pendente'),
    ])
    setUsuarios(us || [])
    setConvites(cv || [])
    setLoading(false)
  }

  async function convidar() {
    if (!form.email.trim()) { toast('Informe o e-mail'); return }
    const { error } = await supabase.from('convites').insert({
      empresa_id: user.empresaId,
      email: form.email.trim().toLowerCase(),
      nome: form.nome.trim() || null,
      role: form.role,
      convidado_por: user.id,
    })
    if (error) {
      toast(error.code === '23505' ? 'Esse e-mail já foi convidado' : 'Não foi possível convidar')
      return
    }
    setModalOpen(false)
    setForm({ email: '', nome: '', role: 'comum' })
    toast('Convite criado — compartilhe o acesso do app com a pessoa')
    carregar()
  }

  async function removerConvite(id) {
    await supabase.from('convites').delete().eq('id', id)
    toast('Convite removido')
    carregar()
  }

  async function alterarRole(usuarioId, role) {
    await supabase.from('usuarios').update({ role }).eq('id', usuarioId)
    toast('Permissão atualizada')
    carregar()
  }

  if (!isEmpresaMaster) {
    return (
      <div className="page-header">
        <div className="page-title">Equipe</div>
        <div className="page-sub">Apenas o administrador do escritório pode gerenciar a equipe.</div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Equipe</div>
          <div className="page-sub">Pessoas com acesso a {user?.empresa || 'seu escritório'}.</div>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}><IconPlus /> Convidar pessoa</button>
      </div>

      {loading ? (
        <p className="eq-loading">Carregando…</p>
      ) : (
        <>
          <div className="eq-list">
            {usuarios.map((u) => (
              <div className="eq-row" key={u.id}>
                <div className="eq-avatar">{(u.nome || u.email || '?').charAt(0).toUpperCase()}</div>
                <div className="eq-info">
                  <div className="eq-name">{u.nome || u.email}</div>
                  <div className="eq-email">{u.email}</div>
                </div>
                {u.role === 'prolu_admin' ? (
                  <span className="eq-role-badge prolu">Prolu</span>
                ) : u.id === user.id ? (
                  <span className="eq-role-badge self">Você · {u.role === 'master' ? 'Admin' : 'Colaborador'}</span>
                ) : (
                  <select className="eq-role-select" value={u.role} onChange={(e) => alterarRole(u.id, e.target.value)}>
                    <option value="master">Admin</option>
                    <option value="comum">Colaborador</option>
                  </select>
                )}
              </div>
            ))}
          </div>

          {convites.length > 0 && (
            <>
              <div className="section-title eq-pending-title">Convites pendentes</div>
              <div className="eq-list">
                {convites.map((c) => (
                  <div className="eq-row pending" key={c.id}>
                    <div className="eq-avatar pending">{(c.nome || c.email).charAt(0).toUpperCase()}</div>
                    <div className="eq-info">
                      <div className="eq-name">{c.nome || c.email}</div>
                      <div className="eq-email">{c.email} · aguardando aceite</div>
                    </div>
                    <button className="icon-btn" onClick={() => removerConvite(c.id)} aria-label="Remover convite"><IconTrash /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <div className="modal-title">Convidar pessoa</div>
            <div className="modal-field">
              <label className="modal-label">Nome</label>
              <input className="modal-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome da pessoa" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">E-mail</label>
              <input className="modal-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pessoa@email.com" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Permissão</label>
              <div className="icon-color-pills">
                <button className={`icon-color-pill${form.role === 'comum' ? ' selected' : ''}`} onClick={() => setForm({ ...form, role: 'comum' })}>Colaborador</button>
                <button className={`icon-color-pill${form.role === 'master' ? ' selected' : ''}`} onClick={() => setForm({ ...form, role: 'master' })}>Admin</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={convidar}>Convidar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
