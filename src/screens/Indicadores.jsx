import { useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { INDICADORES } from '../data/seed.js'
import {
  IconPlus, IconMoney, IconCRM, IconPercent,
} from '../components/Icons.jsx'
import './Indicadores.css'

const Q_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const Q_RANGES = ['Jan – Mar', 'Abr – Jun', 'Jul – Set', 'Out – Dez']

function fmt(v, unit) {
  if (v === null || v === undefined) return '—'
  if (unit === 'R$') return v >= 1000 ? 'R$ ' + Math.round(v / 1000) + 'k' : 'R$ ' + v
  if (unit === '%') return v + '%'
  return String(v)
}
function fmtFull(v, unit) {
  if (v === null || v === undefined) return '—'
  if (unit === 'R$') return 'R$ ' + v.toLocaleString('pt-BR')
  if (unit === '%') return v + '%'
  return String(v)
}
function pctOf(v, meta) {
  if (!meta || v === null) return 0
  return Math.round((v / meta) * 100)
}
function fillColor(pct) {
  if (pct >= 80) return 'var(--green-deep)'
  if (pct >= 50) return 'var(--orange)'
  return 'var(--red)'
}
function statusLabel(pct) {
  if (pct >= 100) return { text: 'Meta atingida ✓', color: 'var(--green-ink)' }
  if (pct >= 80) return { text: 'Quase lá', color: 'var(--green-ink)' }
  if (pct >= 50) return { text: 'Em andamento', color: 'var(--orange-ink)' }
  return { text: 'Abaixo do esperado', color: 'var(--red)' }
}
function calcProjection(kpi) {
  const filled = kpi.quarters.map((v, i) => (v !== null ? { q: i, v } : null)).filter(Boolean)
  if (!filled.length) return null
  const last = filled[filled.length - 1]
  return Math.round((last.v / (last.q + 1)) * 4)
}
function IconFor({ unit }) {
  if (unit === 'R$') return <IconMoney />
  if (unit === '%') return <IconPercent />
  return <IconCRM />
}
function iconClass(unit) {
  if (unit === 'R$') return 'icon-green'
  if (unit === '%') return 'icon-blue'
  return 'icon-orange'
}

export default function Indicadores() {
  const toast = useToast()
  const [year, setYear] = useState(2026)
  const [currentQ, setCurrentQ] = useState(2)
  const [kpis, setKpis] = useState(INDICADORES)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', meta: '', unit: 'R$' })

  const fat = kpis.find((k) => k.id === 1)
  const proj = fat ? calcProjection(fat) : null
  const curFat = fat ? fat.quarters[currentQ] : null

  const groups = kpis.reduce((acc, k) => {
    if (!acc[k.group]) acc[k.group] = []
    acc[k.group].push(k)
    return acc
  }, {})

  function updateQ(id, q, raw) {
    const clean = String(raw).replace(/[^0-9,.]/g, '').replace(',', '.')
    const val = parseFloat(clean)
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, quarters: k.quarters.map((qv, i) => (i === q ? (isNaN(val) ? null : val) : qv)) } : k)))
    toast('Resultado salvo')
  }

  function criar() {
    const meta = parseFloat(form.meta)
    if (!form.name.trim() || isNaN(meta)) { toast('Preencha nome e meta'); return }
    setKpis((prev) => [...prev, { id: Date.now(), name: form.name.trim(), unit: form.unit, meta, quarters: [null, null, null, null], group: 'Outros' }])
    setModalOpen(false)
    setForm({ name: '', meta: '', unit: 'R$' })
    toast('Indicador criado')
  }

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Indicadores</div>
          <div className="page-sub">Meta anual, fechamento trimestral. Atualiza a cada 3 meses.</div>
        </div>
        <div className="ind-header-right">
          <div className="year-pill">
            <button className="year-btn" onClick={() => setYear((y) => y - 1)}>‹</button>
            <span className="year-val">{year}</span>
            <button className="year-btn" onClick={() => setYear((y) => y + 1)}>›</button>
          </div>
          <button className="btn-primary ind-new-btn" onClick={() => setModalOpen(true)}>
            <IconPlus /> Novo indicador
          </button>
        </div>
      </div>

      {/* trimestres */}
      <div className="quarter-bar">
        {Q_LABELS.map((q, i) => (
          <button key={q} className={`q-pill${i === currentQ ? ' active' : ''}`} onClick={() => setCurrentQ(i)}>
            {q}<span className="q-range">{Q_RANGES[i]}</span>
          </button>
        ))}
      </div>

      {/* projeção */}
      <div className="proj-card">
        <div>
          <div className="proj-label">Faturamento acumulado — {Q_LABELS[currentQ]}</div>
          <div className="proj-val">{curFat !== null ? fmtFull(curFat, 'R$') : '—'}</div>
        </div>
        <div className="proj-divider" />
        <div>
          <div className="proj-label">Projeção anual no ritmo atual</div>
          <div className="proj-val">{proj ? <span>{fmtFull(proj, 'R$')}</span> : '—'}</div>
        </div>
        <div className="proj-divider" />
        <div className="proj-note">
          {proj
            ? proj >= fat.meta
              ? <>Você vai bater a meta. No ritmo atual, o escritório fecha o ano com <strong>{Math.round((proj / fat.meta - 1) * 100)}% acima</strong> do planejado.</>
              : <>Faltam <strong>{fmtFull(fat.meta - (curFat || 0), 'R$')}</strong> para bater a meta anual. Ajuste o ritmo ou revise a meta no próximo fechamento.</>
            : 'Preencha o resultado do trimestre para ver a projeção anual.'}
        </div>
      </div>

      {/* kpis */}
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="group-label">{group}</div>
          {items.map((k) => {
            const cur = k.quarters[currentQ]
            const pct = pctOf(cur, k.meta)
            const st = cur !== null ? statusLabel(pct) : null
            return (
              <div className="kpi-card" key={k.id}>
                <div className="kpi-main">
                  <div className={`kpi-icon ${iconClass(k.unit)}`}><IconFor unit={k.unit} /></div>
                  <div className="kpi-info">
                    <div className="kpi-name">{k.name}</div>
                    <div className="kpi-meta-line">Meta anual: {fmtFull(k.meta, k.unit)}</div>
                  </div>
                  <div className="kpi-right">
                    <div className="kpi-block">
                      <div className="kpi-block-label">Resultado {Q_LABELS[currentQ]}</div>
                      <div
                        className="kpi-block-val editable"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updateQ(k.id, currentQ, e.currentTarget.textContent)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
                      >
                        {cur !== null ? (k.unit === 'R$' ? cur.toLocaleString('pt-BR') : cur) : ''}
                      </div>
                      {st ? (
                        <div className="kpi-status" style={{ color: st.color }}>{pct}% da meta · {st.text}</div>
                      ) : (
                        <div className="kpi-status muted">Clique para preencher</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="kpi-quarters">
                  {[0, 1, 2, 3].map((qi) => {
                    const qv = k.quarters[qi]
                    const qpct = pctOf(qv, k.meta)
                    return (
                      <div key={qi} className={`q-block${qi === currentQ ? ' active-q' : ''}`} onClick={() => setCurrentQ(qi)}>
                        <div className="q-block-label">
                          {qi === currentQ && <span className="q-dot" />}{Q_LABELS[qi]}
                        </div>
                        <div className={`q-block-val${qv === null ? ' placeholder' : ''}`}>{qv !== null ? fmt(qv, k.unit) : '—'}</div>
                        {qv !== null && <div className="q-pct" style={{ color: fillColor(qpct) }}>{qpct}%</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <button className="fab" onClick={() => setModalOpen(true)} aria-label="Novo indicador"><IconPlus /></button>

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <div className="modal-title">Novo indicador</div>
            <div className="modal-field">
              <label className="modal-label">Nome</label>
              <input className="modal-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Faturamento, Projetos fechados…" autoFocus />
            </div>
            <div className="modal-field">
              <label className="modal-label">Meta anual</label>
              <input className="modal-input" type="number" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} placeholder="Ex: 130000" />
            </div>
            <div className="modal-field">
              <label className="modal-label">Unidade</label>
              <div className="unit-pills">
                {[['R$', 'R$ Reais'], ['#', 'Quantidade'], ['%', 'Porcentagem']].map(([u, lbl]) => (
                  <button key={u} className={`unit-pill${form.unit === u ? ' selected' : ''}`} onClick={() => setForm({ ...form, unit: u })}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-confirm" onClick={criar}>Criar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
