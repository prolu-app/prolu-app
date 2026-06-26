import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconTrash } from '../components/Icons.jsx'
import './Avisos.css'

const CORES = ['green', 'orange', 'violet', 'blue']
const COR_LABELS = { green: 'Verde', orange: 'Laranja', violet: 'Roxo', blue: 'Azul' }
const EMPTY_FORM = { texto: '', cor: 'green', link: '', link_texto: '', link_externo: false }

function isAtivo(aviso) {
  if (!aviso.ativo_ate) return true
  return aviso.ativo_ate >= new Date().toISOString().slice(0, 10)
}

export default function Avisos() {
  const { isProluAdmin } = useAuth()
  const toast = useToast()
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    if (!supabaseReady) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('avisos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { toast('Erro ao carregar avisos'); setLoading(false); return }
    setAvisos(data || [])
    setLoading(false)
  }

  async function criar() {
    if (!form.texto.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('avisos').insert({
      texto: form.texto.trim(),
      cor: form.cor,
      link: form.link.trim() || null,
      link_texto: form.link_texto.trim() || null,
      link_externo: form.link_externo,
    }).select('*').single()
    setSaving(false)
    if (error) { toast('Erro ao criar aviso'); return }
    setAvisos((prev) => [data, ...prev])
    setModal(false)
    setForm(EMPTY_FORM)
    toast('Aviso criado')
  }

  async function toggleAtivo(aviso) {
    const novoAtivoAte = isAtivo(aviso) ? '2000-01-01' : null
    const { error } = await supabase.from('avisos').update({ ativo_ate: novoAtivoAte }).eq('id', aviso.id)
    if (error) { toast('Erro ao atualizar aviso'); return }
    setAvisos((prev) => prev.map((a) => a.id === aviso.id ? { ...a, ativo_ate: novoAtivoAte } : a))
    toast(novoAtivoAte ? 'Aviso desativado' : 'Aviso ativado')
  }

  async function excluir(id) {
    if (!window.confirm('Excluir este aviso permanentemente?')) return
    const { error } = await supabase.from('avisos').delete().eq('id', id)
    if (error) { toast('Erro ao excluir'); return }
    setAvisos((prev) => prev.filter((a) => a.id !== id))
    toast('Aviso excluído')
  }

  if (!isProluAdmin) return null

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Avisos</div>
          <div className="page-sub">Banners exibidos na tela Início para todos os usuários.</div>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setModal(true) }}>
          <IconPlus /> Novo aviso
        </button>
      </div>

      {loading ? (
        <div className="avisos-empty">Carregando…</div>
      ) : avisos.length === 0 ? (
        <div className="avisos-empty">Nenhum aviso cadastrado.</div>
      ) : (
        <div className="avisos-list">
          {avisos.map((a) => {
            const ativo = isAtivo(a)
            return (
              <div key={a.id} className={`aviso-card aviso-${a.cor}${ativo ? '' : ' aviso-inativo'}`}>
                <span className="aviso-dot" />
                <div className="aviso-body">
                  <p className="aviso-texto">{a.texto}</p>
                  {a.link && (
                    <p className="aviso-link-info">
                      {a.link_texto && <span className="aviso-link-label">{a.link_texto} →</span>}
                      <span className="aviso-link-url">{a.link}</span>
                      {a.link_externo && <span className="aviso-ext-badge">externo</span>}
                    </p>
                  )}
                </div>
                <div className="aviso-actions">
                  <button
                    className={`aviso-toggle${ativo ? ' ativo' : ''}`}
                    onClick={() => toggleAtivo(a)}
                  >
                    {ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button className="aviso-del" onClick={() => excluir(a.id)} aria-label="Excluir aviso">
                    <IconTrash />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal">
            <div className="modal-title">Novo aviso</div>

            <div className="modal-field">
              <label className="modal-label">Texto do aviso *</label>
              <textarea
                className="modal-input"
                value={form.texto}
                onChange={(e) => setForm({ ...form, texto: e.target.value })}
                placeholder="Ex: Aula nova no ar: Como lidar com objeções de preço."
                rows={3}
                autoFocus
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Cor</label>
              <div className="cor-pills">
                {CORES.map((c) => (
                  <button
                    key={c}
                    className={`cor-pill cor-pill-${c}${form.cor === c ? ' selected' : ''}`}
                    onClick={() => setForm({ ...form, cor: c })}
                  >
                    {COR_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">Texto do link (opcional)</label>
              <input
                className="modal-input"
                value={form.link_texto}
                onChange={(e) => setForm({ ...form, link_texto: e.target.value })}
                placeholder="Ex: Assistir agora"
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">URL do link (opcional)</label>
              <input
                className="modal-input"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="/base-conhecimento ou https://…"
              />
            </div>

            <div className="modal-field modal-check-row">
              <input
                type="checkbox"
                id="link_externo"
                checked={form.link_externo}
                onChange={(e) => setForm({ ...form, link_externo: e.target.checked })}
              />
              <label htmlFor="link_externo">Abrir link em nova aba (externo)</label>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criar} disabled={saving || !form.texto.trim()}>
                {saving ? 'Salvando…' : 'Criar aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
