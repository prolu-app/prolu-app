// Exemplo da tela de Valor-hora (/precificacao/valor-hora): "Com o exemplo da
// planilha Prolu" (dados fictícios, planilha "método 1"). Também é a fixture de
// scripts/verificar-valor-hora.mjs. Os padrões dos campos ficam em valorHora.js.
export const EXEMPLO = {
  versao: 3,
  op: 80,
  custos: [
    { nome: 'Secretária', tipo: 'Pessoas', valor_mensal: 1800, encargos_pct: 20 },
    { nome: 'Analista financeiro', tipo: 'Pessoas', valor_mensal: 3000, encargos_pct: 20 },
    { nome: 'BPO Financeiro', tipo: 'Serviço', valor_mensal: 900, encargos_pct: 0 },
    { nome: 'Luz, água, aluguel, etc.', tipo: 'Estrutura', valor_mensal: 5300, encargos_pct: 0 },
    { nome: 'Pró-labore', tipo: 'Pró-labore / retirada', valor_mensal: 6000, encargos_pct: 0 },
    { nome: 'Arquiteto 1', tipo: 'Pessoas', valor_mensal: 2500, encargos_pct: 20, produz_projeto: true, horas_dia: 8, dias_semana: 5, pct_produtivo: 85, centro_custo: 'Arquitetura' },
    { nome: 'Arquiteto 2', tipo: 'Pessoas', valor_mensal: 2750, encargos_pct: 20, produz_projeto: true, horas_dia: 8, dias_semana: 5, pct_produtivo: 85, centro_custo: 'Arquitetura' },
    { nome: 'Estagiário A', tipo: 'Pessoas', valor_mensal: 1000, encargos_pct: 0, produz_projeto: true, horas_dia: 4, dias_semana: 5, pct_produtivo: 85, centro_custo: 'Estágio' },
  ],
}
