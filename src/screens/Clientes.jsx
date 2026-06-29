import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconEdit, IconTrash, IconSearch, IconClose } from '../components/Icons.jsx'
import './Clientes.css'

const FORM_VAZIO = { nome: '', telefone: '', email: '' }

export default function Clientes() {
  const { user } = useAuth()
  const toast = useToast()

  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)   // null | 'novo' | { ...cliente }
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)  // id do cliente a excluir

  const nomeRef = useRef(null)

  useEffect(() => { carregar() }, [user?.empresaId])

  useEffect(() => {
    if (modal) setTimeout(() => nomeRef.current?.focus(), 60)
  }, [modal])

  async function carregar() {
    if (!supabaseReady || !user?.empresaId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, telefone, email, created_at')
      .eq('empresa_id', user.empresaId)
      .order('nome')
    if (error) toast('Erro ao carregar clientes')
    setClientes(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setModal('novo')
  }

  function abrirEdicao(c) {
    setForm({ nome: c.nome, telefone: c.telefone || '', email: c.email || '' })
    setModal(c)
  }

  function fecharModal() { setModal(null); setForm(FORM_VAZIO) }

  async function salvar() {
    if (!form.nome.trim()) { toast('O nome é obrigatório'); return }
    setSalvando(true)

    if (modal === 'novo') {
      const { error } = await supabase.from('clientes').insert({
        empresa_id: user.empresaId,
        nome: form.nome.trim(),
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
      })
      if (error) { toast('Erro ao salvar cliente'); setSalvando(false); return }
      toast('Cliente adicionado')
    } else {
      const { error } = await supabase.from('clientes').update({
        nome: form.nome.trim(),
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
      }).eq('id', modal.id)
      if (error) { toast('Erro ao atualizar cliente'); setSalvando(false); return }
      toast('Cliente atualizado')
    }

    setSalvando(false)
    fecharModal()
    carregar()
  }

  async function excluir(id) {
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) { toast('Erro ao excluir cliente'); return }
    toast('Cliente excluído')
    setConfirmDel(null)
    carregar()
  }

  const filtrados = clientes.filter((c) =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Clientes</div>
          <div className="page-sub">Base de clientes do escritório.</div>
        </div>
        <button className="btn-primary" onClick={abrirNovo}>
          <IconPlus /> Novo cliente
        </button>
      </div>

      <div className="cl-toolbar">
        <div className="cl-search">
          <IconSearch className="cl-search-icon" />
          <input
            className="cl-search-input"
            placeholder="Buscar por nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button className="cl-search-clear" onClick={() => setBusca('')} aria-label="Limpar busca">
              <IconClose />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="cl-empty">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="cl-empty">
          {busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}
        </p>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td className="cl-td-nome">{c.nome}</td>
                  <td className="cl-td-meta">{c.telefone || '—'}</td>
                  <td className="cl-td-meta">{c.email || '—'}</td>
                  <td className="cl-td-actions">
                    <button className="icon-btn" onClick={() => abrirEdicao(c)} aria-label="Editar">
                      <IconEdit />
                    </button>
                    <button className="icon-btn danger" onClick={() => setConfirmDel(c.id)} aria-label="Excluir">
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal novo / editar */}
      {modal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="modal">
            <div className="modal-title">{modal === 'novo' ? 'Novo cliente' : 'Editar cliente'}</div>

            <div className="modal-field">
              <label className="modal-label">Nome *</label>
              <input
                ref={nomeRef}
                className="modal-input"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && salvar()}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Telefone</label>
              <input
                className="modal-input"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && salvar()}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">E-mail</label>
              <input
                className="modal-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && salvar()}
                placeholder="cliente@email.com"
              />
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirm" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {confirmDel && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDel(null) }}>
          <div className="modal">
            <div className="modal-title">Excluir cliente</div>
            <p className="cl-confirm-text">Tem certeza? Essa ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => excluir(confirmDel)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
