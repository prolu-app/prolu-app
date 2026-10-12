// Conferência do cálculo de valor-hora (src/utils/valorHora.js) contra a
// planilha "método 1" da Prolu. Sem dependências: `node scripts/verificar-valor-hora.mjs`
import {
  calcular, dadosExemplo, dadosVazios, normalizarDados, normalizarCusto, pctEstimado, formatoAntigo,
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

// ── 1. Exemplo da planilha ──
console.log('— exemplo da planilha —')
const ex = calcular(dadosExemplo())
confere('estrutura', ex.estrutura, 17960)
confere('equipe', ex.equipe, 7300)
confere('custo total', ex.custoTotal, 25260)
confere('H', ex.H, 312.8)
confere('horas vendáveis', ex.horasVendaveis, 250.24)
confere('Prolu', r2(ex.prolu.valor), 100.94)
confere('Prolu com OP 100%', r2(calcular({ ...dadosExemplo(), op: 100 }).prolu.valor), 80.75)
confere('Centro Arquitetura', r2(centro(ex, 'Arquitetura').valor), 100.72)
confere('Centro Estágio', r2(centro(ex, 'Estágio').valor), 102.41)
const geral = calcular(comCustos(dadosExemplo(), cs => cs.map(c => ({ ...c, centro_custo: 'Geral' }))))
confere('um só centro "Geral" = Prolu', r2(centro(geral, 'Geral').valor), 100.94)
confere('centro vazio conta como "Geral"', r2(centro(calcular(comCustos(dadosExemplo(), cs => cs.map(c => ({ ...c, centro_custo: '' })))), 'Geral').valor), 100.94)
confere('sem avisos', ex.avisos.length, 0)
// diferença conhecida: a planilha antiga (célula D22) usava a equipe SEM encargos
confere('planilha antiga (equipe sem encargos)', r2(17960 / 180 + 6250 / 312.8), 119.76)

// ── 2. Dono = Sim ──
console.log('— dono considera as horas —')
const dono = normalizarDados({ ...dadosExemplo(), dono_considera_horas: true })
const linhaDono = dono.custos.find(c => c.pro_labore)
confere('pró-labore passa a produzir projeto', linhaDono.produz_projeto, true)
confere('padrão provisório do dono: 4 h/dia', linhaDono.horas_dia, 4)
confere('padrão provisório do dono: 50%', linhaDono.pct_produtivo, 50)
const rd = calcular(dono)
confere('estrutura', rd.estrutura, 11960)
confere('equipe', rd.equipe, 13300)
confere('H', rd.H, 352.8)
confere('Prolu', r2(rd.prolu.valor), 89.50)
const deVolta = calcular({ ...dono, dono_considera_horas: false })
confere('voltar para Não: pró-labore volta para a estrutura', deVolta.estrutura, 17960)
const donoZero = calcular(comCustos(dono, cs => cs.map(c => (c.pro_labore ? { ...c, horas_dia: 0 } : c))))
confere('dono com 0 h: aviso', donoZero.avisos.length, 1)
const forcado = calcular(comCustos(dadosExemplo(), cs => cs.map(c => (c.pro_labore ? { ...c, produz_projeto: true } : c))))
confere('pró-labore não produz se o toggle está em Não', forcado.estrutura, 17960)

// ── 3. +1 arquiteto / −1 estagiário ──
console.log('— contratação —')
const arq1 = dadosExemplo().custos.find(c => c.nome === 'Arquiteto 1')
confere('+1 arquiteto', r2(calcular(comCustos(dadosExemplo(), cs => [...cs, normalizarCusto({ ...arq1, id: undefined, nome: 'Arquiteto 3' })])).prolu.valor), 78.71)
confere('−1 estagiário', r2(calcular(comCustos(dadosExemplo(), cs => cs.filter(c => c.nome !== 'Estagiário A'))).prolu.valor), 111.49)

// ── 4. Escritório solo ──
console.log('— escritório solo —')
const solo = calcular({
  versao: 3, op: 80, dono_considera_horas: true,
  custos: [
    { nome: 'Estrutura', tipo: 'Estrutura', valor_mensal: 2000 },
    { nome: 'Pró-labore', tipo: 'Pessoas', valor_mensal: 6000, encargos_pct: 0, pro_labore: true, horas_dia: 8, dias_semana: 5, pct_produtivo: 60 },
  ],
})
confere('custo total', solo.custoTotal, 8000)
confere('H', solo.H, 96)
confere('Prolu', r2(solo.prolu.valor), 104.17)

// ── 5. % produtivo estimado ──
console.log('— % produtivo estimado —')
const est = normalizarCusto({ tipo: 'Pessoas', produz_projeto: true, horas_dia: 8, dias_semana: 5, pct_modo: 'estimado',
  fora_projeto: { reunioes: 4, administrativo: 3, deslocamento: 2, retrabalho: 1 } })
confere('1 − 10 ÷ 40', pctEstimado(est), 0.75)
confere('H com % estimado (40 × 4 × 75%)', calcular({ custos: [est] }).H, 120)

// ── 6. "Do zero", formato antigo, vazios e zeros ──
console.log('— do zero, formato antigo, vazios —')
const zero = dadosVazios()
confere('"Do zero" traz a linha do pró-labore', zero.custos.length === 1 && zero.custos[0].pro_labore && zero.custos[0].valor_mensal === 0, true)
confere('"Do zero" é versão 3', formatoAntigo(zero), false)
confere('v1 é formato antigo', formatoAntigo({ horasFuncionamento: 180, estrutura: [] }), true)
confere('v2 é formato antigo', formatoAntigo({ versao: 2, estrutura: [], equipe: [] }), true)
const vazio = calcular(dadosVazios())
confere('H = 0: Prolu null', vazio.prolu.valor, null)
confere('H = 0: motivo orienta', vazio.prolu.motivo.startsWith('Marque pelo menos uma pessoa'), true)
confere('H = 0: centros vazios', vazio.centro.centros.length, 0)
confere('OP = 0: Prolu null', calcular({ ...dadosExemplo(), op: 0 }).prolu.valor, null)
const lixo = calcular({ custos: [{ valor_mensal: 'abc', produz_projeto: true, horas_dia: -3, pct_produtivo: 500 }], op: 'x' })
confere('entradas inválidas: nenhum NaN/Infinity', /NaN|Infinity/.test(JSON.stringify([lixo, vazio])), false)

console.log(`\n${total - falhas}/${total} conferências ok`)
process.exit(falhas ? 1 : 0)
