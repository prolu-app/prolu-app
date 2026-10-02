// Estilo visual do formulário (formularios.estilo, migration_028) — vale para
// a página pública /f/:slug e para o embed "Com estilo do Prolu" (iframe).
// O embed cru (public/embed.js) não usa: quem estiliza é o CSS do site.
//
// Vira variáveis CSS + classes modificadoras em .prolu-pagina
// (FormularioPublico.css). Chaves ausentes caem no padrão abaixo, que
// reproduz a aparência original — formulários antigos ficam iguais.

export const ESTILO_PADRAO = {
  pagina_fundo: 'transparente', // transparente = fundo do app no link; do site quando incorporado
  pagina_cor: '#f3f2ed',
  card_fundo: 'cor',
  card_cor: '#ffffff',
  borda: false,
  borda_cor: '#d6d6cf',
  input_altura: 'media', // pequena | media | grande
  input_contorno: false,
  input_contorno_cor: '#d6d6cf',
  input_cor: '#f3f2ed',
  botao: 'total', // total | esquerda | direita
}

const COR_RE = /^#[0-9a-f]{6}$/i
const OPCOES = {
  pagina_fundo: ['transparente', 'cor'],
  card_fundo: ['transparente', 'cor'],
  input_altura: ['pequena', 'media', 'grande'],
  botao: ['total', 'esquerda', 'direita'],
}

// Só aceita valores conhecidos (o JSON vem do banco; nada vira CSS cru)
export function normalizarEstilo(bruto) {
  const e = { ...ESTILO_PADRAO }
  if (!bruto || typeof bruto !== 'object') return e
  for (const k of Object.keys(ESTILO_PADRAO)) {
    const v = bruto[k]
    if (OPCOES[k]) { if (OPCOES[k].includes(v)) e[k] = v }
    else if (typeof ESTILO_PADRAO[k] === 'boolean') { if (typeof v === 'boolean') e[k] = v }
    else if (typeof v === 'string' && COR_RE.test(v)) e[k] = v.toLowerCase()
  }
  return e
}

const PADDING_INPUT = { pequena: '8px 12px', media: '12px 14px', grande: '16px 16px' }

export function estiloParaPagina(bruto) {
  const e = normalizarEstilo(bruto)
  const classes = [`prolu-pagina--botao-${e.botao}`]
  if (e.pagina_fundo === 'cor') classes.push('prolu-pagina--fundo-cor')
  if (e.card_fundo === 'transparente') classes.push('prolu-pagina--card-transparente')
  const vars = {
    '--pf-pagina-bg': e.pagina_fundo === 'cor' ? e.pagina_cor : 'transparent',
    '--pf-card-bg': e.card_fundo === 'cor' ? e.card_cor : 'transparent',
    '--pf-card-borda': e.borda ? `1px solid ${e.borda_cor}` : 'none',
    '--pf-input-pad': PADDING_INPUT[e.input_altura],
    '--pf-input-contorno': e.input_contorno ? e.input_contorno_cor : 'transparent',
    '--pf-input-bg': e.input_cor,
  }
  return { classes: classes.join(' '), vars }
}

// ── depois do envio (formularios.pos_envio, migration_028) ──
// Textos padrão da mensagem de sucesso — usados quando o escritório deixa os
// campos vazios. O embed cru (public/embed.js) repete os mesmos textos.
export const SUCESSO_TITULO_PADRAO = 'Recebemos suas informações!'
export function sucessoTextoPadrao(escritorio) {
  return escritorio ? `A equipe do ${escritorio} vai entrar em contato em breve.` : 'Em breve entraremos em contato.'
}

export const URL_REDIRECT_RE = /^https?:\/\/[^\s]+$/i
