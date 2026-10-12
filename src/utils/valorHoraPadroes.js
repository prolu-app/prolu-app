// Valores iniciais da tela de Valor-hora (/precificacao/valor-hora).
// ÚNICO lugar com números "de partida": tudo aqui é sugestão editável na tela.

// Tipos de custo da estrutura: encargos % iniciais e se o custo cresce com a
// equipe (fator FE do Método Prolu). Pró-labore: sempre 0% e não cresce.
export const TIPOS_CUSTO = [
  { value: 'pessoas', label: 'Pessoas', encargosPct: 20, cresce: false },
  { value: 'servico', label: 'Serviço', encargosPct: 0, cresce: false },
  { value: 'estrutura', label: 'Estrutura', encargosPct: 0, cresce: true },
]

// Funções da equipe produtiva. 'dono' só existe nas linhas criadas por
// "O dono produz? Sim" (vinculadas ao pró-labore da estrutura).
// VALORES INICIAIS A CALIBRAR POR ANDRÉ (provisórios): pctProdutivo
export const FUNCOES = [
  { value: 'arquiteto', label: 'Arquiteto', pctProdutivo: 75, encargosPct: 20 },
  { value: 'estagiario', label: 'Estagiário', pctProdutivo: 70, encargosPct: 0 },
  { value: 'outro', label: 'Outros', pctProdutivo: 75, encargosPct: 20 },
]
export const FUNCAO_DONO = { value: 'dono', label: 'Dono/sócio', pctProdutivo: 50, encargosPct: 0 }

// Linha do dono: poucas horas produtivas por padrão (ele não produz o tempo todo)
export const DONO_HORAS_DIA_PADRAO = 4

// Categorias de horas fora de projeto (por semana) do painel "Estimar % produtivo"
export const CATEGORIAS_FORA = [
  { key: 'reunioes', label: 'Reuniões internas' },
  { key: 'comercial', label: 'Comercial/atendimento' },
  { key: 'administrativo', label: 'Administrativo' },
  { key: 'deslocamento', label: 'Deslocamento' },
  { key: 'capacitacao', label: 'Capacitação' },
  { key: 'retrabalho', label: 'Retrabalho/imprevistos' },
]

// Como as horas fora de projeto sugeridas se dividem entre as categorias, por
// função (pesos; somam 1). As horas em si saem do pctProdutivo da função.
// VALORES INICIAIS A CALIBRAR POR ANDRÉ.
export const DISTRIBUICAO_FORA = {
  dono: { reunioes: 0.2, comercial: 0.35, administrativo: 0.25, deslocamento: 0.1, capacitacao: 0.05, retrabalho: 0.05 },
  arquiteto: { reunioes: 0.25, comercial: 0.05, administrativo: 0.2, deslocamento: 0.2, capacitacao: 0.1, retrabalho: 0.2 },
  estagiario: { reunioes: 0.15, comercial: 0, administrativo: 0.3, deslocamento: 0.15, capacitacao: 0.2, retrabalho: 0.2 },
  outro: { reunioes: 0.2, comercial: 0.1, administrativo: 0.3, deslocamento: 0.15, capacitacao: 0.1, retrabalho: 0.15 },
}

// Padrões gerais do cenário
export const HORAS_FUNCIONAMENTO_PADRAO = 180
export const SEMANAS_MES_PADRAO = 4
export const HORAS_DIA_PADRAO = 8
export const DIAS_SEMANA_PADRAO = 5
export const CENTRO_PADRAO = 'Geral'
export const FO_PADRAO = 80   // ocupação produtiva (%)
export const OF_PADRAO = 100  // ocupação do funcionamento (%)

// "Com o exemplo da planilha Prolu": dados fictícios (planilha "método 1").
// Também é a fixture de scripts/verificar-valor-hora.mjs.
export const EXEMPLO = {
  versao: 2,
  horas_funcionamento: 180,
  estrutura: [
    { nome: 'Secretária', tipo: 'pessoas', valor_mensal: 1800, encargos_pct: 20, pro_labore: false, cresce_com_equipe: false },
    { nome: 'Analista financeiro', tipo: 'pessoas', valor_mensal: 3000, encargos_pct: 20, pro_labore: false, cresce_com_equipe: false },
    { nome: 'BPO Financeiro', tipo: 'servico', valor_mensal: 900, encargos_pct: 0, pro_labore: false, cresce_com_equipe: false },
    { nome: 'Luz, água, aluguel, etc.', tipo: 'estrutura', valor_mensal: 5300, encargos_pct: 0, pro_labore: false, cresce_com_equipe: true },
    { nome: 'Pró-labore', tipo: 'pessoas', valor_mensal: 6000, encargos_pct: 0, pro_labore: true, cresce_com_equipe: false },
  ],
  dono_produz: false,
  equipe: [
    { nome: 'Arquiteto 1', funcao: 'arquiteto', centro_custo: 'Arquitetura', custo_mensal: 2500, encargos_pct: 20, horas_dia: 8, dias_semana: 5, semanas_mes: 4, pct_produtivo: 85 },
    { nome: 'Arquiteto 2', funcao: 'arquiteto', centro_custo: 'Arquitetura', custo_mensal: 2750, encargos_pct: 20, horas_dia: 8, dias_semana: 5, semanas_mes: 4, pct_produtivo: 85 },
    { nome: 'Estagiário A', funcao: 'estagiario', centro_custo: 'Estágio', custo_mensal: 1000, encargos_pct: 0, horas_dia: 4, dias_semana: 3, semanas_mes: 4, pct_produtivo: 85 },
  ],
  equipe_referencia: 3,
  fo: 80,
  of: 100,
}

// Custos que costumam ser esquecidos (lembrete na aba Estrutura)
export const LEMBRETE_CUSTOS = ['Marketing', 'Contabilidade', 'Softwares e assinaturas', 'Depreciação de equipamentos', 'Reserva para imprevistos']

// Referências de utilização efetiva (indicativas)
export const NOTA_UTILIZACAO = 'Referências do mercado dos EUA: 75–85% para profissionais técnicos; 60–65% para a equipe toda. São indicativas.'
