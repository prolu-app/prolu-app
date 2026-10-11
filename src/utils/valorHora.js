// Cálculo do valor-hora de CUSTO do escritório (tela /precificacao/valor-hora).
// Funções puras, sem React nem Supabase: conferidas por
// scripts/verificar-valor-hora.mjs. Valores de custo, SEM margem e SEM
// impostos (esses ficam na Precificação).
//
// O banco guarda só as entradas (valor_hora_cenarios.dados); os resultados
// saem daqui na hora, então as fórmulas podem mudar sem migration.
import {
  TIPOS_CUSTO, FUNCOES, CATEGORIAS_FORA, DISTRIBUICAO_FORA,
  HORAS_FUNCIONAMENTO_PADRAO, SEMANAS_MES_PADRAO, OCUPACAO_PADRAO,
  HORAS_DIA_PADRAO, DIAS_SEMANA_PADRAO, EXEMPLO,
} from './valorHoraPadroes.js'

const MAX_ITENS = 100
const TIPOS = TIPOS_CUSTO.map(t => t.value)
const FUNCOES_VALIDAS = FUNCOES.map(f => f.value)

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
// número finito ≥ 0 (ou null quando vazio/inválido); `max` limita absurdos
function num(v, max = 1e9) {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, 0), max)
}
const txt = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '')
const umDe = (v, lista, padrao) => (lista.includes(v) ? v : padrao)

export const encargosPadraoTipo = (tipo) => TIPOS_CUSTO.find(t => t.value === tipo)?.encargosPct ?? 0
export const funcaoInfo = (funcao) => FUNCOES.find(f => f.value === funcao) || FUNCOES[FUNCOES.length - 1]

export function normalizarItemEstrutura(b = {}) {
  const tipo = umDe(b.tipo, TIPOS, 'estrutura')
  const proLabore = b.proLabore === true
  return {
    id: typeof b.id === 'string' && b.id ? b.id.slice(0, 64) : novoId(),
    nome: txt(b.nome),
    tipo,
    custo: num(b.custo),
    encargosPct: b.encargosPct === undefined ? (proLabore ? 0 : encargosPadraoTipo(tipo)) : num(b.encargosPct, 1000),
    proLabore,
  }
}

export function normalizarPessoa(b = {}) {
  const funcao = umDe(b.funcao, FUNCOES_VALIDAS, 'outro')
  const info = funcaoInfo(funcao)
  const fora = {}
  for (const c of CATEGORIAS_FORA) fora[c.key] = num(b.foraProjeto?.[c.key], 168)
  return {
    id: typeof b.id === 'string' && b.id ? b.id.slice(0, 64) : novoId(),
    nome: txt(b.nome),
    funcao,
    custo: num(b.custo),
    encargosPct: b.encargosPct === undefined ? info.encargosPct : num(b.encargosPct, 1000),
    horasDia: b.horasDia === undefined ? HORAS_DIA_PADRAO : num(b.horasDia, 24),
    diasSemana: b.diasSemana === undefined ? DIAS_SEMANA_PADRAO : num(b.diasSemana, 7),
    semanasMes: b.semanasMes === undefined ? SEMANAS_MES_PADRAO : num(b.semanasMes, 5),
    produtivoPct: b.produtivoPct === undefined ? info.produtivoPct : num(b.produtivoPct, 100),
    // 'digitado': vale produtivoPct; 'estimado': sai das horas fora de projeto
    produtivoModo: b.produtivoModo === 'estimado' ? 'estimado' : 'digitado',
    foraProjeto: fora,
  }
}

export function normalizarDados(bruto) {
  const b = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}
  return {
    estrutura: (Array.isArray(b.estrutura) ? b.estrutura : []).slice(0, MAX_ITENS).map(normalizarItemEstrutura),
    horasFuncionamento: b.horasFuncionamento === undefined ? HORAS_FUNCIONAMENTO_PADRAO : num(b.horasFuncionamento, 744),
    ocupacaoPct: b.ocupacaoPct === undefined ? OCUPACAO_PADRAO : num(b.ocupacaoPct, 100),
    donoProduz: b.donoProduz === true,
    equipe: (Array.isArray(b.equipe) ? b.equipe : []).slice(0, MAX_ITENS).map(normalizarPessoa),
  }
}

export const dadosVazios = () => normalizarDados({})
export const dadosExemplo = () => normalizarDados(JSON.parse(JSON.stringify(EXEMPLO)))

// ── % produtivo ──
export const horasSemanais = (p) => (p.horasDia || 0) * (p.diasSemana || 0)
export const totalForaProjeto = (p) => CATEGORIAS_FORA.reduce((s, c) => s + (p.foraProjeto?.[c.key] || 0), 0)

// % produtivo estimado (fração 0–1) = 1 − fora de projeto ÷ horas semanais.
// null quando não há horas semanais para dividir.
export function produtivoEstimado(p) {
  const semana = horasSemanais(p)
  if (!(semana > 0)) return null
  return Math.min(Math.max(1 - totalForaProjeto(p) / semana, 0), 1)
}

// Horas fora de projeto sugeridas para a função, a partir do % inicial dela
export function foraProjetoSugerido(p) {
  const semana = horasSemanais(p)
  const fora = semana * (1 - funcaoInfo(p.funcao).produtivoPct / 100)
  const pesos = DISTRIBUICAO_FORA[p.funcao] || DISTRIBUICAO_FORA.outro
  const r = {}
  for (const c of CATEGORIAS_FORA) r[c.key] = Math.round(fora * (pesos[c.key] || 0) * 2) / 2
  return r
}

// fração 0–1 em uso para a pessoa (null = não informado)
export function produtivoDaPessoa(p) {
  if (p.produtivoModo === 'estimado') return produtivoEstimado(p)
  return p.produtivoPct == null ? null : Math.min(p.produtivoPct, 100) / 100
}

const comEncargos = (custo, pct) => (custo || 0) * (1 + (pct || 0) / 100)

// ── cálculo principal ──
// Devolve totais, os 4 métodos (valor em R$/h ou null + motivo), memória de
// cálculo, avisos e pendências. Nunca devolve NaN/Infinity.
export function calcular(entrada) {
  const d = normalizarDados(entrada)
  const temDonoNaEquipe = d.equipe.some(p => p.funcao === 'dono')
  const temProLabore = d.estrutura.some(i => i.proLabore && (i.custo || 0) > 0)

  // estrutura: com o dono na equipe, o pró-labore sai em TODOS os métodos
  const estrutura = d.estrutura.map(i => ({
    ...i,
    total: comEncargos(i.custo, i.encargosPct),
    fora: i.proLabore && temDonoNaEquipe,
  }))
  const totalEstrutura = estrutura.filter(i => !i.fora).reduce((s, i) => s + i.total, 0)

  const pessoas = d.equipe.map(p => {
    const prod = produtivoDaPessoa(p)
    const horasMes = horasSemanais(p) * (p.semanasMes || 0)
    const horasProdutivas = horasMes * (prod || 0)
    const custo = comEncargos(p.custo, p.encargosPct)
    return { ...p, produtivo: prod, horasMes, horasProdutivas, custoComEncargos: custo }
  })
  const custoEquipe = pessoas.reduce((s, p) => s + p.custoComEncargos, 0)
  const horasProdutivas = pessoas.reduce((s, p) => s + p.horasProdutivas, 0)
  const hf = d.horasFuncionamento || 0

  // ── pendências (o que falta preencher) e avisos ──
  const faltaHF = !(hf > 0)
  const faltaHP = !(horasProdutivas > 0)
  const pendencias = []
  if (faltaHF) pendencias.push('Informe as horas de funcionamento do escritório por mês.')
  if (d.equipe.length === 0) pendencias.push('Cadastre pelo menos uma pessoa na equipe produtiva.')
  else if (faltaHP) pendencias.push('A equipe produtiva está sem horas produtivas: preencha horas por dia, dias por semana, semanas por mês e % produtivo.')
  if (totalEstrutura === 0 && custoEquipe === 0) pendencias.push('Informe os custos mensais da estrutura e da equipe.')

  const avisos = []
  if (temDonoNaEquipe && !d.donoProduz) {
    avisos.push({ tipo: 'duplicado', texto: 'O dono está na equipe produtiva e o pró-labore está na estrutura: isso duplicaria o custo. O pró-labore foi tirado da estrutura no cálculo. Marque "Dono produz? Sim" ou tire o dono da equipe.' })
  }
  if (d.donoProduz && !temDonoNaEquipe) {
    avisos.push({ tipo: 'dono', texto: '"Dono produz?" está em Sim, mas não há ninguém com a função Dono/sócio na equipe. Adicione o dono à equipe para tirar o pró-labore da estrutura.' })
  }
  if (d.donoProduz && temDonoNaEquipe && !temProLabore) {
    avisos.push({ tipo: 'dono', texto: 'Nenhum custo da estrutura está marcado como pró-labore do dono. Se o pró-labore estiver lá, marque-o para não somar duas vezes.' })
  }
  for (const p of pessoas) {
    if (p.produtivoModo === 'estimado' && horasSemanais(p) > 0 && totalForaProjeto(p) > horasSemanais(p)) {
      avisos.push({ tipo: 'estimativa', texto: `${p.nome || 'Uma pessoa'}: as horas fora de projeto passam das horas da semana; o % produtivo ficou em 0%.` })
    }
  }

  // ── grandezas comuns ──
  const fator = !faltaHF && !faltaHP ? hf / horasProdutivas : null          // horas de funcionamento ÷ horas produtivas
  const pessoasEquivalentes = !faltaHF && !faltaHP ? horasProdutivas / hf : null
  const horaBruta = !faltaHF ? totalEstrutura / hf : null                    // estrutura ÷ funcionamento
  const horaRateada = horaBruta != null && fator != null ? horaBruta * fator : null // = estrutura ÷ horas produtivas
  const ocupacaoEmbutida = fator != null && fator < 1 ? fator : null

  const motivo = (precisaHF, precisaHP) => {
    if (precisaHF && faltaHF) return 'Falta informar as horas de funcionamento.'
    if (precisaHP && faltaHP) return 'Falta a equipe produtiva com horas produtivas.'
    return null
  }
  const L = (rotulo, conta, resultado) => ({ rotulo, conta, resultado })

  // M1 — Funcionamento + produtiva
  const m1Motivo = motivo(true, true)
  const m1Estrutura = m1Motivo ? null : totalEstrutura / hf
  const m1Equipe = m1Motivo ? null : custoEquipe / horasProdutivas
  const m1 = {
    id: 'm1',
    valor: m1Motivo ? null : m1Estrutura + m1Equipe,
    motivo: m1Motivo,
    ocupacaoEmbutida,
    memoria: m1Motivo ? [] : [
      L('Estrutura por hora de funcionamento', `${fmtMoeda(totalEstrutura)} ÷ ${fmtNum(hf)} h`, fmtMoeda(m1Estrutura)),
      L('Equipe por hora produtiva', `${fmtMoeda(custoEquipe)} ÷ ${fmtNum(horasProdutivas)} h`, fmtMoeda(m1Equipe)),
      L('Valor-hora', `${fmtMoeda(m1Estrutura)} + ${fmtMoeda(m1Equipe)}`, fmtMoeda(m1Estrutura + m1Equipe)),
      ...(ocupacaoEmbutida != null ? [L('Ocupação embutida na estrutura', `${fmtNum(hf)} h ÷ ${fmtNum(horasProdutivas)} h`, fmtPct(ocupacaoEmbutida))] : []),
    ],
  }

  // M2 — Por setor/pessoa
  const m2Motivo = motivo(true, true)
  const m2Pessoas = m2Motivo ? [] : pessoas.map(p => {
    if (!(p.horasProdutivas > 0)) return { id: p.id, nome: p.nome, funcao: p.funcao, valor: null, motivo: 'Sem horas produtivas.' }
    const propria = p.custoComEncargos / p.horasProdutivas
    return { id: p.id, nome: p.nome, funcao: p.funcao, valor: horaRateada + propria, custoHora: propria, horasProdutivas: p.horasProdutivas, custoComEncargos: p.custoComEncargos }
  })
  const m2 = {
    id: 'm2',
    valor: null,                       // um valor por pessoa (m2.pessoas)
    pessoas: m2Pessoas,
    motivo: m2Motivo,
    horaBruta, horaRateada, fator, pessoasEquivalentes,
    memoria: m2Motivo ? [] : [
      L('Hora de funcionamento bruta', `${fmtMoeda(totalEstrutura)} ÷ ${fmtNum(hf)} h`, fmtMoeda(horaBruta)),
      L('Fator (funcionamento ÷ produtivas)', `${fmtNum(hf)} h ÷ ${fmtNum(horasProdutivas)} h`, fmtNum(fator, 4)),
      L('Pessoas produtivas equivalentes', `${fmtNum(horasProdutivas)} h ÷ ${fmtNum(hf)} h`, fmtNum(pessoasEquivalentes)),
      L('Hora de funcionamento rateada', `${fmtMoeda(horaBruta)} × ${fmtNum(fator, 4)}`, fmtMoeda(horaRateada)),
      ...m2Pessoas.filter(p => p.valor != null).map(p => L(
        p.nome || 'Sem nome',
        `${fmtMoeda(horaRateada)} + ${fmtMoeda(p.custoComEncargos)} ÷ ${fmtNum(p.horasProdutivas)} h`,
        fmtMoeda(p.valor))),
    ],
  }

  // M3 — Tudo ÷ horas de funcionamento
  const m3Motivo = motivo(true, false)
  const total = totalEstrutura + custoEquipe
  const m3 = {
    id: 'm3',
    valor: m3Motivo ? null : total / hf,
    motivo: m3Motivo,
    ocupacaoEmbutida,
    memoria: m3Motivo ? [] : [
      L('Estrutura + equipe com encargos', `${fmtMoeda(totalEstrutura)} + ${fmtMoeda(custoEquipe)}`, fmtMoeda(total)),
      L('Valor-hora', `${fmtMoeda(total)} ÷ ${fmtNum(hf)} h`, fmtMoeda(total / hf)),
      ...(ocupacaoEmbutida != null ? [L('Ocupação suposta', `${fmtNum(hf)} h ÷ ${fmtNum(horasProdutivas)} h`, fmtPct(ocupacaoEmbutida))] : []),
    ],
  }

  // M4 — Tudo ÷ horas produtivas
  const m4Motivo = motivo(false, true)
  const m4 = {
    id: 'm4',
    valor: m4Motivo ? null : total / horasProdutivas,
    motivo: m4Motivo,
    memoria: m4Motivo ? [] : [
      L('Estrutura + equipe com encargos', `${fmtMoeda(totalEstrutura)} + ${fmtMoeda(custoEquipe)}`, fmtMoeda(total)),
      L('Horas produtivas da equipe', pessoas.filter(p => p.horasProdutivas > 0).map(p => fmtNum(p.horasProdutivas)).join(' + ') || '0', `${fmtNum(horasProdutivas)} h`),
      L('Valor-hora (100% de ocupação)', `${fmtMoeda(total)} ÷ ${fmtNum(horasProdutivas)} h`, fmtMoeda(total / horasProdutivas)),
    ],
  }

  return {
    dados: d,
    estrutura, totalEstrutura,
    pessoas, custoEquipe, horasProdutivas,
    horasFuncionamento: hf,
    fator, pessoasEquivalentes, horaBruta, horaRateada, ocupacaoEmbutida,
    temDonoNaEquipe,
    metodos: { m1, m2, m3, m4 },
    pendencias, avisos,
  }
}

// ── simulador de ocupação ──
// custo por hora VENDIDA = valor-hora ÷ ocupação (ocupação em %)
export function custoPorHoraVendida(valor, ocupacaoPct) {
  if (valor == null || !Number.isFinite(valor) || !(ocupacaoPct > 0)) return null
  return valor / (ocupacaoPct / 100)
}
