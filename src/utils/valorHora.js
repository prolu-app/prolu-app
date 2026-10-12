// Cálculo do valor-hora de CUSTO do escritório (tela /precificacao/valor-hora).
// Funções puras, sem React nem Supabase: conferidas por
// scripts/verificar-valor-hora.mjs. Valores de custo, SEM margem e SEM
// impostos (esses ficam na Precificação).
//
// O banco guarda só as entradas (valor_hora_cenarios.dados, migration_053);
// os resultados saem daqui na hora, então as fórmulas mudam sem migration.
//
// Métodos (cada um para um porte de escritório):
//   M1 Método Prolu   = (Eef + Q) ÷ (H × FO)
//   M2 Centro de custo = (E ÷ H + Q_k ÷ H_k) ÷ FO, por centro k
//   M3 Começando      = (E + Q) ÷ (horas de funcionamento × OF)
import {
  TIPOS_CUSTO, FUNCOES, FUNCAO_DONO, CATEGORIAS_FORA, DISTRIBUICAO_FORA,
  HORAS_FUNCIONAMENTO_PADRAO, SEMANAS_MES_PADRAO, HORAS_DIA_PADRAO, DIAS_SEMANA_PADRAO,
  DONO_HORAS_DIA_PADRAO, CENTRO_PADRAO, FO_PADRAO, OF_PADRAO, EXEMPLO,
} from './valorHoraPadroes.js'

export const VERSAO_DADOS = 2
const MAX_ITENS = 100
const TIPOS = TIPOS_CUSTO.map(t => t.value)

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
const idOk = (v) => (typeof v === 'string' && v ? v.slice(0, 64) : null)
const padraoSe = (v, padrao, max) => (v === undefined ? padrao : num(v, max))

export const tipoInfo = (tipo) => TIPOS_CUSTO.find(t => t.value === tipo) || TIPOS_CUSTO[2]
export const funcaoInfo = (funcao) => (funcao === 'dono' ? FUNCAO_DONO : FUNCOES.find(f => f.value === funcao) || FUNCOES[FUNCOES.length - 1])
export const encargosPadraoItem = (tipo, proLabore) => (proLabore ? 0 : tipoInfo(tipo).encargosPct)
export const crescePadraoItem = (tipo, proLabore) => (proLabore ? false : tipoInfo(tipo).cresce)

export function normalizarItemEstrutura(b = {}) {
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'estrutura'
  const proLabore = b.pro_labore === true
  return {
    id: idOk(b.id) || novoId(),
    nome: txt(b.nome),
    tipo,
    valor_mensal: num(b.valor_mensal),
    encargos_pct: padraoSe(b.encargos_pct, encargosPadraoItem(tipo, proLabore), 1000),
    pro_labore: proLabore,
    cresce_com_equipe: typeof b.cresce_com_equipe === 'boolean' ? b.cresce_com_equipe : crescePadraoItem(tipo, proLabore),
  }
}

export function normalizarPessoa(b = {}) {
  const vinculo = idOk(b.vinculo_pro_labore_id)
  const funcao = vinculo ? 'dono' : (FUNCOES.some(f => f.value === b.funcao) ? b.funcao : 'outro')
  const info = funcaoInfo(funcao)
  const fora = {}
  for (const c of CATEGORIAS_FORA) fora[c.key] = num(b.fora_projeto?.[c.key], 168)
  return {
    id: idOk(b.id) || novoId(),
    nome: txt(b.nome),
    funcao,
    // vazio fica vazio enquanto se digita; no cálculo, centro vazio = "Geral"
    centro_custo: b.centro_custo === undefined ? CENTRO_PADRAO : txt(b.centro_custo, 40),
    custo_mensal: num(b.custo_mensal),
    encargos_pct: padraoSe(b.encargos_pct, info.encargosPct, 1000),
    horas_dia: padraoSe(b.horas_dia, vinculo ? DONO_HORAS_DIA_PADRAO : HORAS_DIA_PADRAO, 24),
    dias_semana: padraoSe(b.dias_semana, DIAS_SEMANA_PADRAO, 7),
    semanas_mes: padraoSe(b.semanas_mes, SEMANAS_MES_PADRAO, 5),
    pct_produtivo: padraoSe(b.pct_produtivo, info.pctProdutivo, 100),
    // 'digitado': vale pct_produtivo; 'estimado': sai das horas fora de projeto
    pct_modo: b.pct_modo === 'estimado' ? 'estimado' : 'digitado',
    fora_projeto: fora,
    vinculo_pro_labore_id: vinculo,
  }
}

// Dono produz: cada item pró-labore da estrutura vira uma linha vinculada na
// equipe (custo e encargos vêm do item). Não: as linhas vinculadas saem.
export function sincronizarDono(d) {
  const itens = d.estrutura.filter(i => i.pro_labore)
  if (!d.dono_produz) return { ...d, equipe: d.equipe.filter(p => !p.vinculo_pro_labore_id) }
  const ids = new Set(itens.map(i => i.id))
  let equipe = d.equipe.filter(p => !p.vinculo_pro_labore_id || ids.has(p.vinculo_pro_labore_id))
  const novas = itens.filter(i => !equipe.some(p => p.vinculo_pro_labore_id === i.id))
    .map(i => normalizarPessoa({ vinculo_pro_labore_id: i.id }))
  equipe = [...novas, ...equipe]
  const ordem = new Map(itens.map((i, n) => [i.id, n]))
  equipe = equipe.map(p => {
    if (!p.vinculo_pro_labore_id) return p
    const item = itens[ordem.get(p.vinculo_pro_labore_id)]
    const nome = itens.length === 1 ? 'Dono' : `Sócio ${ordem.get(p.vinculo_pro_labore_id) + 1}`
    return { ...p, nome, funcao: 'dono', custo_mensal: item.valor_mensal, encargos_pct: item.encargos_pct }
  })
  return { ...d, equipe }
}

// Cenários da primeira versão da tela (camelCase, sem FO/OF/centros)
function ehV1(b) {
  return b.versao !== VERSAO_DADOS && ('horasFuncionamento' in b || 'donoProduz' in b
    || (Array.isArray(b.estrutura) && b.estrutura.some(i => i && 'custo' in i)))
}
function converterV1(b) {
  const foraV1 = (f = {}) => ({ reunioes: f.reunioes, comercial: f.comercial, administrativo: f.administrativo, deslocamento: f.deslocamento, retrabalho: f.retrabalho })
  return {
    versao: VERSAO_DADOS,
    horas_funcionamento: b.horasFuncionamento,
    estrutura: (Array.isArray(b.estrutura) ? b.estrutura : []).map(i => ({
      id: i?.id, nome: i?.nome, tipo: i?.tipo, valor_mensal: i?.custo, encargos_pct: i?.encargosPct, pro_labore: i?.proLabore === true,
    })),
    dono_produz: b.donoProduz === true,
    // o dono da v1 era uma pessoa solta; aqui ele volta como linha vinculada ao pró-labore
    equipe: (Array.isArray(b.equipe) ? b.equipe : []).filter(p => p && p.funcao !== 'dono').map(p => ({
      id: p.id, nome: p.nome, funcao: p.funcao, custo_mensal: p.custo, encargos_pct: p.encargosPct,
      horas_dia: p.horasDia, dias_semana: p.diasSemana, semanas_mes: p.semanasMes,
      pct_produtivo: p.produtivoPct, pct_modo: p.produtivoModo, fora_projeto: foraV1(p.foraProjeto),
    })),
  }
}

export function normalizarDados(bruto) {
  let b = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}
  if (ehV1(b)) b = converterV1(b)
  const d = {
    versao: VERSAO_DADOS,
    horas_funcionamento: padraoSe(b.horas_funcionamento, HORAS_FUNCIONAMENTO_PADRAO, 744),
    estrutura: (Array.isArray(b.estrutura) ? b.estrutura : []).slice(0, MAX_ITENS).map(normalizarItemEstrutura),
    dono_produz: b.dono_produz === true,
    equipe: (Array.isArray(b.equipe) ? b.equipe : []).slice(0, MAX_ITENS).map(normalizarPessoa),
    equipe_referencia: b.equipe_referencia == null || b.equipe_referencia === '' ? null : num(b.equipe_referencia, 1000),
    fo: padraoSe(b.fo, FO_PADRAO, 100),
    of: padraoSe(b.of, OF_PADRAO, 100),
  }
  return sincronizarDono(d)
}

export const dadosVazios = () => normalizarDados({})
export const dadosExemplo = () => normalizarDados(JSON.parse(JSON.stringify(EXEMPLO)))

// ── % produtivo ──
export const horasSemanais = (p) => (p.horas_dia || 0) * (p.dias_semana || 0)
export const totalForaProjeto = (p) => CATEGORIAS_FORA.reduce((s, c) => s + (p.fora_projeto?.[c.key] || 0), 0)

// % produtivo estimado (fração 0–1) = 1 − horas fora ÷ horas na semana
export function pctEstimado(p) {
  const semana = horasSemanais(p)
  if (!(semana > 0)) return null
  return Math.min(Math.max(1 - totalForaProjeto(p) / semana, 0), 1)
}

// Horas fora de projeto sugeridas para a função, a partir do % inicial dela
export function foraProjetoSugerido(p) {
  const fora = horasSemanais(p) * (1 - funcaoInfo(p.funcao).pctProdutivo / 100)
  const pesos = DISTRIBUICAO_FORA[p.funcao] || DISTRIBUICAO_FORA.outro
  const r = {}
  for (const c of CATEGORIAS_FORA) r[c.key] = Math.round(fora * (pesos[c.key] || 0) * 2) / 2
  return r
}

// fração 0–1 em uso para a pessoa (null = não informado)
export function pctDaPessoa(p) {
  if (p.pct_modo === 'estimado') return pctEstimado(p)
  return p.pct_produtivo == null ? null : Math.min(p.pct_produtivo, 100) / 100
}

const comEncargos = (valor, pct) => (valor || 0) * (1 + (pct || 0) / 100)

// ── cálculo principal ──
// Nunca devolve NaN/Infinity: o que não dá para calcular vem null + motivo.
export function calcular(entrada) {
  const d = normalizarDados(entrada)
  const hf = d.horas_funcionamento || 0
  const fo = (d.fo || 0) / 100
  const of = (d.of || 0) / 100

  // estrutura (pró-labore sai quando o dono produz: ele vira linha da equipe)
  const estrutura = d.estrutura.map(i => ({
    ...i,
    total: comEncargos(i.valor_mensal, i.encargos_pct),
    fora: i.pro_labore && d.dono_produz,
  }))
  const noCalculo = estrutura.filter(i => !i.fora)
  const E = noCalculo.reduce((s, i) => s + i.total, 0)
  const Eform = noCalculo.filter(i => i.cresce_com_equipe).reduce((s, i) => s + i.total, 0)
  const FE = E > 0 ? Eform / E : 0

  // equipe
  const pessoas = d.equipe.map(p => {
    const pct = pctDaPessoa(p)
    const horasPagas = horasSemanais(p) * (p.semanas_mes || 0)
    const hp = horasPagas * (pct || 0)
    return { ...p, pct, horasPagas, hp, custo: comEncargos(p.custo_mensal, p.encargos_pct), dono: !!p.vinculo_pro_labore_id }
  })
  const H = pessoas.reduce((s, p) => s + p.hp, 0)
  const Q = pessoas.reduce((s, p) => s + p.custo, 0)
  const horasPagas = pessoas.reduce((s, p) => s + p.horasPagas, 0)

  // n: profissionais produtivos contratados (o dono fica fora: não é contratação)
  const n = pessoas.filter(p => !p.dono && p.hp > 0).length
  const nref = d.equipe_referencia ?? n
  const extras = nref > 0 ? Math.max(0, n - nref) : 0
  const Eef = nref > 0 ? E * (1 + FE * extras / nref) : E
  const ajusteEstrutura = Eef - E

  const temH = H > 0
  const temHF = hf > 0
  const FD = temH && temHF ? hf / H : null
  const pessoasEquivalentes = temH && temHF ? H / hf : null
  const horaFuncionamento = temHF ? E / hf : null
  const rateada = temH ? E / H : null
  const rateadaEf = temH ? Eef / H : null
  const horaEquipe = temH ? Q / H : null
  const semFO = temH ? (Eef + Q) / H : null
  const utilizacao = horasPagas > 0 ? (H / horasPagas) * fo : null

  // ── estados vazios / orientação ──
  const pendencias = []
  if (d.estrutura.length === 0 && d.equipe.length === 0) pendencias.push('Comece pela aba Estrutura: informe os custos mensais do escritório.')
  if (!temHF) pendencias.push('Informe as horas de funcionamento do escritório (aba Estrutura).')
  if (!temH) {
    if (d.equipe.length === 0 && !d.dono_produz) pendencias.push('Nenhuma pessoa produtiva na equipe. Escritório com o dono sozinho: marque “O dono produz?” = Sim na aba Equipe.')
    else if (d.dono_produz && !d.estrutura.some(i => i.pro_labore) && d.equipe.length === 0) pendencias.push('Marque o pró-labore na aba Estrutura para o dono entrar na equipe produtiva.')
    else pendencias.push('A equipe está sem horas produtivas: preencha horas por dia, dias por semana, semanas por mês e % produtivo.')
  }
  if (!(fo > 0)) pendencias.push('Informe a ocupação produtiva (FO) para calcular o Método Prolu e o Centro de custo.')
  if (!(of > 0)) pendencias.push('Informe a ocupação do funcionamento para calcular o método Começando.')

  const avisos = []
  for (const p of pessoas) {
    if (p.dono && !(p.hp > 0)) avisos.push({ tipo: 'dono', texto: `${p.nome}: com 0 hora produtiva, o custo dele não é coberto pelas horas dele; fica dividido pelas horas do restante da equipe.` })
    if (p.pct_modo === 'estimado' && horasSemanais(p) > 0 && totalForaProjeto(p) > horasSemanais(p)) {
      avisos.push({ tipo: 'estimativa', texto: `${p.nome || 'Uma pessoa'}: as horas fora de projeto passam das horas da semana; o % produtivo ficou em 0%.` })
    }
  }

  const L = (rotulo, conta, resultado) => ({ rotulo, conta, resultado })
  const motivoH = !temH ? 'Falta a equipe com horas produtivas.' : !(fo > 0) ? 'Falta a ocupação produtiva (FO).' : null

  // M1 Método Prolu
  const m1Valor = motivoH ? null : (Eef + Q) / (H * fo)
  const m1 = {
    id: 'm1', valor: m1Valor, motivo: motivoH, semFO,
    memoria: motivoH ? [] : [
      L('Estrutura efetiva (Eef)', extras > 0 ? `${fmtMoeda(E)} × (1 + ${fmtPct(FE)} × ${extras} ÷ ${fmtNum(nref)})` : `${fmtMoeda(E)} (sem contratações além da referência)`, fmtMoeda(Eef)),
      L('Estrutura rateada', `${fmtMoeda(Eef)} ÷ ${fmtNum(H)} h produtivas`, fmtMoeda(rateadaEf)),
      L('Hora da equipe', `${fmtMoeda(Q)} ÷ ${fmtNum(H)} h produtivas`, fmtMoeda(horaEquipe)),
      L('Sem ocupação', `${fmtMoeda(rateadaEf)} + ${fmtMoeda(horaEquipe)}`, fmtMoeda(semFO)),
      L('Valor-hora', `${fmtMoeda(semFO)} ÷ ${fmtPct(fo, 0)} (FO)`, fmtMoeda(m1Valor)),
    ],
  }

  // M2 Centro de custo (estrutura sem o ajuste FE; rateio por horas)
  const centros = []
  for (const p of pessoas) {
    const nomeCentro = p.centro_custo.trim() || CENTRO_PADRAO
    let c = centros.find(x => x.nome.toLowerCase() === nomeCentro.toLowerCase())
    if (!c) { c = { nome: nomeCentro, Q: 0, H: 0, pessoas: 0 }; centros.push(c) }
    c.Q += p.custo; c.H += p.hp; c.pessoas++
  }
  const m2Centros = motivoH ? [] : centros.map(c => (c.H > 0
    ? { ...c, horaCentro: c.Q / c.H, valor: (E / H + c.Q / c.H) / fo }
    : { ...c, valor: null, motivo: 'Sem horas produtivas neste centro.' }))
  const m2 = {
    id: 'm2', valor: null, centros: m2Centros, motivo: motivoH, FD, rateada,
    memoria: motivoH ? [] : [
      L('Estrutura rateada (FD)', `${fmtMoeda(E)} ÷ ${fmtNum(H)} h produtivas`, fmtMoeda(rateada)),
      ...m2Centros.filter(c => c.valor != null).map(c => L(
        c.nome, `(${fmtMoeda(rateada)} + ${fmtMoeda(c.Q)} ÷ ${fmtNum(c.H)} h) ÷ ${fmtPct(fo, 0)}`, fmtMoeda(c.valor))),
    ],
  }

  // M3 Começando
  const m3Motivo = !temHF ? 'Faltam as horas de funcionamento.' : !(of > 0) ? 'Falta a ocupação do funcionamento.' : null
  const m3Valor = m3Motivo ? null : (E + Q) / (hf * of)
  const m3 = {
    id: 'm3', valor: m3Valor, motivo: m3Motivo,
    alerta: !m3Motivo && H < hf,
    memoria: m3Motivo ? [] : [
      L('Estrutura + equipe', `${fmtMoeda(E)} + ${fmtMoeda(Q)}`, fmtMoeda(E + Q)),
      L('Valor-hora', `${fmtMoeda(E + Q)} ÷ (${fmtNum(hf)} h × ${fmtPct(of, 0)})`, fmtMoeda(m3Valor)),
    ],
  }

  return {
    dados: d,
    estrutura, E, Eform, FE, Eef, ajusteEstrutura,
    pessoas, H, Q, horasPagas, n, nref, extras,
    horasFuncionamento: hf, fo, of,
    FD, pessoasEquivalentes, horaFuncionamento, rateada, rateadaEf, horaEquipe, semFO, utilizacao,
    metodos: { m1, m2, m3 },
    pendencias, avisos,
  }
}

// Simulador do Método Prolu: hora necessária para cobrir os custos vendendo
// `ocupacaoPct`% das horas produtivas = (Eef + Q) ÷ (H × ocupação)
export function horaNecessaria(calc, ocupacaoPct) {
  if (!(calc.H > 0) || !(ocupacaoPct > 0)) return null
  return (calc.Eef + calc.Q) / (calc.H * (ocupacaoPct / 100))
}
