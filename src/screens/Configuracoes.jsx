import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useAuth, roleValido } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconTrash, IconClose } from '../components/Icons.jsx'
import './Configuracoes.css'

const ROLE_LABEL = { prolu_admin: 'Prolu', master: 'Master', gestor: 'Gestor', comum: 'Colaborador' }
const ROLE_PILL = { prolu_admin: 'pill-dark', master: 'pill-dark', gestor: 'pill-blue', comum: 'pill-gray' }

function RolePill({ role }) {
  return <span className={`pill ${ROLE_PILL[role] || 'pill-gray'}`}>{ROLE_LABEL[role] || role}</span>
}

// Papéis que cada nível de acesso pode atribuir a outra pessoa. Master
// atribui os três; Gestor não pode promover ninguém a Master.
function assignableRoles(isEmpresaMaster, isGestor) {
  if (isEmpresaMaster) return ['master', 'gestor', 'comum']
  if (isGestor) return ['gestor', 'comum']
  return []
}

export default function Configuracoes() {
  const { user, isEmpresaMaster, isGestor, isGestorOuSuperior, activeEmpresaId, refreshUser } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabs = useMemo(() => ([
    { key: 'conta', label: 'Conta', show: true },
    { key: 'equipe', label: 'Equipe', show: isGestorOuSuperior },
    { key: 'escritorio', label: 'Escritório', show: isEmpresaMaster },
  ].filter((t) => t.show)), [isGestorOuSuperior, isEmpresaMaster])

  const requested = searchParams.get('tab')
  const tab = tabs.some((t) => t.key === requested) ? requested : 'conta'

  function goTab(key) {
    setSearchParams(key === 'conta' ? {} : { tab: key })
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Configurações</div>
        <div className="page-sub">Sua conta, sua equipe e o seu escritório na Prolu.</div>
      </div>

      <div className="cfg-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`cfg-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => goTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'conta' && <AbaConta user={user} refreshUser={refreshUser} toast={toast} />}
      {tab === 'equipe' && isGestorOuSuperior && (
        <AbaEquipe
          user={user}
          isEmpresaMaster={isEmpresaMaster}
          isGestor={isGestor}
          activeEmpresaId={activeEmpresaId}
          toast={toast}
        />
      )}
      {tab === 'escritorio' && isEmpresaMaster && (
        <AbaEscritorio user={user} activeEmpresaId={activeEmpresaId} refreshUser={refreshUser} toast={toast} />
      )}
    </>
  )
}

// ───────────────────────── Aba Conta ─────────────────────────

function AbaConta({ user, refreshUser, toast }) {
  const [nome, setNome] = useState(user?.nome || '')
  const [pwOpen, setPwOpen] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => { setNome(user?.nome || '') }, [user?.nome])

  async function salvarNome() {
    const valor = nome.trim()
    if (!valor || valor === user?.nome) { setNome(user?.nome || ''); return }
    if (!supabaseReady || !user?.id) { toast('Nome atualizado (modo demonstração)'); return }
    const { error } = await supabase.from('usuarios').update({ nome: valor }).eq('id', user.id)
    if (error) { toast('Não foi possível salvar o nome'); setNome(user?.nome || ''); return }
    toast('Nome atualizado')
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

// ───────────────────────── Aba Equipe ─────────────────────────

function AbaEquipe({ user, isEmpresaMaster, isGestor, activeEmpresaId, toast }) {
  const [usuarios, setUsuarios] = useState([])
  const [convites, setConvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [form, setForm] = useState({ nome: '', email: '', role: 'comum' })
  const [resendingIds, setResendingIds] = useState(() => new Set())

  const options = assignableRoles(isEmpresaMaster, isGestor)

  useEffect(() => { carregar() }, [activeEmpresaId])

  async function carregar() {
    if (!supabaseReady || !activeEmpresaId) { setLoading(false); return }
    setLoading(true)
    const [{ data: us, error: usErr }, { data: cv, error: cvErr }] = await Promise.all([
      supabase.from('usuarios').select('id, nome, email, role').eq('empresa_id', activeEmpresaId),
      supabase.from('convites').select('id, nome, email, role, status, convidado_por').eq('empresa_id', activeEmpresaId).eq('status', 'pendente'),
    ])
    if (usErr) console.error('[Equipe] Erro ao carregar usuários:', usErr)
    if (cvErr) console.error('[Equipe] Erro ao carregar convites:', cvErr)
    if (usErr || cvErr) toast('Não foi possível carregar a equipe por completo')
    setUsuarios(us || [])
    setConvites(cv || [])
    setLoading(false)
  }

  function abrirConvite() {
    setForm({ nome: '', email: '', role: options[options.length - 1] || 'comum' })
    setInviteOpen(true)
  }

  async function convidar() {
    if (!form.email.trim()) { toast('Informe o e-mail'); return }
    if (!roleValido(user.role, form.role)) { toast('Você não pode atribuir essa permissão'); return }

    setInviteBusy(true)
    // A Edge Function dispara o e-mail de convite pelo Supabase Auth e só
    // então grava a linha em `convites` — mantém as duas coisas em sincronia
    // sem expor a service role key no front-end.
    const { error } = await supabase.functions.invoke('invite-user', {
      body: {
        email: form.email.trim().toLowerCase(),
        nome: form.nome.trim(),
        role: form.role,
        empresa_id: activeEmpresaId,
        convidado_por: user.id,
      },
    })
    setInviteBusy(false)

    if (error) { toast('Não foi possível enviar o convite'); return }

    setInviteOpen(false)
    setForm({ nome: '', email: '', role: options[options.length - 1] || 'comum' })
    toast('Convite enviado por email')
    carregar()
  }

  async function removerConvite(id) {
    await supabase.from('convites').delete().eq('id', id)
    toast('Convite removido')
    carregar()
  }

  async function reenviarConvite(c) {
    setResendingIds((prev) => new Set(prev).add(c.id))
    setTimeout(() => {
      setResendingIds((prev) => {
        const next = new Set(prev)
        next.delete(c.id)
        return next
      })
    }, 3000)

    const { error } = await supabase.functions.invoke('invite-user', {
      body: {
        email: c.email,
        nome: c.nome,
        role: c.role,
        empresa_id: activeEmpresaId,
        convidado_por: c.convidado_por,
      },
    })

    toast(error ? 'Não foi possível reenviar' : 'Convite reenviado')
  }

  async function alterarRole(usuarioId, role) {
    await supabase.from('usuarios').update({ role }).eq('id', usuarioId)
    setUsuarios((prev) => prev.map((u) => (u.id === usuarioId ? { ...u, role } : u)))
    setSelected((s) => (s && s.id === usuarioId ? { ...s, role } : s))
    toast('Permissão atualizada')
  }

  async function removerUsuario(usuarioId) {
    await supabase.from('usuarios').delete().eq('id', usuarioId)
    toast('Pessoa removida do escritório')
    setSelected(null)
    carregar()
  }

  return (
    <>
      <div className="page-header between cfg-eq-header">
        <div className="page-sub">Pessoas com acesso a {user?.empresa || 'seu escritório'}.</div>
        <button className="btn-primary" onClick={abrirConvite}><IconPlus /> Convidar pessoa</button>
      </div>

      {loading ? (
        <p className="eq-loading">Carregando…</p>
      ) : (
        <>
          <div className="eq-list">
            {usuarios.map((u) => (
              <button className="eq-row eq-row-btn" key={u.id} onClick={() => setSelected(u)}>
                <div className="eq-avatar">{(u.nome || u.email || '?').charAt(0).toUpperCase()}</div>
                <div className="eq-info">
                  <div className="eq-name">{u.nome || u.email}{u.id === user.id ? ' · Você' : ''}</div>
                  <div className="eq-email">{u.email}</div>
                </div>
                <RolePill role={u.role} />
              </button>
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
                    <RolePill role={c.role} />
                    <button
                      className="eq-resend-btn"
                      onClick={() => reenviarConvite(c)}
                      disabled={resendingIds.has(c.id)}
                    >
                      Reenviar
                    </button>
                    <button className="icon-btn" onClick={() => removerConvite(c.id)} aria-label="Cancelar convite"><IconTrash /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {selected && (
        <UsuarioDrawer
          usuario={selected}
          isSelf={selected.id === user.id}
          options={options}
          canEditRole={
            selected.id !== user.id
            && selected.role !== 'prolu_admin'
            && (isEmpresaMaster || (isGestor && selected.role !== 'master'))
          }
          canRemove={isEmpresaMaster && selected.id !== user.id && selected.role !== 'prolu_admin'}
          onClose={() => setSelected(null)}
          onChangeRole={(role) => alterarRole(selected.id, role)}
          onRemove={() => removerUsuario(selected.id)}
        />
      )}

      {inviteOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setInviteOpen(false) }}>
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
                {options.map((r) => (
                  <button
                    key={r}
                    className={`icon-color-pill${form.role === r ? ' selected' : ''}`}
                    onClick={() => setForm({ ...form, role: r })}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setInviteOpen(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={convidar} disabled={inviteBusy}>
                {inviteBusy ? 'Enviando…' : 'Convidar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function UsuarioDrawer({ usuario, isSelf, options, canEditRole, canRemove, onClose, onChangeRole, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="cfg-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="cfg-drawer" role="dialog" aria-modal="true" aria-label={usuario.nome || usuario.email}>
        <div className="cfgd-header">
          <div className="cfgd-title">{usuario.nome || usuario.email}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><IconClose /></button>
        </div>

        <div className="cfgd-body">
          <div className="cfg-field">
            <label className="modal-label">Nome</label>
            <div className="cfg-static">{usuario.nome || '—'}</div>
          </div>
          <div className="cfg-field">
            <label className="modal-label">E-mail</label>
            <div className="cfg-static">{usuario.email}</div>
          </div>
          <div className="cfg-field">
            <label className="modal-label">Permissão</label>
            {isSelf ? (
              <div className="cfg-static">Você · {ROLE_LABEL[usuario.role] || usuario.role}</div>
            ) : canEditRole ? (
              <select
                className="eq-role-select"
                value={usuario.role}
                onChange={(e) => onChangeRole(e.target.value)}
              >
                {options.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            ) : (
              <div className="cfg-static"><RolePill role={usuario.role} /></div>
            )}
            {!isSelf && !canEditRole && usuario.role !== 'prolu_admin' && (
              <div className="cfg-hint">Somente o Master pode alterar essa permissão.</div>
            )}
          </div>

          {canRemove && (
            confirmRemove ? (
              <div className="cfgd-confirm">
                <div className="cfg-hint">Remover {usuario.nome || usuario.email} do escritório? Essa ação não pode ser desfeita.</div>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={() => setConfirmRemove(false)}>Cancelar</button>
                  <button className="btn-danger" onClick={onRemove}>Remover</button>
                </div>
              </div>
            ) : (
              <button className="btn-danger cfgd-remove-btn" onClick={() => setConfirmRemove(true)}>Remover do escritório</button>
            )
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

// ───────────────────────── Aba Escritório ─────────────────────────

function AbaEscritorio({ user, activeEmpresaId, refreshUser, toast }) {
  const [empresaNome, setEmpresaNome] = useState(user?.empresa || '')

  useEffect(() => { setEmpresaNome(user?.empresa || '') }, [user?.empresa])

  async function salvarEmpresa() {
    const valor = empresaNome.trim()
    if (!valor || valor === user?.empresa) { setEmpresaNome(user?.empresa || ''); return }
    if (!supabaseReady || !activeEmpresaId) { toast('Escritório atualizado (modo demonstração)'); return }
    const { error } = await supabase.from('empresas').update({ nome: valor }).eq('id', activeEmpresaId)
    if (error) { toast('Não foi possível salvar o nome do escritório'); setEmpresaNome(user?.empresa || ''); return }
    toast('Escritório atualizado')
    refreshUser()
  }

  return (
    <div className="card cfg-card">
      <div className="cfg-field">
        <label className="modal-label">Nome do escritório</label>
        <input
          className="cfg-input"
          value={empresaNome}
          onChange={(e) => setEmpresaNome(e.target.value)}
          onBlur={salvarEmpresa}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
      </div>
      <div className="cfg-hint">Logo, cores e outras configurações avançadas chegam em breve.</div>
    </div>
  )
}
