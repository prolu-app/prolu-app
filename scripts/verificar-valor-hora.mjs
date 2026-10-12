// Conferência do cálculo de valor-hora (src/utils/valorHora.js) contra a
// planilha "método 1" da Prolu. Sem dependências: `node scripts/verificar-valor-hora.mjs`
import {
  calcular, dadosExemplo, dadosVazios, normalizarDados, normalizarCusto, formatoAntigo, TIPO_PRO_LABORE,
} from '../src/utils/valorHora.js'

let falhas = 0
let total = 0
function confere(nome, obtido, esperado, tol = 0.005) {
  total++
  const ok = typeof esperado === 'number'
    ? obtido != null && Number.isFinite(obtido) && Math.abs(obtido - esperado) <= tol
    : obtido === esperado
  if (!ok) falhas++
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}: ${obtido}${ok ? '' : ` (esperado ${esperado})`}`)
}
const r2 = (v) => (v == null ? v : Math.round(v * 100) / 100)
const centro = (c, nome) => c.centro.centros.find(x => x.nome === nome)
const comCustos = (d, fn) => ({ ...d, custos: fn(d.custos) })
const ehProLabore = (c) => c.tipo === TIPO_PRO_LABORE

// ── 1. Exemplo da tela ("Com o exemplo": Estagiário 4 h × 5 dias) ──
console.log('— exemplo da tela —')
const ex = calcular(dadosExemplo())
confere('estrutura', ex.estrutura, 17960)
confere('equipe', ex.equipe, 7300)
confere('custo total', ex.custoTotal, 25260)
confere('horas do Estagiário A', ex.linhas.find(c => c.nome === 'Estagiário A').hp, 68)
confere('H', ex.H, 340)
confere('horas vendáveis', ex.horasVendaveis, 272)
confere('Prolu', r2(ex.prolu.valor), 92.87)
confere('Prolu com OP 100%', r2(calcular({ ...dadosExemplo(), op: 100 }).prolu.valor), 74.29)
confere('Centro Arquitetura', r2(centro(ex, 'Arquitetura').valor), 94.98)
confere('Centro Estágio', r2(centro(ex, 'Estágio').valor), 84.41)
const geral = calcular(comCustos(dadosExemplo(), cs => cs.map(c => ({ ...c, centro_custo: 'Geral' }))))
confere('um só centro "Geral" = Prolu', r2(centro(geral, 'Geral').valor), 92.87)
confere('centro vazio conta como "Geral"', r2(centro(calcular(comCustos(dadosExemplo(), cs => cs.map(c => ({ ...c, centro_custo: '' })))), 'Geral').valor), 92.87)
confere('sem avisos', ex.avisos.length, 0)

// ── 2. Regressão: fixture ORIGINAL da planilha (Estagiário 4 h × 3 dias) ──
console.log('— fixture original da planilha —')
const original = () => comCustos(dadosExemplo(), cs => cs.map(c => (c.nome === 'Estagiário A' ? { ...c, dias_semana: 3 } : c)))
const or = calcular(original())
confere('H', or.H, 312.8)
confere('Prolu', r2(or.prolu.valor), 100.94)
confere('Prolu com OP 100%', r2(calcular({ ...original(), op: 100 }).prolu.valor), 80.75)
confere('Centro Arquitetura', r2(centro(or, 'Arquitetura').valor), 100.72)
confere('Centro Estágio', r2(centro(or, 'Estágio').valor), 102.41)
// diferença conhecida: a planilha antiga (célula D22) usava a equipe SEM encargos
confere('planilha antiga (equipe sem encargos)', r2(17960 / 180 + 6250 / 312.8), 119.76)

// pró-labore marcado "Produz projeto?" com 4 h × 5 dias × 50% = 40 h (caso da planilha)
const donoProduz = calcular(comCustos(original(), cs => cs.map(c => (ehProLabore(c) ? { ...c, produz_projeto: true, horas_dia: 4 } : c))))
confere('pró-labore produz: horas do dono', donoProduz.linhas.find(ehProLabore).hp, 40)
confere('pró-labore produz com o padrão (8 h × 5 dias × 50% = 80 h)', calcular(comCustos(original(), cs => cs.map(c => (ehProLabore(c) ? { ...c, produz_projeto: true } : c)))).linhas.find(ehProLabore).hp, 80)
confere('pró-labore produz: estrutura', donoProduz.estrutura, 11960)
confere('pró-labore produz: equipe', donoProduz.equipe, 13300)
confere('pró-labore produz: H', donoProduz.H, 352.8)
confere('pró-labore produz: Prolu', r2(donoProduz.prolu.valor), 89.50)

const arq1 = dadosExemplo().custos.find(c => c.nome === 'Arquiteto 1')
confere('+1 arquiteto', r2(calcular(comCustos(original(), cs => [...cs, normalizarCusto({ ...arq1, id: undefined, nome: 'Arquiteto 3' })])).prolu.valor), 78.71)
confere('−1 estagiário', r2(calcular(comCustos(original(), cs => cs.filter(c => c.nome !== 'Estagiário A'))).prolu.valor), 111.49)

// ── 3. Escritório solo ──
console.log('— escritório solo —')
const solo = calcular({
  versao: 3, op: 80,
  custos: [
    { nome: 'Estrutura', tipo: 'Estrutura', valor_mensal: 2000 },
    { nome: 'Pró-labore', tipo: TIPO_PRO_LABORE, valor_mensal: 6000, encargos_pct: 0, produz_projeto: true, horas_dia: 8, dias_semana: 5, pct_produtivo: 60 },
  ],
})
confere('custo total', solo.custoTotal, 8000)
confere('H', solo.H, 96)
confere('Prolu', r2(solo.prolu.valor), 104.17)

// ── 4. Tipo "Pró-labore / retirada" e leitura tolerante do v3 anterior ──
console.log('— tipo pró-labore e v3 anterior —')
const novoPro = normalizarCusto({ tipo: TIPO_PRO_LABORE })
confere('pró-labore: encargos padrão 0%', novoPro.encargos_pct, 0)
confere('pró-labore: padrão do dono 8 h/dia', novoPro.horas_dia, 8)
confere('pró-labore: padrão do dono 50%', novoPro.pct_produtivo, 50)
confere('Pessoas: encargos padrão 20%', normalizarCusto({ tipo: 'Pessoas' }).encargos_pct, 20)
const dois = calcular({ versao: 3, custos: [
  { tipo: TIPO_PRO_LABORE, valor_mensal: 5000, produz_projeto: true },
  { tipo: TIPO_PRO_LABORE, valor_mensal: 4000 },
] })
confere('dois sócios: um produz, outro fica na estrutura', `${dois.equipe}/${dois.estrutura}`, '5000/4000')
const antigoV3 = { versao: 3, op: 80, dono_considera_horas: true, custos: [
  { nome: 'Pró-labore', tipo: 'Pessoas', valor_mensal: 6000, encargos_pct: 0, pro_labore: true, produz_projeto: false, horas_dia: 4, dias_semana: 5, pct_produtivo: 50, pct_modo: 'estimado', fora_projeto: { reunioes: 2 } },
  { nome: 'Aluguel', tipo: 'Estrutura', valor_mensal: 2000, pro_labore: false },
] }
const lido = normalizarDados(antigoV3)
confere('v3 anterior: pro_labore vira o tipo Pró-labore / retirada', lido.custos[0].tipo, TIPO_PRO_LABORE)
confere('v3 anterior: dono_considera_horas marca produz projeto', lido.custos[0].produz_projeto, true)
confere('v3 anterior: valores preservados', `${lido.custos[0].valor_mensal}/${lido.custos[0].horas_dia}/${lido.custos[0].pct_produtivo}`, '6000/4/50')
confere('v3 anterior: campos desconhecidos ignorados', ['pro_labore', 'pct_modo', 'fora_projeto'].some(k => k in lido.custos[0]) || 'dono_considera_horas' in lido, false)
confere('v3 anterior com dono Não: pró-labore fica na estrutura', normalizarDados({ ...antigoV3, dono_considera_horas: false }).custos[0].produz_projeto, false)

// ── 5. "Do zero", formato antigo, vazios e zeros ──
console.log('— do zero, formato antigo, vazios —')
const zero = dadosVazios()
confere('"Do zero" traz a linha do pró-labore', zero.custos.length === 1 && zero.custos[0].tipo === TIPO_PRO_LABORE && zero.custos[0].valor_mensal === 0, true)
confere('"Do zero" é versão 3', formatoAntigo(zero), false)
confere('v1 é formato antigo', formatoAntigo({ horasFuncionamento: 180, estrutura: [] }), true)
confere('v2 é formato antigo', formatoAntigo({ versao: 2, estrutura: [], equipe: [] }), true)
const vazio = calcular(dadosVazios())
confere('H = 0: Prolu null', vazio.prolu.valor, null)
confere('H = 0: orienta marcar "Produz projeto?"', vazio.prolu.motivo.startsWith('Marque “Produz projeto?”'), true)
confere('H = 0: centros vazios', vazio.centro.centros.length, 0)
confere('OP = 0: Prolu null', calcular({ ...dadosExemplo(), op: 0 }).prolu.valor, null)
const lixo = calcular({ custos: [{ valor_mensal: 'abc', produz_projeto: true, horas_dia: -3, pct_produtivo: 500 }], op: 'x' })
confere('entradas inválidas: nenhum NaN/Infinity', /NaN|Infinity/.test(JSON.stringify([lixo, vazio])), false)

console.log(`\n${total - falhas}/${total} conferências ok`)
process.exit(falhas ? 1 : 0)
