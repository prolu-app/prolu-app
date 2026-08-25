import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import './Configuracoes.css'

export default function Configuracoes() {
  const { user, isEmpresaMaster, activeEmpresaId, refreshUser } = useAuth()
  const toast = useToast()

  const [nome, setNome] = useState(user?.nome || '')
  const [empresaNome, setEmpresaNome] = useState(user?.empresa || '')
  const [pwOpen, setPwOpen] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => { setNome(user?.nome || '') }, [user?.nome])
  useEffect(() => { setEmpresaNome(user?.empresa || '') }, [user?.empresa])

  async function salvarNome() {
    const valor = nome.trim()
    if (!valor || valor === user?.nome) { setNome(user?.nome || ''); return }
    if (!supabaseReady || !user?.id) { toast('Nome atualizado (modo demonstração)'); return }
    const { error } = await supabase.from('usuarios').update({ nome: valor }).eq('id', user.id)
    if (error) { toast('Não foi possível salvar o nome'); setNome(user?.nome || ''); return }
    toast('Nome atualizado')
    refreshUser()
  }

  async function salvarEmpresa() {
    const valor = empresaNome.trim()
    if (!valor || valor === user?.empresa) { setEmpresaNome(user?.empresa || ''); return }
    if (!supabaseReady || !activeEmpresaId) { toast('Escritório atualizado (modo demonstração)'); return }
    const { error } = await supabase.from('empresas').update({ nome: valor }).eq('id', activeEmpresaId)
    if (error) { toast('Não foi possível salvar o nome do escritório'); setEmpresaNome(user?.empresa || ''); return }
    toast('Escritório atualizado')
    refreshUser()
  }

  function abrirModalSenha() {
    setPw1('')
    setPw2('')
    setPwOpen(true)
  }

  async function salvarSenha() {
    if (pw1.length < 6) { toast('A senha precisa ter pelo menos 6 caracteres'); return }
    if (pw1 !== pw2) { toast('As senhas não coincidem'); return }
    if (!supabaseReady) { toast('Senha atualizada (modo demonstração)'); setPwOpen(false); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setSavingPw(false)
    if (error) { toast('Não foi possível alterar a senha'); return }
    toast('Senha alterada com sucesso')
    setPwOpen(false)
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Configurações</div>
        <div className="page-sub">Sua conta e o seu escritório na Prolu.</div>
      </div>

      <div className="section-title">Conta</div>
      <div className="card cfg-card">
        <div className="cfg-field">
          <label className="modal-label">Nome</label>
          <input
            className="cfg-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </div>
        <div className="cfg-field">
          <label className="modal-label">E-mail</label>
          <div className="cfg-static">{user?.email}</div>
        </div>
        <button className="btn-cancel cfg-pw-btn" onClick={abrirModalSenha}>Alterar senha</button>
      </div>

      <div className="section-title">Escritório</div>
      <div className="card cfg-card">
        <div className="cfg-field">
          <label className="modal-label">Nome do escritório</label>
          {isEmpresaMaster ? (
            <input
              className="cfg-input"
              value={empresaNome}
              onChange={(e) => setEmpresaNome(e.target.value)}
              onBlur={salvarEmpresa}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
          ) : (
            <div className="cfg-static">{user?.empresa || '—'}</div>
          )}
        </div>
        {!isEmpresaMaster && (
          <div className="cfg-hint">Apenas o administrador do escritório pode alterar este nome.</div>
        )}
      </div>

      {pwOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPwOpen(false) }}>
          <div className="modal">
            <div className="modal-title">Alterar senha</div>
            <div className="modal-field">
              <label className="modal-label">Nova senha</label>
              <input
                className="modal-input"
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Confirmar senha</label>
              <input
                className="modal-input"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Repita a nova senha"
                onKeyDown={(e) => { if (e.key === 'Enter') salvarSenha() }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setPwOpen(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={salvarSenha} disabled={savingPw}>
                {savingPw ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
