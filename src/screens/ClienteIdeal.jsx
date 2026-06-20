import { useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { ICP_PROFILES } from '../data/seed.js'
import { IconPlus, IconCRM, IconHeart, IconBolt, IconAlert, IconStar, IconSearch, IconMoney, IconTarget, IconSave } from '../components/Icons.jsx'
import './ClienteIdeal.css'

export default function ClienteIdeal() {
  const toast = useToast()
  const [profiles, setProfiles] = useState(ICP_PROFILES)
  const [activeId, setActiveId] = useState(ICP_PROFILES[0].id)
  const [dirty, setDirty] = useState(false)

  const profile = profiles.find((p) => p.id === activeId)

  function update(field, value) {
    setProfiles((prev) => prev.map((p) => (p.id === activeId ? { ...p, [field]: value } : p)))
    if (!dirty) setDirty(true)
  }

  function changeAge(which, delta) {
    setProfiles((prev) => prev.map((p) => {
      if (p.id !== activeId) return p
      if (which === 'min') return { ...p, ageMin: Math.max(18, Math.min(p.ageMax - 1, p.ageMin + delta)) }
      return { ...p, ageMax: Math.max(p.ageMin + 1, Math.min(70, p.ageMax + delta)) }
    }))
    if (!dirty) setDirty(true)
  }

  function togglePagamento(opt) {
    const has = profile.pagamento.includes(opt)
    update('pagamento', has ? profile.pagamento.filter((x) => x !== opt) : [...profile.pagamento, opt])
  }

  function addCanal(e) {
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    const val = e.target.value.trim().replace(',', '')
    if (!val) return
    update('canais', [...profile.canais, val])
    e.target.value = ''
  }
  function removeCanal(canal) {
    update('canais', profile.canais.filter((c) => c !== canal))
  }

  function novoPerfil() {
    const id = 'p' + Date.now()
    const novo = {
      id, name: 'Novo perfil', color: '#4CAF82', ageMin: 25, ageMax: 40,
      demografico: '', psicografico: '', gatilhos: '', dores: '', desejos: '',
      canais: [], ondeEncontrar: '', pagamento: [], orcamento: '', gap: '',
    }
    setProfiles((prev) => [...prev, novo])
    setActiveId(id)
    toast('Novo perfil criado — preencha os campos')
  }

  function salvar() {
    setDirty(false)
    toast('Cliente Ideal salvo ✓')
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Cliente Ideal</div>
        <div className="page-sub">Defina com quem você quer trabalhar. Isso muda tudo na hora de comunicar, prospectar e fechar.</div>
      </div>

      {/* perfis */}
      <div className="profiles-bar">
        {profiles.map((p) => (
          <button key={p.id} className={`profile-tab${p.id === activeId ? ' active' : ' inactive'}`} onClick={() => setActiveId(p.id)}>
            <span className="tab-dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
        <button className="btn-new-profile" onClick={novoPerfil}><IconPlus /> Novo perfil</button>
      </div>

      {/* campos */}
      <div className="icp-grid">
        <ICPCard label="Perfil demográfico" hint="Quem são essas pessoas? Idade, estado civil, renda, onde vivem." icon={<IconCRM />} iconClass="icon-blue">
          <div>
            <div className="icp-label" style={{ marginBottom: 10 }}>Faixa etária</div>
            <div className="range-row">
              <button className="range-btn" onClick={() => changeAge('min', -1)}>−</button>
              <div className="range-display">{profile.ageMin}<small>anos</small></div>
              <span className="range-sep">até</span>
              <div className="range-display">{profile.ageMax}<small>anos</small></div>
              <button className="range-btn" onClick={() => changeAge('max', 1)}>+</button>
            </div>
          </div>
          <textarea className="icp-field" value={profile.demografico} onChange={(e) => update('demografico', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Descreva quem são essas pessoas…" />
        </ICPCard>

        <ICPCard label="Perfil psicográfico" hint="Valores, estilo de vida, como tomam decisões." icon={<IconHeart />} iconClass="icon-violet">
          <textarea className="icp-field" value={profile.psicografico} onChange={(e) => update('psicografico', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Valores, estilo de vida, como decidem…" />
        </ICPCard>

        <ICPCard label="Gatilhos de compra" hint="O que acontece na vida deles que os leva a procurar um arquiteto agora?" icon={<IconBolt />} iconClass="icon-orange">
          <textarea className="icp-field" value={profile.gatilhos} onChange={(e) => update('gatilhos', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Gatilhos que disparam a busca…" />
        </ICPCard>

        <ICPCard label="Dores e medos" hint="O que os preocupa? O que temem que dê errado?" icon={<IconAlert />} iconClass="icon-gray">
          <textarea className="icp-field" value={profile.dores} onChange={(e) => update('dores', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Medos e preocupações…" />
        </ICPCard>

        <ICPCard label="Desejos e sonhos" hint="O resultado que imaginam. O que vão contar para os amigos?" icon={<IconStar />} iconClass="icon-green">
          <textarea className="icp-field" value={profile.desejos} onChange={(e) => update('desejos', e.target.value)} onBlur={() => dirty && salvar()} placeholder="O que eles realmente querem…" />
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
          <textarea className="icp-field" style={{ minHeight: 66 }} value={profile.ondeEncontrar} onChange={(e) => update('ondeEncontrar', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Onde mais encontrá-los…" />
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
          <textarea className="icp-field" style={{ minHeight: 66 }} value={profile.orcamento} onChange={(e) => update('orcamento', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Ticket médio, condições…" />
        </ICPCard>

        <div className="icp-card wide">
          <div className="icp-card-header">
            <div>
              <div className="icp-label">Gap e oportunidade de diferenciação</div>
              <div className="icp-hint">Onde a concorrência falha com esse cliente? Como você se destaca?</div>
            </div>
            <div className="icp-card-icon icon-orange"><IconTarget /></div>
          </div>
          <textarea className="icp-field" style={{ minHeight: 100 }} value={profile.gap} onChange={(e) => update('gap', e.target.value)} onBlur={() => dirty && salvar()} placeholder="Onde a concorrência falha…" />
        </div>
      </div>

      <div className={`save-bar${dirty ? ' show' : ''}`}>
        <span className="save-hint">Você tem <strong>alterações não salvas</strong></span>
        <button className="btn-save" onClick={salvar}><IconSave /> Salvar</button>
      </div>
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
