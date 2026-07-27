import { useState, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { IconPlus, IconCRM, IconHeart, IconBolt, IconAlert, IconStar, IconSearch, IconMoney, IconTarget, IconSave, IconCopy, IconTrash } from '../components/Icons.jsx'
import './ClienteIdeal.css'

const DEFAULT_COLOR = '#4CAF82'

function blankProfile(name = '') {
  return {
    id: crypto.randomUUID(), name, color: DEFAULT_COLOR, ageMin: 25, ageMax: 45,
    demografico: '', psicografico: '', gatilhos: '', dores: '', desejos: '',
    canais: [], ondeEncontrar: '', pagamento: [], orcamento: '', gap: '',
  }
}

function parseProfile(row) {
  return {
    id: row.id, name: row.nome || '', color: row.cor || DEFAULT_COLOR,
    ageMin: row.idade_min ?? 25, ageMax: row.idade_max ?? 45,
    demografico: row.demografico || '', psicografico: row.psicografico || '',
    gatilhos: row.gatilhos || '', dores: row.dores || '', desejos: row.desejos || '',
    canais: row.canais || [], ondeEncontrar: row.onde_encontrar || '',
    pagamento: row.pagamento || [], orcamento: row.orcamento || '', gap: row.gap || '',
  }
}

function toRow(p, empresaId) {
  return {
    id: p.id, empresa_id: empresaId, nome: p.name, cor: p.color,
    idade_min: p.ageMin, idade_max: p.ageMax,
    demografico: p.demografico, psicografico: p.psicografico,
    gatilhos: p.gatilhos, dores: p.dores, desejos: p.desejos,
    canais: p.canais, onde_encontrar: p.ondeEncontrar,
    pagamento: p.pagamento, orcamento: p.orcamento, gap: p.gap,
  }
}

export default function ClienteIdeal() {
  const toast = useToast()
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { carregar() }, [user?.empresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady || !user?.empresaId) {
      const p = blankProfile()
      setProfiles([p])
      setActiveId(p.id)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('icp_perfis')
      .select('*')
      .eq('empresa_id', user.empresaId)
      .order('created_at', { ascending: true })
    if (error) {
      toast('Não foi possível carregar o Cliente Ideal')
      const p = blankProfile()
      setProfiles([p])
      setActiveId(p.id)
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      const p = blankProfile()
      setProfiles([p])
      setActiveId(p.id)
      setLoading(false)
      return
    }

    const parsed = data.map(parseProfile)
    setProfiles(parsed)
    setActiveId(parsed[0].id)
    setLoading(false)
  }

  const profile = profiles.find((p) => p.id === activeId)

  async function persist(updatedProfile) {
    if (!supabaseReady || !user?.empresaId) return
    const { error } = await supabase.from('icp_perfis').upsert(toRow(updatedProfile, user.empresaId))
    if (error) toast('Não foi possível salvar')
  }

  function update(field, value) {
    setProfiles((prev) => prev.map((p) => (p.id === activeId ? { ...p, [field]: value } : p)))
    setDirty(true)
  }

  function salvarCampo() {
    if (!dirty) return
    setDirty(false)
    persist(profile)
  }

  function applyAndPersist(changes) {
    const updated = { ...profile, ...changes }
    setProfiles((prev) => prev.map((p) => (p.id === activeId ? updated : p)))
    persist(updated)
  }

  function changeAge(which, delta) {
    if (which === 'min') {
      applyAndPersist({ ageMin: Math.max(18, Math.min(profile.ageMax - 1, profile.ageMin + delta)) })
    } else {
      applyAndPersist({ ageMax: Math.max(profile.ageMin + 1, Math.min(70, profile.ageMax + delta)) })
    }
  }

  function togglePagamento(opt) {
    const has = profile.pagamento.includes(opt)
    applyAndPersist({ pagamento: has ? profile.pagamento.filter((x) => x !== opt) : [...profile.pagamento, opt] })
  }

  function addCanal(e) {
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    const val = e.target.value.trim().replace(',', '')
    if (!val) return
    applyAndPersist({ canais: [...profile.canais, val] })
    e.target.value = ''
  }
  function removeCanal(canal) {
    applyAndPersist({ canais: profile.canais.filter((c) => c !== canal) })
  }

  async function novoPerfil() {
    const novo = blankProfile('Novo perfil')
    if (!supabaseReady || !user?.empresaId) {
      setProfiles((prev) => [...prev, novo])
      setActiveId(novo.id)
      toast('Novo perfil criado — preencha os campos')
      return
    }
    const { data, error } = await supabase.from('icp_perfis').insert(toRow(novo, user.empresaId)).select('*').single()
    if (error) { toast('Não foi possível criar o perfil'); return }
    const parsed = parseProfile(data)
    setProfiles((prev) => [...prev, parsed])
    setActiveId(parsed.id)
    toast('Novo perfil criado — preencha os campos')
  }

  async function salvar() {
    await persist(profile)
    setDirty(false)
    toast('Cliente Ideal salvo ✓')
  }

  async function duplicarPerfil() {
    const copia = { ...profile, id: crypto.randomUUID(), name: profile.name ? `${profile.name} - cópia` : 'Cópia' }
    if (!supabaseReady || !user?.empresaId) {
      setProfiles((prev) => [...prev, copia])
      setActiveId(copia.id)
      toast('Perfil duplicado')
      return
    }
    const { data, error } = await supabase.from('icp_perfis').insert(toRow(copia, user.empresaId)).select('*').single()
    if (error) { toast('Não foi possível duplicar o perfil'); return }
    const parsed = parseProfile(data)
    setProfiles((prev) => [...prev, parsed])
    setActiveId(parsed.id)
    toast('Perfil duplicado')
  }

  async function apagarPerfil() {
    const id = activeId
    const remaining = profiles.filter((p) => p.id !== id)
    setConfirmDelete(false)
    if (remaining.length > 0) {
      setProfiles(remaining)
      setActiveId(remaining[0].id)
    } else {
      const p = blankProfile()
      setProfiles([p])
      setActiveId(p.id)
    }
    if (!supabaseReady || !user?.empresaId) { toast('Perfil apagado'); return }
    const { error } = await supabase.from('icp_perfis').delete().eq('id', id)
    if (error) { toast('Não foi possível apagar o perfil'); carregar(); return }
    toast('Perfil apagado')
  }

  if (loading) return (
    <div className="page-header">
      <div className="page-title">Cliente Ideal</div>
      <div className="page-sub">Carregando seus perfis…</div>
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div className="page-title">Cliente Ideal</div>
        <div className="page-sub">Defina com quem você quer trabalhar. Isso muda tudo na hora de comunicar, prospectar e fechar.</div>
      </div>

      {/* perfis */}
      <div className="profiles-bar">
        {profiles.map((p) => (
          p.id === activeId ? (
            <div className="profile-tab active" key={p.id}>
              <span className="tab-dot" style={{ background: p.color }} />
              <input
                className="profile-tab-input"
                style={{ width: `${Math.max(8, (p.name || 'Nome do perfil').length + 1)}ch` }}
                value={p.name}
                onChange={(e) => update('name', e.target.value)}
                onBlur={salvarCampo}
                placeholder="Nome do perfil"
              />
            </div>
          ) : (
            <button key={p.id} className="profile-tab inactive" onClick={() => setActiveId(p.id)}>
              <span className="tab-dot" style={{ background: p.color }} />
              {p.name || 'Sem nome'}
            </button>
          )
        ))}
        <button className="btn-new-profile" onClick={novoPerfil}><IconPlus /> Novo perfil</button>
      </div>

      {/* campos */}
      <div className="icp-grid">
        <ICPCard label="Perfil demográfico" hint="Quem são essas pessoas? Idade, estado civil, renda, onde vivem." icon={<IconCRM />} iconClass="icon-blue">
          <div>
            <div className="icp-label" style={{ marginBottom: 10 }}>Faixa etária</div>
            <div className="range-row">
              <div className="range-group">
                <button className="range-btn" onClick={() => changeAge('min', -1)} aria-label="Diminuir idade mínima">−</button>
                <div className="range-display">{profile.ageMin}<small>anos</small></div>
                <button className="range-btn" onClick={() => changeAge('min', 1)} aria-label="Aumentar idade mínima">+</button>
              </div>
              <span className="range-sep">até</span>
              <div className="range-group">
                <button className="range-btn" onClick={() => changeAge('max', -1)} aria-label="Diminuir idade máxima">−</button>
                <div className="range-display">{profile.ageMax}<small>anos</small></div>
                <button className="range-btn" onClick={() => changeAge('max', 1)} aria-label="Aumentar idade máxima">+</button>
              </div>
            </div>
          </div>
          <textarea className="icp-field" value={profile.demografico} onChange={(e) => update('demografico', e.target.value)} onBlur={salvarCampo} placeholder="Descreva quem são essas pessoas…" />
        </ICPCard>

        <ICPCard label="Perfil psicográfico" hint="Valores, estilo de vida, como tomam decisões." icon={<IconHeart />} iconClass="icon-violet">
          <textarea className="icp-field" value={profile.psicografico} onChange={(e) => update('psicografico', e.target.value)} onBlur={salvarCampo} placeholder="Valores, estilo de vida, como decidem…" />
        </ICPCard>

        <ICPCard label="Gatilhos de compra" hint="O que acontece na vida deles que os leva a procurar um arquiteto agora?" icon={<IconBolt />} iconClass="icon-orange">
          <textarea className="icp-field" value={profile.gatilhos} onChange={(e) => update('gatilhos', e.target.value)} onBlur={salvarCampo} placeholder="Gatilhos que disparam a busca…" />
        </ICPCard>

        <ICPCard label="Dores e medos" hint="O que os preocupa? O que temem que dê errado?" icon={<IconAlert />} iconClass="icon-gray">
          <textarea className="icp-field" value={profile.dores} onChange={(e) => update('dores', e.target.value)} onBlur={salvarCampo} placeholder="Medos e preocupações…" />
        </ICPCard>

        <ICPCard label="Desejos e sonhos" hint="O resultado que imaginam. O que vão contar para os amigos?" icon={<IconStar />} iconClass="icon-green">
          <textarea className="icp-field" value={profile.desejos} onChange={(e) => update('desejos', e.target.value)} onBlur={salvarCampo} placeholder="O que eles realmente querem…" />
        </ICPCard>

        <ICPCard label="Onde encontrar" hint="Onde essas pessoas estão? Como chegam até você?" icon={<IconSearch />} iconClass="icon-blue">
          <div>
            <div className="icp-label" style={{ marginBottom: 8 }}>Canais</div>
            <div className="tags-input">
              {profile.canais.map((c) => (
                <span className="itag" key={c}>{c}<button onClick={() => removeCanal(c)}>×</button></span>
              ))}
              <input className="tag-inline-input" placeholder="+ canal" onKeyDown={addCanal} />
            </div>
          </div>
          <textarea className="icp-field" style={{ minHeight: 66 }} value={profile.ondeEncontrar} onChange={(e) => update('ondeEncontrar', e.target.value)} onBlur={salvarCampo} placeholder="Onde mais encontrá-los…" />
        </ICPCard>

        <ICPCard label="Perfil de orçamento" hint="Como preferem pagar? Faixa de investimento." icon={<IconMoney />} iconClass="icon-green">
          <div>
            <div className="icp-label" style={{ marginBottom: 8 }}>Preferência de pagamento</div>
            <div className="option-pills">
              {['Parcelado', 'À vista c/ desconto'].map((opt) => (
                <button key={opt} className={`opt-pill${profile.pagamento.includes(opt) ? ' selected' : ''}`} onClick={() => togglePagamento(opt)}>{opt}</button>
              ))}
            </div>
          </div>
          <textarea className="icp-field" style={{ minHeight: 66 }} value={profile.orcamento} onChange={(e) => update('orcamento', e.target.value)} onBlur={salvarCampo} placeholder="Ticket médio, condições…" />
        </ICPCard>

        <div className="icp-card wide">
          <div className="icp-card-header">
            <div>
              <div className="icp-label">Gap e oportunidade de diferenciação</div>
              <div className="icp-hint">Onde a concorrência falha com esse cliente? Como você se destaca?</div>
            </div>
            <div className="icp-card-icon icon-orange"><IconTarget /></div>
          </div>
          <textarea className="icp-field" style={{ minHeight: 100 }} value={profile.gap} onChange={(e) => update('gap', e.target.value)} onBlur={salvarCampo} placeholder="Onde a concorrência falha…" />
        </div>
      </div>

      <div className="icp-profile-actions">
        <button className="btn-profile-action" onClick={duplicarPerfil}><IconCopy /> Duplicar perfil</button>
        <button className="btn-profile-action danger" onClick={() => setConfirmDelete(true)}><IconTrash /> Apagar perfil</button>
      </div>

      <div className={`save-bar${dirty ? ' show' : ''}`}>
        <span className="save-hint">Você tem <strong>alterações não salvas</strong></span>
        <button className="btn-save" onClick={salvar}><IconSave /> Salvar</button>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false) }}>
          <div className="modal">
            <div className="modal-title">Apagar perfil</div>
            <p className="icp-confirm-text">Apagar “{profile.name || 'Sem nome'}”? Essa ação não pode ser desfeita.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="btn-danger" onClick={apagarPerfil}>Apagar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ICPCard({ label, hint, icon, iconClass, children }) {
  return (
    <div className="icp-card">
      <div className="icp-card-header">
        <div>
          <div className="icp-label">{label}</div>
          <div className="icp-hint">{hint}</div>
        </div>
        <div className={`icp-card-icon ${iconClass}`}>{icon}</div>
      </div>
      {children}
    </div>
  )
}
