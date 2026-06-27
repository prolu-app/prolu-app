import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { QUOTES, ANNOUNCEMENTS, FOLDERS, CRM_ROWS, PLANO_ACOES } from '../data/seed.js'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import {
  IconBolt, IconAgente, IconArrowRight, IconCRM, IconBase, IconMoney, IconLock, IconClose,
} from '../components/Icons.jsx'
import './Inicio.css'

const VINTE_QUATRO_H = 24 * 60 * 60 * 1000

function getFechados() {
  try { return JSON.parse(localStorage.getItem('prolu_avisos_fechados') || '{}') }
  catch { return {} }
}

function fmtFat(v) {
  if (!v) return '—'
  if (v >= 1000) return `R$ ${Math.round(v / 1000)}k`
  return `R$ ${v.toLocaleString('pt-BR')}`
}

function melhorCanal(pares) {
  const map = {}
  for (const { origem, fechado } of pares) {
    if (!origem) continue
    if (!map[origem]) map[origem] = { total: 0, fechados: 0 }
    map[origem].total++
    if (fechado) map[origem].fechados++
  }
  const totalFechados = Object.values(map).reduce((s, v) => s + v.fechados, 0)
  if (totalFechados < 3) return null
  let best = null
  for (const [origem, stats] of Object.entries(map)) {
    if (!stats.fechados) continue
    const rate = stats.fechados / stats.total
    if (!best || rate > best.rate) best = { origem, rate: Math.round(rate * 100) }
  }
  return best
}

const INSIGHT_DESC = {
  'Indicação': 'Antes de investir em tráfego pago, crie um processo de pedido de indicação para quem já fechou com você.',
  'Instagram': 'Mantenha conteúdo consistente e qualifique os leads antes da primeira reunião.',
  'Google': 'Cuide das avaliações e mantenha seu perfil atualizado — a busca orgânica está trabalhando por você.',
  'Site': 'Seu site está convertendo — certifique-se de que o posicionamento está claro para atrair o cliente certo.',
}

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Inicio() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [avisos, setAvisos] = useState([])

  useEffect(() => {
    let alive = true

    if (!supabaseReady) {
      const fechados = getFechados()
      setAvisos(ANNOUNCEMENTS.filter((a) => {
        const ts = fechados[a.id]
        return !ts || Date.now() - ts >= VINTE_QUATRO_H
      }))
      return
    }

    if (!user?.id) return

    const hoje = new Date().toISOString().slice(0, 10)
    const h24ago = new Date(Date.now() - VINTE_QUATRO_H).toISOString()

    Promise.all([
      supabase
        .from('avisos')
        .select('id, texto, cor, link, link_texto, link_externo')
        .or(`ativo_ate.is.null,ativo_ate.gte.${hoje}`)
        .lte('ativo_de', hoje)
        .order('created_at', { ascending: false }),
      supabase
        .from('avisos_descartados')
        .select('aviso_id')
        .eq('usuario_id', user.id)
        .gte('descartado_em', h24ago),
    ]).then(([{ data: avisoData }, { data: descartados }]) => {
      if (!alive) return
      const descartadosSet = new Set((descartados || []).map((d) => d.aviso_id))
      setAvisos(
        (avisoData || [])
          .filter((a) => !descartadosSet.has(a.id))
          .map((a) => ({
            id: a.id,
            color: a.cor,
            text: a.texto,
            linkText: a.link_texto || '',
            link: a.link || '',
            external: a.link_externo,
          }))
      )
    })

    return () => { alive = false }
  }, [user?.id])

  const [kbStats, setKbStats] = useState(() => {
    const allLessons = FOLDERS.flatMap((f) => f.modules.flatMap((m) => m.lessons))
    return { total: allLessons.length, concluidas: allLessons.filter((l) => l.done).length }
  })

  useEffect(() => {
    if (!supabaseReady || !user?.id) return
    Promise.all([
      supabase.from('kb_aulas').select('*', { count: 'exact', head: true }),
      supabase.from('kb_progresso')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .eq('concluida', true),
    ]).then(([{ count: total }, { count: concluidas }]) => {
      if ((total ?? 0) > 0) setKbStats({ total: total ?? 0, concluidas: concluidas ?? 0 })
    })
  }, [user?.id])

  const kbPct = kbStats?.total > 0
    ? Math.round((kbStats.concluidas / kbStats.total) * 100)
    : 0

  const [crmStats, setCrmStats] = useState(null)

  useEffect(() => {
    if (!supabaseReady || !user?.empresaId) return
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    supabase
      .from('crm_linhas')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', user.empresaId)
      .gte('created_at', inicioMes)
      .then(({ count }) => {
        setCrmStats({ leads: count ?? 0 })
      })
  }, [user?.empresaId])

  const crmLabel = !crmStats
    ? null
    : crmStats.leads === 0
    ? 'Nenhum pedido de orçamento neste mês'
    : `${crmStats.leads} ${crmStats.leads === 1 ? 'pedido de orçamento' : 'pedidos de orçamento'} neste mês`

  const [resumo, setResumo] = useState(() => {
    if (supabaseReady) return { faturamento: 0, planoDone: 0, planoTotal: 0 }
    const anoAtual = new Date().getFullYear().toString()
    const faturamento = CRM_ROWS
      .filter((r) => r.c_status === 'Fechado' && r.c_data?.startsWith(anoAtual))
      .reduce((sum, r) => sum + (r.c_valor || 0), 0)
    return {
      faturamento,
      planoDone: PLANO_ACOES.filter((a) => a.status === 'done').length,
      planoTotal: PLANO_ACOES.length,
    }
  })

  const [insightCanal, setInsightCanal] = useState(() =>
    supabaseReady
      ? undefined
      : melhorCanal(CRM_ROWS.map((r) => ({ origem: r.c_origem, fechado: r.c_status === 'Fechado' })))
  )

  useEffect(() => {
    if (!supabaseReady || !user?.empresaId) return
    const anoAtual = new Date().getFullYear().toString()
    Promise.all([
      supabase.from('crm_colunas').select('id, nome, tipo').eq('empresa_id', user.empresaId),
      supabase.from('crm_linhas').select('valores').eq('empresa_id', user.empresaId),
      supabase.from('plano_acoes').select('*', { count: 'exact', head: true }).eq('empresa_id', user.empresaId),
      supabase.from('plano_acoes').select('*', { count: 'exact', head: true }).eq('empresa_id', user.empresaId).eq('status', 'done'),
    ]).then(([{ data: colunas }, { data: linhas }, { count: planoTotal }, { count: planoDone }]) => {
      const statusColId = colunas?.find((c) => c.nome === 'Status')?.id
      const valorColId = colunas?.find((c) => c.nome === 'Valor proposta')?.id
                      ?? colunas?.find((c) => c.tipo === 'money')?.id
      const origemColId = colunas?.find((c) => c.nome === 'Origem')?.id
      const dataColId = colunas?.find((c) => c.tipo === 'date')?.id
      const faturamento = statusColId && valorColId
        ? (linhas || []).reduce((sum, l) => {
            if (l.valores?.[statusColId] !== 'Fechado') return sum
            if (dataColId && !l.valores?.[dataColId]?.startsWith(anoAtual)) return sum
            return sum + (Number(l.valores?.[valorColId]) || 0)
          }, 0)
        : 0
      setResumo({ faturamento, planoDone: planoDone ?? 0, planoTotal: planoTotal ?? 0 })
      setInsightCanal(melhorCanal((linhas || []).map((l) => ({
        origem: l.valores?.[origemColId],
        fechado: l.valores?.[statusColId] === 'Fechado',
      }))))
    })
  }, [user?.empresaId])

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [])
  const primeiroNome = (user?.nome || 'André').split(' ')[0]

  function abrirAviso(a) {
    if (a.external) window.open(a.link, '_blank')
    else navigate(a.link)
  }

  return (
    <>
      {/* avisos */}
      {avisos.length > 0 && (
        <div className="announcements">
          {avisos.map((a) => (
            <div className={`announcement ann-${a.color}`} key={a.id}>
              <span className="ann-dot" />
              <span className="ann-text">{a.text}</span>
              <span className="ann-link" onClick={() => abrirAviso(a)}>{a.linkText}</span>
              <button className="ann-close" onClick={() => {
                setAvisos(avisos.filter((x) => x.id !== a.id))
                if (supabaseReady && user?.id) {
                  supabase.from('avisos_descartados').upsert(
                    { usuario_id: user.id, aviso_id: a.id, descartado_em: new Date().toISOString() },
                    { onConflict: 'usuario_id,aviso_id' }
                  )
                } else {
                  const fechados = getFechados()
                  fechados[a.id] = Date.now()
                  try { localStorage.setItem('prolu_avisos_fechados', JSON.stringify(fechados)) } catch {}
                }
              }} aria-label="Fechar aviso">
                <IconClose />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* boas-vindas */}
      <div className="welcome">
        <div className="welcome-eyebrow">
          <IconBolt />
          {primeiroNome}, {saudacao().toLowerCase()} — bom te ver por aqui
        </div>
        <h1 className="welcome-title">Seu escritório está em <em>movimento.</em></h1>
        <p className="welcome-quote">
          <span className="welcome-quote-text">{quote.text}</span>
          <span className="quote-author">— {quote.author}</span>
        </p>
      </div>

      {/* agente prolu */}
      <div className="agent-bar" onClick={() => navigate('/agente-prolu')}>
        <div className="agent-bar-icon"><IconAgente /></div>
        <div className="agent-bar-text">
          <div className="agent-bar-title">Agente Prolu</div>
          <div className="agent-bar-sub">Sua IA particular para vender, atender e organizar o escritório</div>
        </div>
        <div className="agent-bar-cta">
          Conversar
          <IconArrowRight />
        </div>
      </div>

      {/* resumo */}
      <div className="section-title">Resumo do escritório</div>
      <div className="pulse-card">
        <div className="pulse-metric">
          <div className="pulse-label">Faturamento YTD</div>
          <div className={`pulse-val${resumo.faturamento > 0 ? ' highlight' : ''}`}>
            {fmtFat(resumo.faturamento)}
          </div>
          <div className="pulse-trend">
            {resumo.faturamento > 0 ? 'em projetos fechados este ano' : 'Nenhum projeto fechado ainda'}
          </div>
        </div>
        <div className="pulse-divider" />
        <div className="pulse-metric">
          <div className="pulse-label">Plano Prático</div>
          <div className="pulse-val">
            {resumo.planoTotal > 0 ? `${Math.round((resumo.planoDone / resumo.planoTotal) * 100)}%` : '—'}
          </div>
          <div className="pulse-trend">
            {resumo.planoTotal > 0
              ? `${resumo.planoDone} de ${resumo.planoTotal} ações concluídas`
              : 'Nenhuma ação cadastrada'}
          </div>
        </div>
        <div className="pulse-divider" />
        <div className="pulse-metric">
          <div className="pulse-label">Base de Conhecimento</div>
          <div className="pulse-val">
            {kbStats.total > 0 ? `${kbPct}%` : '—'}
          </div>
          <div className="pulse-trend">
            {kbStats.total > 0
              ? `${kbStats.concluidas} de ${kbStats.total} aulas assistidas`
              : 'Nenhuma aula ainda'}
          </div>
        </div>
      </div>

      {insightCanal && (
        <div className="insight-card">
          <div className="insight-icon"><IconBolt /></div>
          <div className="insight-text">
            <strong>{insightCanal.origem} converte {insightCanal.rate}% dos leads</strong> — seu melhor canal.{' '}
            {INSIGHT_DESC[insightCanal.origem] ?? 'Entenda o que está funcionando nesse canal e replique o processo.'}
          </div>
        </div>
      )}

      {/* ferramentas */}
      <div className="section-title">Suas ferramentas</div>
      <div className="modules-grid">
        <button className="module-tile tile-comercial" onClick={() => navigate('/crm')}>
          <div className="tile-top">
            <div className="tile-icon"><IconCRM /></div>
          </div>
          <div className="tile-body">
            <div className="tile-title">Gestão Comercial</div>
            <div className="tile-sub">CRM, dashboard, plano prático, cliente ideal e indicadores num só lugar.</div>
            <div className="tile-meta-row">
              <span className="tile-progress-pct">{crmLabel ?? '—'}</span>
            </div>
          </div>
        </button>

        <button className="module-tile tile-conhecimento" onClick={() => navigate('/base-conhecimento')}>
          <div className="tile-top">
            <div className="tile-icon"><IconBase /></div>
          </div>
          <div className="tile-body">
            <div className="tile-title">Base de Conhecimento</div>
            <div className="tile-sub">O método Prolu em vídeo. Cursos, módulos e materiais extras.</div>
            <div className="tile-meta-row">
              {!kbStats && <span className="tile-progress-pct">—</span>}
              {kbStats?.total === 0 && <span className="tile-progress-pct">Nenhuma aula ainda</span>}
              {kbStats?.total > 0 && (
                <>
                  <div className="tile-progress-track"><div className="tile-progress-fill" style={{ width: `${kbPct}%` }} /></div>
                  <span className="tile-progress-pct">{kbStats.concluidas} de {kbStats.total} aulas · {kbPct}%</span>
                </>
              )}
            </div>
          </div>
        </button>

        <button className="module-tile tile-precificacao" onClick={() => toast('Precificação chega em breve')}>
          <div className="tile-top">
            <div className="tile-icon"><IconMoney /></div>
            <span className="tile-badge badge-soon">Em breve</span>
          </div>
          <div className="tile-body">
            <div className="tile-title">Precificação</div>
            <div className="tile-sub">Calcule horas e valor de cada projeto direto no fluxo do CRM.</div>
            <div className="tile-locked-note"><IconLock />Liberado em breve</div>
          </div>
        </button>
      </div>
    </>
  )
}
