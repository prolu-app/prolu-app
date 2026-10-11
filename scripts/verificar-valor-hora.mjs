// Conferência do cálculo de valor-hora (src/utils/valorHora.js) contra o
// exemplo da planilha Prolu. Sem dependências: `node scripts/verificar-valor-hora.mjs`
import {
  calcular, dadosExemplo, dadosVazios, normalizarDados, custoPorHoraVendida,
  produtivoEstimado,
} from '../src/utils/valorHora.js'

let falhas = 0
let total = 0
function confere(nome, obtido, esperado, tol = 0.005) {
  total++
  const ok = typeof esperado === 'number'
    ? obtido != null && Number.isFinite(obtido) && Math.abs(obtido - esperado) <= tol
    : obtido === esperado
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${obtido}${ok ? '' : ` (esperado ${esperado})`}`)
}
const r2 = (v) => (v == null ? v : Math.round(v * 100) / 100)

// ── 1. Exemplo da planilha ──
const ex = calcular(dadosExemplo())
confere('total da estrutura', ex.totalEstrutura, 17960)
confere('custo da equipe com encargos', ex.custoEquipe, 7300)
confere('horas produtivas Arquiteto 1', ex.pessoas[0].horasProdutivas, 136)
confere('horas produtivas Arquiteto 2', ex.pessoas[1].horasProdutivas, 136)
confere('horas produtivas Estagiário', ex.pessoas[2].horasProdutivas, 40.8)
confere('horas produtivas totais', ex.horasProdutivas, 312.8)
confere('M4', r2(ex.metodos.m4.valor), 80.75)
confere('M3', r2(ex.metodos.m3.valor), 140.33)
confere('M1', r2(ex.metodos.m1.valor), 123.12)
confere('fator', Math.round(ex.fator * 10000) / 10000, 0.5754, 0.00005)
confere('pessoas equivalentes', r2(ex.pessoasEquivalentes), 1.74)
confere('hora de funcionamento rateada', r2(ex.horaRateada), 57.42)
confere('M2 Arquiteto 1', r2(ex.metodos.m2.pessoas[0].valor), 79.48)
confere('M2 Arquiteto 2', r2(ex.metodos.m2.pessoas[1].valor), 81.68)
confere('M2 Estagiário', r2(ex.metodos.m2.pessoas[2].valor), 81.93)
confere('ocupação embutida (M1/M3)', r2(ex.ocupacaoEmbutida), 0.58)
const m4 = ex.metodos.m4.valor
confere('simulador M4 100%', r2(custoPorHoraVendida(m4, 100)), 80.75)
confere('simulador M4 80%', r2(custoPorHoraVendida(m4, 80)), 100.94)
confere('simulador M4 70%', r2(custoPorHoraVendida(m4, 70)), 115.36)
confere('simulador M4 60%', r2(custoPorHoraVendida(m4, 60)), 134.59)
// planilha original: M1 com o custo da equipe SEM encargos (célula D22) dá 119,76
confere('M1 com equipe sem encargos (planilha original)', r2(17960 / 180 + 6250 / 312.8), 119.76)
confere('sem pendências nem avisos', ex.pendencias.length + ex.avisos.length, 0)

// ── 2. Dono produz ──
const comDono = dadosExemplo()
comDono.donoProduz = true
comDono.equipe.push({ ...normalizarDados({ equipe: [{ funcao: 'dono', nome: 'Dono', custo: 6000 }] }).equipe[0] })
const rd = calcular(comDono)
confere('dono na equipe: pró-labore sai da estrutura', rd.totalEstrutura, 11960)
confere('dono na equipe: pró-labore marcado como fora', rd.estrutura[4].fora, true)
confere('dono na equipe: custo da equipe inclui o pró-labore', rd.custoEquipe, 13300)
confere('dono produz Sim: sem aviso de duplicidade', rd.avisos.some(a => a.tipo === 'duplicado'), false)
const duplicado = { ...comDono, donoProduz: false }
const rdup = calcular(duplicado)
confere('dono na equipe com "Não": aviso de duplicidade', rdup.avisos.some(a => a.tipo === 'duplicado'), true)
confere('aviso de duplicidade: não soma duas vezes', rdup.totalEstrutura, 11960)

// ── 3. % produtivo estimado ──
const p = normalizarDados({ equipe: [{ funcao: 'arquiteto', horasDia: 8, diasSemana: 5, produtivoModo: 'estimado',
  foraProjeto: { reunioes: 4, administrativo: 3, deslocamento: 2, retrabalho: 1 } }] }).equipe[0]
confere('estimado = 1 − 10 ÷ 40', produtivoEstimado(p), 0.75)
const est = calcular({ horasFuncionamento: 180, equipe: [p] })
confere('horas produtivas com % estimado (40 × 4 × 75%)', est.horasProdutivas, 120)
const digitado = calcular({ horasFuncionamento: 180, equipe: [{ ...p, produtivoModo: 'digitado', produtivoPct: 60 }] })
confere('horas produtivas com % digitado (40 × 4 × 60%)', digitado.horasProdutivas, 96)
const demais = calcular({ horasFuncionamento: 180, equipe: [{ ...p, foraProjeto: { outros: 60 } }] })
confere('fora de projeto > semana: 0% e aviso', demais.avisos.some(a => a.tipo === 'estimativa'), true)

// ── 4. Divisão por zero / entradas vazias ──
const vazio = calcular(dadosVazios())
confere('vazio: M1 null', vazio.metodos.m1.valor, null)
confere('vazio: M4 null', vazio.metodos.m4.valor, null)
confere('vazio: tem pendências', vazio.pendencias.length > 0, true)
const semHF = calcular({ ...dadosExemplo(), horasFuncionamento: 0 })
confere('sem funcionamento: M3 null', semHF.metodos.m3.valor, null)
confere('sem funcionamento: M4 ainda calcula', r2(semHF.metodos.m4.valor), 80.75)
const semHoras = calcular({ ...dadosExemplo(), equipe: dadosExemplo().equipe.map(x => ({ ...x, horasDia: 0 })) })
confere('equipe sem horas: M4 null', semHoras.metodos.m4.valor, null)
confere('equipe sem horas: M3 ainda calcula', r2(semHoras.metodos.m3.valor), 140.33)
confere('ocupação 0%: simulador null', custoPorHoraVendida(80, 0), null)
const lixo = calcular({ estrutura: 'x', equipe: [{ custo: 'abc', horasDia: -3, produtivoPct: 500 }], horasFuncionamento: 'NaN' })
const valores = JSON.stringify(lixo.metodos)
confere('entradas inválidas: nenhum NaN/Infinity', /NaN|Infinity/.test(valores), false)

console.log(`\n${total - falhas}/${total} conferências ok`)
process.exit(falhas ? 1 : 0)
