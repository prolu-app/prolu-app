// Estilo visual do formulário (formularios.estilo, migration_028) — vale para
// a página pública /f/:slug e para o embed "Com estilo do Prolu" (iframe).
// O embed cru (public/embed.js) não usa as cores/medidas — só o texto do
// botão (conteúdo, não estilo): quem estiliza lá é o CSS do site.
//
// Vira variáveis CSS + classes modificadoras em .prolu-pagina
// (FormularioPublico.css). Chaves ausentes caem no padrão abaixo, que
// reproduz a aparência original — formulários antigos ficam iguais.

export const ESTILO_PADRAO = {
  pagina_fundo: 'transparente', // transparente = fundo do app no link; do site quando incorporado
  pagina_cor: '#f3f2ed',
  card_fundo: 'cor',
  card_cor: '#ffffff',
  card_raio: 22,
  borda: false,
  borda_cor: '#d6d6cf',
  borda_largura: 'fina', // fina | media | grossa
  input_altura: 'media', // pequena | media | grande
  input_contorno: false,
  input_contorno_cor: '#d6d6cf',
  input_cor: '#f3f2ed',
  input_texto_cor: '#121210',
  input_raio: 10,
  botao: 'total', // alinhamento: total | esquerda | direita
  botao_cor: '#cbe921',
  botao_peso: 'negrito', // normal | negrito
  botao_raio: 30, // 30 = pílula na altura padrão do botão
  botao_texto: '',
}

// limites dos sliders de cantos arredondados (px)
export const RAIO_MAX = { card_raio: 40, input_raio: 24, botao_raio: 30 }
export const BOTAO_TEXTO_MAX = 40
export const BOTAO_TEXTO_PADRAO = 'Enviar'

const COR_RE = /^#[0-9a-f]{6}$/i
const OPCOES = {
  pagina_fundo: ['transparente', 'cor'],
  card_fundo: ['transparente', 'cor'],
  borda_largura: ['fina', 'media', 'grossa'],
  input_altura: ['pequena', 'media', 'grande'],
  botao: ['total', 'esquerda', 'direita'],
  botao_peso: ['normal', 'negrito'],
}

// Só aceita valores conhecidos (o JSON vem do banco; nada vira CSS cru)
export function normalizarEstilo(bruto) {
  const e = { ...ESTILO_PADRAO }
  if (!bruto || typeof bruto !== 'object') return e
  for (const k of Object.keys(ESTILO_PADRAO)) {
    const v = bruto[k]
    if (OPCOES[k]) { if (OPCOES[k].includes(v)) e[k] = v }
    else if (RAIO_MAX[k] !== undefined) { if (Number.isFinite(v)) e[k] = Math.min(RAIO_MAX[k], Math.max(0, Math.round(v))) }
    else if (k === 'botao_texto') { if (typeof v === 'string') e[k] = v.trim().slice(0, BOTAO_TEXTO_MAX) }
    else if (typeof ESTILO_PADRAO[k] === 'boolean') { if (typeof v === 'boolean') e[k] = v }
    else if (typeof v === 'string' && COR_RE.test(v)) e[k] = v.toLowerCase()
  }
  return e
}

export function textoDoBotao(bruto) {
  return normalizarEstilo(bruto).botao_texto || BOTAO_TEXTO_PADRAO
}

// texto do botão escuro ou claro conforme a cor escolhida (contraste WCAG)
function corDoTextoSobre(hex) {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const n = parseInt(hex.slice(1), 16)
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#121210' : '#ffffff'
}

const PADDING_INPUT = { pequena: '8px 12px', media: '12px 14px', grande: '16px 16px' }
const LARGURA_BORDA = { fina: 1, media: 2, grossa: 4 }

export function estiloParaPagina(bruto) {
  const e = normalizarEstilo(bruto)
  const classes = [`prolu-pagina--botao-${e.botao}`]
  if (e.pagina_fundo === 'cor') classes.push('prolu-pagina--fundo-cor')
  if (e.card_fundo === 'transparente') classes.push('prolu-pagina--card-transparente')
  const vars = {
    '--pf-pagina-bg': e.pagina_fundo === 'cor' ? e.pagina_cor : 'transparent',
    '--pf-card-bg': e.card_fundo === 'cor' ? e.card_cor : 'transparent',
    '--pf-card-borda': e.borda ? `${LARGURA_BORDA[e.borda_largura]}px solid ${e.borda_cor}` : 'none',
    '--pf-card-raio': `${e.card_raio}px`,
    '--pf-input-pad': PADDING_INPUT[e.input_altura],
    '--pf-input-contorno': e.input_contorno ? e.input_contorno_cor : 'transparent',
    '--pf-input-bg': e.input_cor,
    '--pf-input-texto': e.input_texto_cor,
    '--pf-input-raio': `${e.input_raio}px`,
    '--pf-botao-bg': e.botao_cor,
    '--pf-botao-texto': corDoTextoSobre(e.botao_cor),
    '--pf-botao-peso': e.botao_peso === 'negrito' ? 600 : 400,
    '--pf-botao-raio': `${e.botao_raio}px`,
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
