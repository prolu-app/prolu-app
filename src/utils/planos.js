// Planos do Prolu App — ÚNICA fonte, no front, de rótulos, textos, preços e da
// matriz plano × recurso. O banco tem o espelho da matriz em
// empresa_libera() (supabase/migration_045_planos_conta.sql): ao mudar o plano
// mínimo de um recurso aqui, mudar lá também.
//
// Regra central: o PERFIL (role) decide o que aparece no menu; o PLANO nunca
// esconde nada — só decide se o que está visível fica liberado ou vira
// vitrine (components/BloqueioPlano.jsx).

// ids do banco (empresas.plano), do menor para o maior
export const PLANOS = ['starter', 'pro', 'business', 'mentoria', 'consultoria']

// WhatsApp do Comercial (André): upgrade é manual por enquanto
export const WHATSAPP_COMERCIAL = '5543991115017'

// precoMes: valor por mês em reais (número); 0 = Grátis. Formatação em precoPlano().
export const PLANO_INFO = {
  starter: {
    rotulo: 'Starter',
    descricao: 'Organize o comercial do escritório.',
    precoMes: 0,
  },
  pro: {
    rotulo: 'Pro',
    descricao: 'Resultados e metas com números reais.',
    precoMes: 49.9,
  },
  business: {
    rotulo: 'Business',
    descricao: 'Para escritórios com equipe.',
    precoMes: 119.9,
  },
  mentoria: {
    rotulo: 'Mentoria',
    descricao: 'Método completo e acompanhamento em grupo da Prolu.',
    precoMes: 500,
    servico: true,
  },
  consultoria: {
    rotulo: 'Consultoria',
    descricao: 'Tudo da Mentoria, com acompanhamento individual da Prolu.',
    precoMes: 2300,
    servico: true,
  },
}

// empresas.status_conta (separado do plano)
export const STATUS_CONTA = {
  ativa: { rotulo: 'Ativa' },
  suspensa: { rotulo: 'Suspensa' },
  encerrando: { rotulo: 'Encerrando' },
}

// Cores das tags de plano e status (components/PlanoTag.jsx) — ÚNICO lugar.
// Fundo suave + texto/borda escuros: todo texto passa de 4,5:1 (WCAG AA).
export const CORES_TAG = {
  plano: {
    starter: { fundo: '#ececea', texto: '#46463f', borda: '#d4d4cc' },
    pro: { fundo: '#e7eff8', texto: '#29558a', borda: '#c4d7ee' },
    business: { fundo: '#f2e9f8', texto: '#673b88', borda: '#dcc6ec' },
    mentoria: { fundo: '#fbf0d6', texto: '#734e00', borda: '#ebd192' },
    consultoria: { fundo: '#121210', texto: '#cbe921', borda: '#121210' },
  },
  status: {
    ativa: { fundo: '#eef6d2', texto: '#46560a', borda: '#d3e68a' },
    suspensa: { fundo: '#ffede3', texto: '#9e420b', borda: '#f9c9aa' },
    encerrando: { fundo: '#fde8e8', texto: '#ad2222', borda: '#f3bdbd' },
  },
}

export function rotuloStatusConta(status) {
  return STATUS_CONTA[status]?.rotulo || status || ''
}

// Recurso → plano mínimo. `beneficio` é o texto curto do cartão da vitrine.
// Para limites numéricos (Passo 4), acrescentar aqui um mapa por plano
// (ex.: LIMITES = { starter: { usuarios: 1, pedidos_mes: 5 }, ... }).
export const RECURSOS = {
  // Recursos do plano grátis, listados para o comparativo de /planos ler tudo
  // desta matriz. Não precisam de bloqueio (ficam fora de empresa_libera()).
  crm_precificacao: { plano: 'starter', rotulo: 'CRM e Precificação' },
  minha_pagina: { plano: 'starter', rotulo: 'Minha Página' },
  // formulários + notificações por WhatsApp (migration_038): já existem e hoje
  // não dependem de plano
  formularios_whatsapp: { plano: 'starter', rotulo: 'Formulários + Notificações WhatsApp' },
  base_conhecimento: { plano: 'starter', rotulo: 'Base de Conhecimento' },
  painel_comercial: {
    plano: 'pro',
    rotulo: 'Painel Comercial',
    beneficio: 'Veja em um só lugar o funil, o faturamento e a conversão do seu escritório.',
  },
  indicadores: {
    plano: 'pro',
    rotulo: 'Indicadores',
    beneficio: 'Defina metas e acompanhe, trimestre a trimestre, os números que importam.',
  },
  equipe_convites: {
    plano: 'business',
    rotulo: 'Equipe',
    beneficio: 'Convide sua equipe para trabalhar junto no Prolu App.',
  },
  // Projetos: ainda sem funcionalidade (menu desativado, "em breve" em /planos).
  // Fora de empresa_libera() no banco de propósito: não há dado nem escrita
  // para bloquear no servidor até a área existir.
  projetos_visao_geral: {
    plano: 'business',
    rotulo: 'Visão Geral',
    beneficio: 'Números e andamento de todos os projetos do escritório em um só lugar.',
  },
  projetos_etapas_tarefas: {
    plano: 'business',
    rotulo: 'Etapas e Tarefas',
    beneficio: 'Projetos com etapas, tarefas e responsáveis para a equipe toda.',
  },
  projetos_cronograma: {
    plano: 'business',
    rotulo: 'Cronograma',
    beneficio: 'Prazos e entregas dos projetos ao longo do tempo.',
  },
  ferramentas_mentoria: {
    plano: 'mentoria',
    rotulo: 'Ferramentas do método Prolu',
    beneficio: 'Plano Prático, Cliente Ideal e Agente Prolu: as ferramentas do método, com o acompanhamento da Prolu.',
  },
}

// Comparativo de /planos, agrupado por tema. Toda regra de plano vem de
// RECURSOS (planoMinimo); a tela não repete a matriz. `emBreve` = recurso
// futuro: linha esmaecida e chip "em breve" só nas colunas que o terão.
export const COMPARATIVO = [
  {
    grupo: 'Comercial',
    itens: [
      { rotulo: 'CRM e Precificação', recurso: 'crm_precificacao' },
      { rotulo: 'Minha Página', recurso: 'minha_pagina' },
      { rotulo: 'Formulários + Notificações WhatsApp', recurso: 'formularios_whatsapp' },
      { rotulo: 'Painel Comercial', recurso: 'painel_comercial' },
      { rotulo: 'Indicadores e Metas', recurso: 'indicadores' },
    ],
  },
  {
    grupo: 'Projetos',
    emBreve: true,
    itens: [
      { rotulo: 'Visão Geral', recurso: 'projetos_visao_geral', emBreve: true },
      { rotulo: 'Etapas e Tarefas', recurso: 'projetos_etapas_tarefas', emBreve: true },
      { rotulo: 'Cronograma', recurso: 'projetos_cronograma', emBreve: true },
    ],
  },
  {
    grupo: 'Método Prolu',
    itens: [
      { rotulo: 'Base de Conhecimento', recurso: 'base_conhecimento' },
      { rotulo: 'Plano Prático', recurso: 'ferramentas_mentoria' },
      { rotulo: 'Cliente Ideal', recurso: 'ferramentas_mentoria' },
      { rotulo: 'Agente Prolu', recurso: 'ferramentas_mentoria' },
    ],
  },
  {
    grupo: 'Escritório',
    itens: [
      { rotulo: 'Equipes (convidar usuários)', recurso: 'equipe_convites' },
    ],
  },
]

export function nivelPlano(plano) {
  return PLANOS.indexOf(plano)
}

export function planoValido(plano) {
  return PLANOS.includes(plano)
}

export function rotuloPlano(plano) {
  return PLANO_INFO[plano]?.rotulo || ''
}

// Plano mínimo de um recurso; recurso desconhecido = null
export function planoMinimo(recurso) {
  return RECURSOS[recurso]?.plano || null
}

// Recurso desconhecido nunca libera (fecha por padrão, igual ao banco)
export function planoLibera(plano, recurso) {
  const minimo = planoMinimo(recurso)
  if (!minimo || !planoValido(plano)) return false
  return nivelPlano(plano) >= nivelPlano(minimo)
}

// Plano a partir do qual uma linha do comparativo está disponível
export function planoDaLinha(linha) {
  return linha.recurso ? planoMinimo(linha.recurso) : linha.plano
}

// "Grátis", "R$ 49,90", "R$ 2.300" (sem centavos quando redondo)
export function precoPlano(plano) {
  const v = PLANO_INFO[plano]?.precoMes
  if (v == null) return ''
  if (v === 0) return 'Grátis'
  return v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
  })
}

// preço com "/mês" (Grátis fica sem sufixo)
export function precoPlanoMes(plano) {
  const p = precoPlano(plano)
  return p && PLANO_INFO[plano]?.precoMes ? `${p}/mês` : p
}

export function linkWhatsappComercial({ escritorio, planoAtual, planoDesejado } = {}) {
  const partes = ['Olá! Quero falar sobre o plano do meu escritório no Prolu App.']
  if (escritorio) partes.push(`Escritório: ${escritorio}`)
  if (planoAtual) partes.push(`Plano atual: ${rotuloPlano(planoAtual)}`)
  if (planoDesejado) partes.push(`Plano desejado: ${rotuloPlano(planoDesejado)}`)
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(partes.join('\n'))}`
}

// WhatsApp do Comercial para comprar um curso avulso (sem link de checkout)
export function linkWhatsappCurso({ escritorio, curso } = {}) {
  const partes = ['Olá! Quero comprar um curso no Prolu App.']
  if (curso) partes.push(`Curso: ${curso}`)
  if (escritorio) partes.push(`Escritório: ${escritorio}`)
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(partes.join('\n'))}`
}
