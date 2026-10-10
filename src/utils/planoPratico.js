// Plano Prático: valores compartilhados entre a tela do escritório
// (PlanoPratico.jsx) e o modelo do prolu_admin (admin/AdminPlanoPraticoPadrao.jsx).
// O CONTEÚDO padrão (tags e ações) não fica aqui: vive no banco
// (plano_modelo_tags / plano_modelo_acoes, migration_049).

export const TAG_COLORS = ['#CBE921', '#FF6B2B', '#3a6ea5', '#8050a0', '#e05454', '#4CAF82', '#e5a020', '#5f5f58']

export const STATUS_ACAO = {
  pend: { label: 'Pendente', cls: 'pill-gray' },
  prog: { label: 'Em andamento', cls: 'pill-blue' },
  done: { label: 'Concluído', cls: 'pill-green' },
}
