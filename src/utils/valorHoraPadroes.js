// Valores iniciais da tela de Valor-hora (/precificacao/valor-hora).
// ÚNICO lugar com números "de partida": tudo aqui é sugestão editável na tela.

// Tipos de custo da estrutura e o acréscimo/encargos % inicial de cada um.
export const TIPOS_CUSTO = [
  { value: 'pessoas', label: 'Pessoas', encargosPct: 20 },
  { value: 'servico', label: 'Serviço', encargosPct: 0 },
  { value: 'estrutura', label: 'Estrutura', encargosPct: 0 },
]

// Funções da equipe produtiva.
// VALORES INICIAIS A CALIBRAR POR ANDRÉ (sugestão provisória):
//   produtivoPct — % do tempo que vira hora de projeto
//   encargosPct  — encargos sobre o custo mensal (dono: pró-labore, sem encargos)
export const FUNCOES = [
  { value: 'dono', label: 'Dono/sócio', produtivoPct: 50, encargosPct: 0 },
  { value: 'arquiteto', label: 'Arquiteto', produtivoPct: 75, encargosPct: 20 },
  { value: 'estagiario', label: 'Estagiário', produtivoPct: 70, encargosPct: 0 },
  { value: 'outro', label: 'Outros', produtivoPct: 75, encargosPct: 20 },
]

// Categorias de horas fora de projeto (por semana) do painel "Estimar".
export const CATEGORIAS_FORA = [
  { key: 'reunioes', label: 'Reuniões com clientes' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'deslocamento', label: 'Deslocamento' },
  { key: 'retrabalho', label: 'Retrabalho/revisões não cobradas' },
  { key: 'outros', label: 'Outros' },
]

// Como as horas fora de projeto sugeridas se dividem entre as categorias, por
// função (pesos; somam 1). As horas em si saem do produtivoPct da função.
// VALORES INICIAIS A CALIBRAR POR ANDRÉ.
export const DISTRIBUICAO_FORA = {
  dono: { reunioes: 0.25, comercial: 0.3, administrativo: 0.25, deslocamento: 0.1, retrabalho: 0.05, outros: 0.05 },
  arquiteto: { reunioes: 0.3, comercial: 0, administrativo: 0.2, deslocamento: 0.2, retrabalho: 0.2, outros: 0.1 },
  estagiario: { reunioes: 0.15, comercial: 0, administrativo: 0.35, deslocamento: 0.15, retrabalho: 0.25, outros: 0.1 },
  outro: { reunioes: 0.2, comercial: 0.1, administrativo: 0.3, deslocamento: 0.15, retrabalho: 0.15, outros: 0.1 },
}

// Padrões gerais do cenário
export const HORAS_FUNCIONAMENTO_PADRAO = 180
export const SEMANAS_MES_PADRAO = 4
export const OCUPACAO_PADRAO = 100
export const HORAS_DIA_PADRAO = 8
export const DIAS_SEMANA_PADRAO = 5

// Linhas fixas do simulador de ocupação (%)
export const OCUPACOES_SIMULADOR = [100, 90, 80, 70, 60]

// "Começar com exemplo": dados fictícios (exemplo da planilha Prolu).
// Também é a fixture de scripts/verificar-valor-hora.mjs.
export const EXEMPLO = {
  estrutura: [
    { nome: 'Secretária', tipo: 'pessoas', custo: 1800, encargosPct: 20, proLabore: false },
    { nome: 'Analista', tipo: 'pessoas', custo: 3000, encargosPct: 20, proLabore: false },
    { nome: 'BPO financeiro', tipo: 'servico', custo: 900, encargosPct: 0, proLabore: false },
    { nome: 'Estrutura (aluguel, contas, softwares)', tipo: 'estrutura', custo: 5300, encargosPct: 0, proLabore: false },
    { nome: 'Pró-labore do dono', tipo: 'pessoas', custo: 6000, encargosPct: 0, proLabore: true },
  ],
  horasFuncionamento: 180,
  ocupacaoPct: 100,
  donoProduz: false,
  equipe: [
    { nome: 'Arquiteto 1', funcao: 'arquiteto', custo: 2500, encargosPct: 20, horasDia: 8, diasSemana: 5, semanasMes: 4, produtivoPct: 85 },
    { nome: 'Arquiteto 2', funcao: 'arquiteto', custo: 2750, encargosPct: 20, horasDia: 8, diasSemana: 5, semanasMes: 4, produtivoPct: 85 },
    { nome: 'Estagiário', funcao: 'estagiario', custo: 1000, encargosPct: 0, horasDia: 4, diasSemana: 3, semanasMes: 4, produtivoPct: 85 },
  ],
}
