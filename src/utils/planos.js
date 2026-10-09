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

// preco: texto exibido na página de planos; null = "Fale com o Comercial"
export const PLANO_INFO = {
  starter: {
    rotulo: 'Starter',
    descricao: 'Para começar a organizar o comercial do escritório.',
    preco: 'Grátis',
  },
  pro: {
    rotulo: 'Pro',
    descricao: 'Para acompanhar resultados e metas com números de verdade.',
    preco: null,
  },
  business: {
    rotulo: 'Business',
    descricao: 'Para escritórios com equipe trabalhando junto no app.',
    preco: null,
  },
  mentoria: {
    rotulo: 'Mentoria',
    descricao: 'O app completo com as ferramentas do método e o acompanhamento da Prolu.',
    preco: null,
    servico: true,
  },
  consultoria: {
    rotulo: 'Consultoria',
    descricao: 'Tudo da Mentoria, com a consultoria da Prolu no seu escritório.',
    preco: null,
    servico: true,
  },
}

// empresas.status_conta (separado do plano) — rótulo e cor do pill
export const STATUS_CONTA = {
  ativa: { rotulo: 'Ativa', pill: 'pill-green' },
  suspensa: { rotulo: 'Suspensa', pill: 'pill-red' },
  encerrando: { rotulo: 'Encerrando', pill: 'pill-orange' },
}

export function rotuloStatusConta(status) {
  return STATUS_CONTA[status]?.rotulo || status || ''
}

// Recurso → plano mínimo. `beneficio` é o texto curto do cartão da vitrine.
// Para limites numéricos (Passo 4), acrescentar aqui um mapa por plano
// (ex.: LIMITES = { starter: { usuarios: 1, pedidos_mes: 5 }, ... }).
export const RECURSOS = {
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
  ferramentas_mentoria: {
    plano: 'mentoria',
    rotulo: 'Ferramentas do método Prolu',
    beneficio: 'Plano Prático, Cliente Ideal e Agente Prolu: as ferramentas do método, com o acompanhamento da Prolu.',
  },
}

// Linhas da tabela comparativa de /planos. `recurso` usa a matriz acima;
// `plano` = disponível a partir desse plano. Nada de recurso ainda não
// construído aqui (Gestão de Projetos, produtividade etc. ficam de fora).
export const COMPARATIVO = [
  { rotulo: 'CRM de orçamentos', plano: 'starter' },
  { rotulo: 'Precificação', plano: 'starter' },
  { rotulo: 'Formulários', plano: 'starter' },
  { rotulo: 'Minha Página', plano: 'starter' },
  { rotulo: 'Contatos', plano: 'starter' },
  { rotulo: 'Base de Conhecimento', plano: 'starter' },
  { rotulo: 'Painel Comercial', recurso: 'painel_comercial' },
  { rotulo: 'Indicadores e metas', recurso: 'indicadores' },
  { rotulo: 'Equipe (convidar pessoas)', recurso: 'equipe_convites' },
  { rotulo: 'Plano Prático', recurso: 'ferramentas_mentoria' },
  { rotulo: 'Cliente Ideal', recurso: 'ferramentas_mentoria' },
  { rotulo: 'Agente Prolu', recurso: 'ferramentas_mentoria' },
  { rotulo: 'Acompanhamento da Prolu', plano: 'mentoria' },
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

export function linkWhatsappComercial({ escritorio, planoAtual, planoDesejado } = {}) {
  const partes = ['Olá! Quero falar sobre o plano do meu escritório no Prolu App.']
  if (escritorio) partes.push(`Escritório: ${escritorio}`)
  if (planoAtual) partes.push(`Plano atual: ${rotuloPlano(planoAtual)}`)
  if (planoDesejado) partes.push(`Plano desejado: ${rotuloPlano(planoDesejado)}`)
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(partes.join('\n'))}`
}
