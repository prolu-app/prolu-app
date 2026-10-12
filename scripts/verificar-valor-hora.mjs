// Conferência do cálculo de valor-hora (src/utils/valorHora.js) contra a
// planilha "método 1" da Prolu. Sem dependências: `node scripts/verificar-valor-hora.mjs`
import {
  calcular, dadosExemplo, dadosVazios, normalizarDados, normalizarPessoa, horaNecessaria, pctEstimado,
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
const arquiteto = (nome, extra = {}) => ({ nome, funcao: 'arquiteto', centro_custo: 'Arquitetura', custo_mensal: 2500, encargos_pct: 20, horas_dia: 8, dias_semana: 5, semanas_mes: 4, pct_produtivo: 85, ...extra })

// ── 1. Fixture da planilha ──
console.log('— fixture da planilha —')
const ex = calcular(dadosExemplo())
confere('E', ex.E, 17960)
confere('Q', ex.Q, 7300)
confere('H', ex.H, 312.8)
confere('FE', r2(ex.FE * 100), 29.51)
confere('FD', Math.round(ex.FD * 10000) / 10000, 0.5754, 0.00005)
confere('pessoas equivalentes', r2(ex.pessoasEquivalentes), 1.74)
confere('hora de funcionamento', r2(ex.horaFuncionamento), 99.78)
confere('rateada', r2(ex.rateada), 57.42)
confere('hora da equipe', r2(ex.horaEquipe), 23.34)
confere('M1 Prolu', r2(ex.metodos.m1.valor), 100.94)
confere('M1 sem FO', r2(ex.metodos.m1.semFO), 80.75)
confere('M3 Começando', r2(ex.metodos.m3.valor), 140.33)
confere('M3 com OF 80%', r2(calcular({ ...dadosExemplo(), of: 80 }).metodos.m3.valor), 175.42)
const centro = (c, nome) => c.metodos.m2.centros.find(x => x.nome === nome)
confere('M2 Arquitetura', r2(centro(ex, 'Arquitetura').valor), 100.72)
confere('M2 Estágio', r2(centro(ex, 'Estágio').valor), 102.41)
const umCentro = calcular({ ...dadosExemplo(), equipe: dadosExemplo().equipe.map(p => ({ ...p, centro_custo: 'Geral' })) })
confere('M2 com um só centro "Geral" = Prolu', r2(centro(umCentro, 'Geral').valor), 100.94)
confere('utilização efetiva', r2(ex.utilizacao * 100), 68)
confere('M3 sem alerta (H ≥ funcionamento)', ex.metodos.m3.alerta, false)
for (const [o, v] of [[100, 80.75], [90, 89.73], [80, 100.94], [70, 115.36], [60, 134.59]]) {
  confere(`simulador ${o}%`, r2(horaNecessaria(ex, o)), v)
}
confere('sem pendências nem avisos', ex.pendencias.length + ex.avisos.length, 0)
// diferença conhecida: a planilha (célula D22) usa a equipe SEM encargos no método antigo
confere('método antigo da planilha (equipe sem encargos)', r2(17960 / 180 + 6250 / 312.8), 119.76)

// ── 2. +1 arquiteto (n = 4 > nref = 3) ──
console.log('— +1 arquiteto —')
const mais = dadosExemplo()
mais.equipe.push(normalizarPessoa(arquiteto('Arquiteto 3')))
const rm = calcular(mais)
confere('Eef', r2(rm.Eef), 19726.67)
confere('H', rm.H, 448.8)
confere('Q', rm.Q, 10300)
confere('Prolu', r2(rm.metodos.m1.valor), 83.63)
confere('Prolu sem FO', r2(rm.metodos.m1.semFO), 66.90)
confere('ajuste da estrutura', r2(rm.ajusteEstrutura), 1766.67)
const semFE = calcular({ ...mais, estrutura: mais.estrutura.map(i => ({ ...i, cresce_com_equipe: false })) })
confere('Prolu com FE = 0', r2(semFE.metodos.m1.valor), 78.71)

// ── 3. −1 estagiário (n = 2): a estrutura não cai ──
console.log('— −1 estagiário —')
const menos = calcular({ ...dadosExemplo(), equipe: dadosExemplo().equipe.slice(0, 2) })
confere('Eef = E', menos.Eef, 17960)
confere('H', menos.H, 272)
confere('Q', menos.Q, 6300)
confere('Prolu', r2(menos.metodos.m1.valor), 111.49)

// ── 4. Dono produz = Sim (dono fora do n: nref = 3 continua valendo) ──
console.log('— dono produz —')
const comDono = normalizarDados({ ...dadosExemplo(), dono_produz: true })
const linhaDono = comDono.equipe.find(p => p.vinculo_pro_labore_id)
confere('linha do dono criada', linhaDono?.nome, 'Dono')
confere('custo do dono vem do pró-labore', linhaDono?.custo_mensal, 6000)
const comDono40h = { ...comDono, equipe: comDono.equipe.map(p => (p.vinculo_pro_labore_id ? { ...p, horas_dia: 4, dias_semana: 5, semanas_mes: 4, pct_produtivo: 50 } : p)) }
const rd = calcular(comDono40h)
confere('E', rd.E, 11960)
confere('H', rd.H, 352.8)
confere('Q', rd.Q, 13300)
confere('n não conta o dono', rd.n, 3)
confere('Prolu', r2(rd.metodos.m1.valor), 89.50)
const deVolta = normalizarDados({ ...comDono40h, dono_produz: false })
confere('voltar para Não remove a linha', deVolta.equipe.some(p => p.vinculo_pro_labore_id), false)
confere('voltar para Não restaura E', calcular(deVolta).E, 17960)
const donoZero = calcular({ ...comDono40h, equipe: comDono40h.equipe.map(p => (p.vinculo_pro_labore_id ? { ...p, horas_dia: 0 } : p)) })
confere('dono com 0 h: aviso', donoZero.avisos.some(a => a.tipo === 'dono'), true)
const doisSocios = normalizarDados({ ...dadosExemplo(), dono_produz: true,
  estrutura: [...dadosExemplo().estrutura, { nome: 'Pró-labore 2', tipo: 'pessoas', valor_mensal: 4000, pro_labore: true }] })
confere('dois pró-labores: "Sócio 1" e "Sócio 2"', doisSocios.equipe.filter(p => p.vinculo_pro_labore_id).map(p => p.nome).join(','), 'Sócio 1,Sócio 2')

// ── 5. Escritório solo ──
console.log('— escritório solo —')
const solo = normalizarDados({
  horas_funcionamento: 180, dono_produz: true,
  estrutura: [{ nome: 'Estrutura', tipo: 'estrutura', valor_mensal: 2000 }, { nome: 'Pró-labore', tipo: 'pessoas', valor_mensal: 6000, pro_labore: true }],
})
const soloCalc = calcular({ ...solo, equipe: solo.equipe.map(p => ({ ...p, horas_dia: 8, dias_semana: 5, semanas_mes: 4, pct_produtivo: 60 })) })
confere('H', soloCalc.H, 96)
confere('Prolu', r2(soloCalc.metodos.m1.valor), 104.17)
confere('Começando', r2(soloCalc.metodos.m3.valor), 44.44)
confere('Começando com alerta (H < funcionamento)', soloCalc.metodos.m3.alerta, true)
const soloSemDono = calcular({ ...solo, dono_produz: false })
confere('solo com dono Não: orienta marcar Sim', soloSemDono.pendencias.some(t => t.includes('dono sozinho')), true)

// ── 6. % produtivo estimado ──
console.log('— % produtivo estimado —')
const est = normalizarPessoa({ funcao: 'arquiteto', horas_dia: 8, dias_semana: 5, pct_modo: 'estimado',
  fora_projeto: { reunioes: 4, administrativo: 3, deslocamento: 2, retrabalho: 1 } })
confere('1 − 10 ÷ 40', pctEstimado(est), 0.75)
confere('horas produtivas com % estimado', calcular({ equipe: [est] }).H, 120)
confere('horas produtivas com % digitado', calcular({ equipe: [{ ...est, pct_modo: 'digitado', pct_produtivo: 60 }] }).H, 96)

// ── 7. Cenário antigo (v1) convertido ──
console.log('— conversão v1 —')
const v1 = normalizarDados({
  horasFuncionamento: 170, donoProduz: false, ocupacaoPct: 100,
  estrutura: [{ id: 'a', nome: 'Aluguel', tipo: 'estrutura', custo: 3000, encargosPct: 0, proLabore: false }],
  equipe: [{ id: 'b', nome: 'Ana', funcao: 'arquiteto', custo: 4000, encargosPct: 20, horasDia: 8, diasSemana: 5, semanasMes: 4, produtivoPct: 80, produtivoModo: 'digitado' }],
})
confere('versão 2', v1.versao, 2)
confere('horas de funcionamento', v1.horas_funcionamento, 170)
confere('valor_mensal', v1.estrutura[0].valor_mensal, 3000)
confere('estrutura cresce com a equipe', v1.estrutura[0].cresce_com_equipe, true)
confere('custo_mensal', v1.equipe[0].custo_mensal, 4000)
confere('pct_produtivo', v1.equipe[0].pct_produtivo, 80)
confere('FO padrão', v1.fo, 80)

// ── 8. Divisão por zero / entradas vazias ──
console.log('— vazios e zeros —')
const vazio = calcular(dadosVazios())
confere('vazio: Prolu null', vazio.metodos.m1.valor, null)
confere('vazio: tem pendências', vazio.pendencias.length > 0, true)
confere('FO = 0: Prolu null', calcular({ ...dadosExemplo(), fo: 0 }).metodos.m1.valor, null)
confere('OF = 0: Começando null', calcular({ ...dadosExemplo(), of: 0 }).metodos.m3.valor, null)
confere('funcionamento = 0: Começando null', calcular({ ...dadosExemplo(), horas_funcionamento: 0 }).metodos.m3.valor, null)
confere('funcionamento = 0: Prolu ainda calcula', r2(calcular({ ...dadosExemplo(), horas_funcionamento: 0 }).metodos.m1.valor), 100.94)
confere('nref = 0: sem divisão por zero', r2(calcular({ ...dadosExemplo(), equipe_referencia: 0 }).Eef), 17960)
confere('simulador com 0%: null', horaNecessaria(ex, 0), null)
const lixo = calcular({ estrutura: 'x', equipe: [{ custo_mensal: 'abc', horas_dia: -3, pct_produtivo: 500 }], horas_funcionamento: 'NaN', fo: 'x' })
confere('entradas inválidas: nenhum NaN/Infinity', /NaN|Infinity/.test(JSON.stringify(lixo)), false)

console.log(`\n${total - falhas}/${total} conferências ok`)
process.exit(falhas ? 1 : 0)
