// Cálculo do valor-hora de CUSTO do escritório (tela /precificacao/valor-hora).
// Funções puras, sem React nem Supabase: conferidas por
// scripts/verificar-valor-hora.mjs. Valores de custo, SEM margem e SEM
// impostos (esses ficam na Precificação).
//
// O banco guarda só as entradas (valor_hora_cenarios.dados, migration_053,
// formato versao 3); os resultados saem daqui na hora.
//
//   estrutura   = Σ valor × (1 + encargos) das linhas que NÃO produzem projeto
//   equipe      = Σ valor × (1 + encargos) das linhas que produzem projeto
//   H           = Σ horas/dia × dias/semana × 4 × % produtivo
//   Método Prolu       = (estrutura + equipe) ÷ (H × OP)
//   Centro de custo k  = (estrutura ÷ H + equipe_k ÷ H_k) ÷ OP
import { EXEMPLO } from './valorHoraPadroes.js'

export const VERSAO_DADOS = 3
export const SEMANAS_MES = 4
const MAX_ITENS = 150

export const TIPOS_CUSTO = [
  { value: 'Pessoas', label: 'Pessoas' },
  { value: 'Serviço', label: 'Serviço' },
  { value: 'Estrutura', label: 'Estrutura' },
]
export const OP_PADRAO = 80
export const CENTRO_PADRAO = 'Geral'
export const PADRAO_PRODUTIVO = { horas_dia: 8, dias_semana: 5, pct_produtivo: 85 }
// linha do pró-labore quando o dono considera as horas dele.
// VALORES PROVISÓRIOS, A CALIBRAR POR ANDRÉ.
export const PADRAO_DONO = { horas_dia: 4, dias_semana: 5, pct_produtivo: 50 }
export const NOME_PRO_LABORE = 'Pró-labore / retirada do dono'

// Painel "Estimar % produtivo": horas por semana fora de projeto
export const CATEGORIAS_FORA = [
  { key: 'reunioes', label: 'Reuniões internas' },
  { key: 'comercial', label: 'Comercial/atendimento' },
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'deslocamento', label: 'Deslocamento' },
  { key: 'capacitacao', label: 'Capacitação' },
  { key: 'retrabalho', label: 'Retrabalho/imprevistos' },
]

// ── formatação (pt-BR) ──
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtMoeda = (v) => (v == null || !Number.isFinite(v) ? '—' : fmtBRL.format(v))
export const fmtNum = (v, casas = 2) => (v == null || !Number.isFinite(v) ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }))
export const fmtPct = (fracao, casas = 1) => (fracao == null || !Number.isFinite(fracao) ? '—'
  : `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`)

// ── normalização (lista fechada de campos) ──
function novoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
// número finito entre 0 e `max` (ou null quando vazio/inválido)
function num(v, max = 1e9) {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, 0), max)
}
const txt = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '')
const padraoSe = (v, padrao, max) => (v === undefined ? padrao : num(v, max))

export const encargosPadrao = (tipo, proLabore) => (tipo === 'Pessoas' && !proLabore ? 20 : 0)

// Cenário salvo em outro formato (v1/v2): a tela avisa e não converte
export const formatoAntigo = (bruto) => !bruto || typeof bruto !== 'object' || bruto.versao !== VERSAO_DADOS

export function normalizarCusto(b = {}) {
  const tipo = TIPOS_CUSTO.some(t => t.value === b.tipo) ? b.tipo : 'Estrutura'
  const proLabore = b.pro_labore === true
  const base = proLabore ? PADRAO_DONO : PADRAO_PRODUTIVO
  const fora = {}
  for (const c of CATEGORIAS_FORA) fora[c.key] = num(b.fora_projeto?.[c.key], 168)
  return {
    id: typeof b.id === 'string' && b.id ? b.id.slice(0, 64) : novoId(),
    nome: txt(b.nome),
    tipo,
    valor_mensal: num(b.valor_mensal),
    encargos_pct: padraoSe(b.encargos_pct, encargosPadrao(tipo, proLabore), 1000),
    pro_labore: proLabore,
    produz_projeto: b.produz_projeto === true,
    horas_dia: padraoSe(b.horas_dia, base.horas_dia, 24),
    dias_semana: padraoSe(b.dias_semana, base.dias_semana, 7),
    pct_produtivo: padraoSe(b.pct_produtivo, base.pct_produtivo, 100),
    // 'estimado': o % sai das horas fora de projeto (painel "Estimar % produtivo")
    pct_modo: b.pct_modo === 'estimado' ? 'estimado' : 'digitado',
    fora_projeto: fora,
    // vazio fica vazio enquanto se digita; no cálculo, centro vazio = "Geral"
    centro_custo: b.centro_custo === undefined ? CENTRO_PADRAO : txt(b.centro_custo, 40),
  }
}

// Linhas de pró-labore: "produz projeto" segue "Considerar as horas produtivas do dono?"
export function sincronizarDono(d) {
  return { ...d, custos: d.custos.map(c => (c.pro_labore ? { ...c, produz_projeto: d.dono_considera_horas } : c)) }
}

export function normalizarDados(bruto) {
  const b = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}
  return sincronizarDono({
    versao: VERSAO_DADOS,
    op: padraoSe(b.op, OP_PADRAO, 100),
    dono_considera_horas: b.dono_considera_horas === true,
    custos: (Array.isArray(b.custos) ? b.custos : []).slice(0, MAX_ITENS).map(normalizarCusto),
  })
}

// "Do zero": já vem com a linha do pró-labore (valor 0)
export const dadosVazios = () => normalizarDados({
  custos: [{ nome: NOME_PRO_LABORE, tipo: 'Pessoas', valor_mensal: 0, encargos_pct: 0, pro_labore: true }],
})
export const dadosExemplo = () => normalizarDados(JSON.parse(JSON.stringify(EXEMPLO)))

// ── % produtivo ──
export const horasSemanais = (c) => (c.horas_dia || 0) * (c.dias_semana || 0)
export const totalForaProjeto = (c) => CATEGORIAS_FORA.reduce((s, k) => s + (c.fora_projeto?.[k.key] || 0), 0)

// % produtivo estimado (fração 0–1) = 1 − horas fora ÷ horas da semana
export function pctEstimado(c) {
  const semana = horasSemanais(c)
  if (!(semana > 0)) return null
  return Math.min(Math.max(1 - totalForaProjeto(c) / semana, 0), 1)
}

// fração 0–1 em uso na linha (null = não informado)
export function pctDaLinha(c) {
  if (c.pct_modo === 'estimado') return pctEstimado(c)
  return c.pct_produtivo == null ? null : Math.min(c.pct_produtivo, 100) / 100
}

const comEncargos = (valor, pct) => (valor || 0) * (1 + (pct || 0) / 100)

export const MSG_SEM_HORAS = 'Marque pelo menos uma pessoa que produz projeto. Se você trabalha sozinho, escolha Sim em “Considerar as horas produtivas do dono”.'
export const MSG_SEM_OP = 'Informe a OP (ocupação produtiva) para calcular o valor-hora.'

// ── cálculo principal ──
// Nunca devolve NaN/Infinity: o que não dá para calcular vem null + motivo.
export function calcular(entrada) {
  const d = normalizarDados(entrada)
  const op = (d.op || 0) / 100

  const linhas = d.custos.map(c => {
    const total = comEncargos(c.valor_mensal, c.encargos_pct)
    const pct = c.produz_projeto ? pctDaLinha(c) : null
    const hp = c.produz_projeto ? horasSemanais(c) * SEMANAS_MES * (pct || 0) : 0
    return { ...c, total, pct, hp }
  })
  const estrutura = linhas.filter(c => !c.produz_projeto).reduce((s, c) => s + c.total, 0)
  const equipe = linhas.filter(c => c.produz_projeto).reduce((s, c) => s + c.total, 0)
  const custoTotal = estrutura + equipe
  const H = linhas.reduce((s, c) => s + c.hp, 0)
  const horasVendaveis = H * op

  const motivo = !(H > 0) ? MSG_SEM_HORAS : !(op > 0) ? MSG_SEM_OP : null

  const avisos = []
  for (const c of linhas) {
    if (c.pro_labore && c.produz_projeto && !(c.hp > 0)) {
      avisos.push(`${c.nome || 'Pró-labore'}: com 0 hora produtiva, o custo do dono fica dividido pelas horas do restante da equipe.`)
    }
    if (c.produz_projeto && c.pct_modo === 'estimado' && horasSemanais(c) > 0 && totalForaProjeto(c) > horasSemanais(c)) {
      avisos.push(`${c.nome || 'Uma linha'}: as horas fora de projeto passam das horas da semana; o % produtivo ficou em 0%.`)
    }
  }

  const L = (rotulo, conta, resultado) => ({ rotulo, conta, resultado })

  // Método Prolu
  const valor = motivo ? null : custoTotal / horasVendaveis
  const prolu = {
    valor, motivo,
    memoria: motivo ? [] : [
      L('Custo total', `${fmtMoeda(estrutura)} de estrutura + ${fmtMoeda(equipe)} de equipe`, fmtMoeda(custoTotal)),
      L('Horas vendáveis', `${fmtNum(H)} h produtivas × ${fmtPct(op, 1)} (OP)`, `${fmtNum(horasVendaveis)} h`),
      L('Valor-hora', `${fmtMoeda(custoTotal)} ÷ ${fmtNum(horasVendaveis)} h`, fmtMoeda(valor)),
    ],
  }

  // Centro de custo (estrutura rateada pelas horas produtivas de todos)
  const grupos = []
  for (const c of linhas.filter(x => x.produz_projeto)) {
    const nome = c.centro_custo.trim() || CENTRO_PADRAO
    let g = grupos.find(x => x.nome.toLowerCase() === nome.toLowerCase())
    if (!g) { g = { nome, equipe: 0, H: 0 }; grupos.push(g) }
    g.equipe += c.total; g.H += c.hp
  }
  const estruturaHora = H > 0 ? estrutura / H : null
  const centros = motivo ? [] : grupos.map(g => (g.H > 0
    ? { ...g, estruturaHora, centroHora: g.equipe / g.H, valor: (estruturaHora + g.equipe / g.H) / op }
    : { ...g, valor: null, motivo: 'Sem horas produtivas neste centro.' }))
  const centro = {
    valor: null, centros, motivo, estruturaHora,
    memoria: motivo ? [] : [
      L('Estrutura por hora produtiva', `${fmtMoeda(estrutura)} ÷ ${fmtNum(H)} h`, fmtMoeda(estruturaHora)),
      ...centros.filter(g => g.valor != null).map(g => L(
        g.nome, `(${fmtMoeda(estruturaHora)} + ${fmtMoeda(g.equipe)} ÷ ${fmtNum(g.H)} h) ÷ ${fmtPct(op, 1)}`, fmtMoeda(g.valor))),
    ],
  }

  return { dados: d, linhas, estrutura, equipe, custoTotal, H, op, horasVendaveis, prolu, centro, avisos }
}
