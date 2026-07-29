import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { CRM_COLUMNS, CRM_ROWS } from '../data/seed.js'
import {
  IconPlus, IconMoney, IconCRM, IconPercent,
} from '../components/Icons.jsx'
import './Indicadores.css'

const YEAR_MIN = 2020
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_MAX = CURRENT_YEAR + 10
const Q_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const Q_RANGES = ['Jan – Mar', 'Abr – Jun', 'Jul – Set', 'Out – Dez']

const INDICADORES_PADRAO = [
  { nome: 'Faturamento', unidade: 'R$', grupo: 'Financeiro', tipo: 'automatico', fonte_coluna: 'faturamento', meta: 0 },
  { nome: 'Ticket médio', unidade: 'R$', grupo: 'Financeiro', tipo: 'automatico', fonte_coluna: 'ticket_medio', meta: 0 },
  { nome: 'Projetos fechados', unidade: '#', grupo: 'Comercial', tipo: 'automatico', fonte_coluna: 'projetos_fechados', meta: 0 },
  { nome: 'Pedidos de orçamento', unidade: '#', grupo: 'Comercial', tipo: 'automatico', fonte_coluna: 'pedidos_orcamento', meta: 0 },
  { nome: 'Taxa de conversão', unidade: '%', grupo: 'Comercial', tipo: 'automatico', fonte_coluna: 'taxa_conversao', meta: 0 },
  { nome: 'Propostas enviadas', unidade: '#', grupo: 'Comercial', tipo: 'automatico', fonte_coluna: 'propostas_enviadas', meta: 0 },
]

/* ── formatação ── */
function fmt(v, unit) {
  if (v === null || v === undefined) return '—'
  if (unit === 'R$') return v >= 1000 ? 'R$ ' + Math.round(v / 1000) + 'k' : 'R$ ' + Math.round(v)
  if (unit === '%') return v + '%'
  return String(v)
}
function fmtFull(v, unit) {
  if (v === null || v === undefined) return '—'
  if (unit === 'R$') return 'R$ ' + Math.round(v).toLocaleString('pt-BR')
  if (unit === '%') return v + '%'
  return String(v)
}
function pctOf(v, meta) {
  if (!meta || v === null || v === undefined) return null
  return Math.round((v / meta) * 100)
}
function statusLabel(pct) {
  if (pct >= 100) return { text: 'Meta atingida ✓', color: 'var(--green-ink)' }
  if (pct >= 80) return { text: 'Quase lá', color: 'var(--green-ink)' }
  if (pct >= 50) return { text: 'Em andamento', color: 'var(--orange-ink)' }
  return { text: 'Abaixo do esperado', color: 'var(--red)' }
}
function IconForUnit({ unit }) {
  if (unit === 'R$') return <IconMoney />
  if (unit === '%') return <IconPercent />
  return <IconCRM />
}
function iconClass(unit) {
  if (unit === 'R$') return 'icon-green'
  if (unit === '%') return 'icon-blue'
  return 'icon-orange'
}

/* ── datas / trimestres ── */
function parseDateStr(s) {
  if (!s) return null
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}
function inRange(dateStr, [start, end]) {
  const d = parseDateStr(dateStr)
  return d ? d >= start && d <= end : false
}
function quarterRange(year, q) {
  const eod = (y, m, d) => new Date(y, m, d, 23, 59, 59, 999)
  const startMonth = q * 3
  return [new Date(year, startMonth, 1), eod(year, startMonth + 3, 0)]
}
function currentQuarterFor(year) {
  const now = new Date()
  if (year !== now.getFullYear()) return 0
  return Math.floor(now.getMonth() / 3)
}
// Acumulado do ano inteiro até hoje: para o ano corrente, vai até a data de hoje;
// para anos anteriores (já encerrados), o ano inteiro conta como "até hoje".
function ytdRange(year) {
  const eod = (y, m, d) => new Date(y, m, d, 23, 59, 59, 999)
  const now = new Date()
  if (year === CURRENT_YEAR) return [new Date(year, 0, 1), eod(year, now.getMonth(), now.getDate())]
  return [new Date(year, 0, 1), eod(year, 11, 31)]
}
function ytdQuarterCount(year) {
  return year === CURRENT_YEAR ? currentQuarterFor(year) + 1 : 4
}

/* ── mapeamento de colunas do CRM (igual ao Dashboard) ── */
function parseColForDash(c) {
  const isObj = c.opcoes != null && !Array.isArray(c.opcoes)
  const fixed = c.fixo === true || (isObj && c.opcoes?.fixed === true)
  return {
    id: c.id,
    slug: isObj ? (c.opcoes?.slug || null) : null,
    options: fixed
      ? (isObj ? (c.opcoes?.items || []) : (Array.isArray(c.opcoes) ? c.opcoes : []))
      : (Array.isArray(c.opcoes) ? c.opcoes : []),
  }
}
function buildColMap(cols) {
  const map = {}
  cols.forEach(c => { if (c.slug) map[c.slug] = c.id })
  return map
}
function filterRowsByRange(rows, deId, range) {
  if (!deId) return []
  return rows.filter(r => inRange(r[deId], range))
}

/* ── cálculo dos indicadores automáticos, derivados do CRM ── */
function computeAutoValue(key, rows, colMap) {
  const sid = colMap['status']
  const vid = colMap['valor']
  const pid = colMap['proposta']
  if (!sid) return null
  const fechados = rows.filter(r => r[sid] === 'Fechado')
  if (key === 'faturamento') return rows.length ? fechados.reduce((s, r) => s + (Number(r[vid]) || 0), 0) : null
  if (key === 'ticket_medio') return fechados.length ? Math.round(fechados.reduce((s, r) => s + (Number(r[vid]) || 0), 0) / fechados.length) : null
  if (key === 'projetos_fechados') return rows.length ? fechados.length : null
  if (key === 'pedidos_orcamento') return rows.length ? rows.length : null
  if (key === 'taxa_conversao') {
    const comProposta = rows.filter(r => r[pid] === 'Sim')
    return comProposta.length > 0 ? Math.round((fechados.length / comProposta.length) * 100) : null
  }
  if (key === 'propostas_enviadas') return rows.length ? rows.filter(r => r[pid] === 'Sim').length : null
  return null
}

function localSeedState() {
  const indicadoresLocal = INDICADORES_PADRAO.map((d, i) => ({
    id: 'auto-' + i, nome: d.nome, unidade: d.unidade, grupo: d.grupo, tipo: d.tipo, fonte_coluna: d.fonte_coluna,
  }))
  const metasLocal = indicadoresLocal.map((ind, i) => ({ indicador_id: ind.id, ano: CURRENT_YEAR, meta: INDICADORES_PADRAO[i].meta }))
  return { indicadoresLocal, metasLocal, resultadosLocal: [] }
}

export default function Indicadores() {
  const toast = useToast()
  const { user } = useAuth()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [currentQ, setCurrentQ] = useState(currentQuarterFor(CURRENT_YEAR))
  const [cols, setCols] = useState([])
  const [allRows, setAllRows] = useState([])
  const [indicadores, setIndicadores] = useState([])
  const [metas, setMetas] = useState([])
  const [resultados, setResultados] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', meta: '', unit: 'R$', tipo: 'manual' })
  const indIdsRef = useRef([])
  const isFirstYear = useRef(true)
  const localMetasRef = useRef([])
  const localResultadosRef = useRef([])

  useEffect(() => { init() }, [user?.empresaId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isFirstYear.current) { isFirstYear.current = false; return }
    setCurrentQ(currentQuarterFor(year))
    loadAno(year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  async function seedIndicadoresPadrao(empresaId, ano) {
    const { data: indRows, error: indErr } = await supabase.from('indicadores').insert(
      INDICADORES_PADRAO.map(d => ({ empresa_id: empresaId, nome: d.nome, unidade: d.unidade, grupo: d.grupo, tipo: d.tipo, fonte_coluna: d.fonte_coluna }))
    ).select('*')
    if (indErr || !indRows) return null
    const metaPayload = indRows.map(row => {
      const def = INDICADORES_PADRAO.find(d => d.nome === row.nome)
      return { indicador_id: row.id, ano, meta: def?.meta ?? 0 }
    })
    await supabase.from('indicador_metas').insert(metaPayload)
    return indRows
  }

  async function ensurePropostasEnviadas(empresaId, indRows) {
    if (indRows.some(r => r.nome === 'Propostas enviadas')) return indRows
    const def = INDICADORES_PADRAO.find(d => d.nome === 'Propostas enviadas')
    const { data: indRow, error: indErr } = await supabase.from('indicadores').insert({
      empresa_id: empresaId, nome: def.nome, unidade: def.unidade, grupo: def.grupo, tipo: def.tipo, fonte_coluna: def.fonte_coluna,
    }).select('*').single()
    if (indErr || !indRow) return indRows
    await supabase.from('indicador_metas').insert({ indicador_id: indRow.id, ano: CURRENT_YEAR, meta: def.meta ?? 0 })
    return [...indRows, indRow]
  }

  async function loadAno(y, ids) {
    if (!supabaseReady || !user?.empresaId) {
      setMetas(localMetasRef.current.filter((m) => m.ano === y))
      setResultados(localResultadosRef.current.filter((r) => r.ano === y))
      return
    }
    const useIds = ids || indIdsRef.current
    if (!useIds.length) { setMetas([]); setResultados([]); return }
    const [{ data: metasData, error: e1 }, { data: resData, error: e2 }] = await Promise.all([
      supabase.from('indicador_metas').select('*').eq('ano', y).in('indicador_id', useIds),
      supabase.from('indicador_resultados').select('*').eq('ano', y).in('indicador_id', useIds),
    ])
    if (e1 || e2) { toast('Não foi possível carregar os dados do ano'); return }
    setMetas(metasData || [])
    setResultados(resData || [])
  }

  async function init() {
    if (!supabaseReady || !user?.empresaId) {
      const { indicadoresLocal, metasLocal, resultadosLocal } = localSeedState()
      localMetasRef.current = metasLocal
      localResultadosRef.current = resultadosLocal
      setCols(CRM_COLUMNS)
      setAllRows(CRM_ROWS)
      setIndicadores(indicadoresLocal)
      await loadAno(year)
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: dbCols }, { data: linhas }, { data: indData, error: indErr }] = await Promise.all([
      supabase.from('crm_colunas').select('*').eq('empresa_id', user.empresaId).order('ordem'),
      supabase.from('crm_linhas').select('id, valores').eq('empresa_id', user.empresaId),
      supabase.from('indicadores').select('*').eq('empresa_id', user.empresaId).order('created_at', { ascending: true }),
    ])
    setCols((dbCols || []).map(parseColForDash))
    setAllRows((linhas || []).map(l => ({ id: l.id, ...l.valores })))

    if (indErr) { toast('Não foi possível carregar os indicadores'); setLoading(false); return }

    let indRows = indData || []
    if (indRows.length === 0) {
      const seeded = await seedIndicadoresPadrao(user.empresaId, year)
      if (!seeded) { toast('Não foi possível preparar os indicadores'); setLoading(false); return }
      indRows = seeded
    }
    indRows = await ensurePropostasEnviadas(user.empresaId, indRows)
    indIdsRef.current = indRows.map(r => r.id)
    setIndicadores(indRows)
    await loadAno(year, indIdsRef.current)
    setLoading(false)
  }

  const colMap = useMemo(() => buildColMap(cols), [cols])

  const kpis = useMemo(() => {
    const deId = colMap['data_entrada']
    return indicadores.map(ind => {
      const metaRow = metas.find(m => m.indicador_id === ind.id)
      const meta = metaRow ? Number(metaRow.meta) : null

      if (ind.tipo === 'automatico') {
        const quarters = [0, 1, 2, 3].map(q => computeAutoValue(ind.fonte_coluna, filterRowsByRange(allRows, deId, quarterRange(year, q)), colMap))
        const acumulado = computeAutoValue(ind.fonte_coluna, filterRowsByRange(allRows, deId, ytdRange(year)), colMap)
        return { id: ind.id, name: ind.nome, unit: ind.unidade, group: ind.grupo || 'Geral', tipo: 'automatico', fonteColuna: ind.fonte_coluna, meta, quarters, acumulado }
      }

      const quarters = [1, 2, 3, 4].map(t => {
        const r = resultados.find(res => res.indicador_id === ind.id && res.trimestre === t)
        return r && r.valor !== null && r.valor !== undefined ? Number(r.valor) : null
      })
      const filled = quarters.slice(0, ytdQuarterCount(year)).filter(v => v !== null)
      const acumulado = filled.length ? filled.reduce((s, v) => s + v, 0) : null
      return { id: ind.id, name: ind.nome, unit: ind.unidade, group: ind.grupo || 'Geral', tipo: 'manual', meta, quarters, acumulado }
    })
  }, [indicadores, metas, resultados, allRows, colMap, year])

  const fatKpi = kpis.find((k) => k.tipo === 'automatico' && k.fonteColuna === 'faturamento')
  const proj = fatKpi && fatKpi.acumulado !== null ? Math.round((fatKpi.acumulado / ytdQuarterCount(year)) * 4) : null

  const groups = kpis.reduce((acc, k) => {
    if (!acc[k.group]) acc[k.group] = []
    acc[k.group].push(k)
    return acc
  }, {})

  async function updateResultado(indicadorId, qIndex, raw) {
    const clean = String(raw).replace(/[^0-9,.-]/g, '').replace(',', '.')
    const val = clean === '' ? NaN : parseFloat(clean)
    const valorFinal = isNaN(val) ? null : val
    const trimestre = qIndex + 1
    const entry = { indicador_id: indicadorId, ano: year, trimestre, valor: valorFinal }
    setResultados((prev) => {
      const others = prev.filter((r) => !(r.indicador_id === indicadorId && r.trimestre === trimestre))
      return [...others, entry]
    })
    toast('Resultado salvo')
    if (!supabaseReady || !user?.empresaId) {
      localResultadosRef.current = [
        ...localResultadosRef.current.filter((r) => !(r.indicador_id === indicadorId && r.ano === year && r.trimestre === trimestre)),
        entry,
      ]
      return
    }
    const { error } = await supabase.from('indicador_resultados')
      .upsert({ indicador_id: indicadorId, ano: year, trimestre, valor: valorFinal }, { onConflict: 'indicador_id,ano,trimestre' })
    if (error) toast('Não foi possível salvar o resultado')
  }

  async function updateMeta(indicadorId, raw) {
    const clean = String(raw).replace(/[^0-9,.-]/g, '').replace(',', '.')
    if (clean === '') return
    const val = parseFloat(clean)
    if (isNaN(val)) { toast('Informe um valor de meta válido'); return }
    const entry = { indicador_id: indicadorId, ano: year, meta: val }
    setMetas((prev) => {
      const others = prev.filter((m) => !(m.indicador_id === indicadorId && m.ano === year))
      return [...others, entry]
    })
    toast('Meta salva')
    if (!supabaseReady || !user?.empresaId) {
      localMetasRef.current = [
        ...localMetasRef.current.filter((m) => !(m.indicador_id === indicadorId && m.ano === year)),
        entry,
      ]
      return
    }
    const { error } = await supabase.from('indicador_metas')
      .upsert(entry, { onConflict: 'indicador_id,ano' })
    if (error) toast('Não foi possível salvar a meta')
  }

  async function criar() {
    const meta = parseFloat(form.meta)
    if (!form.name.trim() || isNaN(meta)) { toast('Preencha nome e meta'); return }
    const nome = form.name.trim()
    if (!supabaseReady || !user?.empresaId) {
      const id = 'i' + Date.now()
      const newMeta = { indicador_id: id, ano: year, meta }
      setIndicadores((prev) => [...prev, { id, nome, unidade: form.unit, grupo: 'Outros', tipo: form.tipo, fonte_coluna: null }])
      localMetasRef.current = [...localMetasRef.current, newMeta]
      setMetas((prev) => [...prev, newMeta])
      setModalOpen(false)
      setForm({ name: '', meta: '', unit: 'R$', tipo: 'manual' })
      toast('Indicador criado')
      return
    }
    const { data: indRow, error: indErr } = await supabase.from('indicadores').insert({
      empresa_id: user.empresaId, nome, unidade: form.unit, grupo: 'Outros', tipo: form.tipo,
    }).select('*').single()
    if (indErr) { toast('Não foi possível criar o indicador'); return }
    const { data: metaRow } = await supabase.from('indicador_metas').insert({
      indicador_id: indRow.id, ano: year, meta,
    }).select('*').single()
    indIdsRef.current = [...indIdsRef.current, indRow.id]
    setIndicadores((prev) => [...prev, indRow])
    setMetas((prev) => [...prev, metaRow || { indicador_id: indRow.id, ano: year, meta }])
    setModalOpen(false)
    setForm({ name: '', meta: '', unit: 'R$', tipo: 'manual' })
    toast('Indicador criado')
  }

  if (loading) return (
    <div className="page-header">
      <div className="page-title">Indicadores</div>
      <div className="page-sub">Carregando seus indicadores…</div>
    </div>
  )

  return (
    <>
      <div className="page-header between">
        <div>
          <div className="page-title">Indicadores</div>
          <div className="page-sub">Meta anual, fechamento trimestral. Atualiza a cada 3 meses.</div>
        </div>
        <div className="ind-header-right">
          <div className="year-pill">
            <button className="year-btn" onClick={() => setYear((y) => Math.max(YEAR_MIN, y - 1))} disabled={year <= YEAR_MIN}>‹</button>
            <span className="year-val">{year}</span>
            <button className="year-btn" onClick={() => setYear((y) => Math.min(YEAR_MAX, y + 1))} disabled={year >= YEAR_MAX}>›</button>
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
          <div className="proj-label">Acumulado</div>
          <div className="proj-val">{fatKpi && fatKpi.acumulado !== null ? fmtFull(fatKpi.acumulado, 'R$') : '—'}</div>
        </div>
        <div className="proj-divider" />
        <div>
          <div className="proj-label">Projeção anual no ritmo atual</div>
          <div className="proj-val">{proj !== null ? <span>{fmtFull(proj, 'R$')}</span> : '—'}</div>
        </div>
        <div className="proj-divider" />
        <div className="proj-note">
          {proj !== null && fatKpi?.meta
            ? proj >= fatKpi.meta
              ? <>Você vai bater a meta. No ritmo atual, o escritório fecha o ano com <strong>{Math.round((proj / fatKpi.meta - 1) * 100)}% acima</strong> do planejado.</>
              : <>Faltam <strong>{fmtFull(fatKpi.meta - (fatKpi.acumulado || 0), 'R$')}</strong> para bater a meta anual. Ajuste o ritmo ou revise a meta no próximo fechamento.</>
            : 'Preencha o resultado do trimestre para ver a projeção anual.'}
        </div>
      </div>

      {/* kpis */}
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="group-label">{group}</div>
          {items.map((k) => {
            const pct = pctOf(k.acumulado, k.meta)
            const st = k.acumulado !== null && pct !== null ? statusLabel(pct) : null
            return (
              <div className="kpi-card" key={k.id}>
                <div className="kpi-main">
                  <div className={`kpi-icon ${iconClass(k.unit)}`}><IconForUnit unit={k.unit} /></div>
                  <div className="kpi-info">
                    <div className="kpi-name">
                      {k.name}
                      {k.tipo === 'automatico' && <span className="kpi-tipo-badge">Automático</span>}
                    </div>
                    <div className="kpi-meta-line">
                      Meta anual: {k.unit === 'R$' && 'R$ '}
                      <span
                        className="kpi-meta-val"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updateMeta(k.id, e.currentTarget.textContent)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
                      >
                        {k.meta !== null ? (k.unit === 'R$' ? Math.round(k.meta).toLocaleString('pt-BR') : k.meta) : ''}
                      </span>
                      {k.unit === '%' && '%'}
                    </div>
                  </div>
                  <div className="kpi-right">
                    <div className="kpi-block">
                      <div className="kpi-block-label">Acumulado YTD</div>
                      <div className="kpi-block-val">{k.acumulado !== null ? fmtFull(k.acumulado, k.unit) : '—'}</div>
                      {st ? (
                        <div className="kpi-status" style={{ color: st.color }}>{pct}% da meta · {st.text}</div>
                      ) : (
                        <div className="kpi-status muted">{k.tipo === 'manual' ? 'Preencha os trimestres' : 'Sem dados no período'}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="kpi-quarters">
                  {[0, 1, 2, 3].map((qi) => {
                    const qv = k.quarters[qi]
                    return (
                      <div key={qi} className={`q-block${qi === currentQ ? ' active-q' : ''}`}>
                        <div className="q-block-label">
                          {qi === currentQ && <span className="q-dot" />}{Q_LABELS[qi]}
                        </div>
                        {k.tipo === 'manual' ? (
                          <div
                            className="q-block-val editable"
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => updateResultado(k.id, qi, e.currentTarget.textContent)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
                          >
                            {qv !== null ? (k.unit === 'R$' ? Math.round(qv).toLocaleString('pt-BR') : qv) : ''}
                          </div>
                        ) : (
                          <div className={`q-block-val${qv === null ? ' placeholder' : ''}`}>{qv !== null ? fmt(qv, k.unit) : '—'}</div>
                        )}
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
            <div className="modal-field">
              <label className="modal-label">Tipo</label>
              <div className="unit-pills">
                {[['manual', 'Manual'], ['automatico', 'Automático']].map(([t, lbl]) => (
                  <button key={t} className={`unit-pill${form.tipo === t ? ' selected' : ''}`} onClick={() => setForm({ ...form, tipo: t })}>{lbl}</button>
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
