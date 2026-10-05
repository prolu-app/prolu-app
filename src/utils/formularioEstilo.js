// Estilo visual do formulário (formularios.estilo, migration_028) — vale para
// a página pública /e/:escritorio/:formulario e para o embed "Com estilo do Prolu" (iframe).
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
  input_contorno_largura: 1.5, // px (1 a 4)
  input_cor: '#f3f2ed',
  input_texto_cor: '#121210',
  input_raio: 10,
  botao: 'total', // alinhamento: total | esquerda | direita
  botao_cor: '#cbe921',
  botao_peso: 'negrito', // normal | negrito
  botao_raio: 30, // 30 = pílula na altura padrão do botão
  botao_texto: '',
  botao_texto_cor: '', // '' = automático (claro/escuro pelo contraste com a cor do botão)
  botao_borda_largura: 0, // px (0 = sem borda)
  botao_borda_cor: '#121210',
  label_cor: '#121210',
  label_tamanho: 'normal', // pequeno 12px | normal 14px | grande 16px
  label_peso: 'normal', // normal | negrito
  cor_destaque: '#cbe921', // contorno do campo em foco (era o verde Prolu fixo)
  cor_selecao: '#000000', // bolinha/caixa marcada de Múltipla escolha e Caixa de seleção (accent-color)
}

// limites dos sliders numéricos (px): [mín, máx, passo]
export const LIMITES = {
  card_raio: [0, 40, 1], input_raio: [0, 24, 1], botao_raio: [0, 30, 1],
  input_contorno_largura: [1, 4, 0.5], botao_borda_largura: [0, 4, 1],
}
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
  label_tamanho: ['pequeno', 'normal', 'grande'],
  label_peso: ['normal', 'negrito'],
}

// Só aceita valores conhecidos (o JSON vem do banco; nada vira CSS cru)
export function normalizarEstilo(bruto) {
  const e = { ...ESTILO_PADRAO }
  if (!bruto || typeof bruto !== 'object') return e
  for (const k of Object.keys(ESTILO_PADRAO)) {
    const v = bruto[k]
    if (OPCOES[k]) { if (OPCOES[k].includes(v)) e[k] = v }
    else if (LIMITES[k]) {
      const [min, max, passo] = LIMITES[k]
      if (Number.isFinite(v)) e[k] = Math.min(max, Math.max(min, Math.round(v / passo) * passo))
    }
    else if (k === 'botao_texto_cor') { if (v === '' || (typeof v === 'string' && COR_RE.test(v))) e[k] = v.toLowerCase() }
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
const LABEL_TAMANHO = { pequeno: '12px', normal: '14px', grande: '16px' }

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
    '--pf-input-contorno-largura': `${e.input_contorno_largura}px`,
    '--pf-input-bg': e.input_cor,
    '--pf-input-texto': e.input_texto_cor,
    '--pf-input-raio': `${e.input_raio}px`,
    '--pf-botao-bg': e.botao_cor,
    '--pf-botao-texto': e.botao_texto_cor || corDoTextoSobre(e.botao_cor),
    '--pf-botao-borda': e.botao_borda_largura ? `${e.botao_borda_largura}px solid ${e.botao_borda_cor}` : 'none',
    '--pf-label-cor': e.label_cor,
    '--pf-label-tamanho': LABEL_TAMANHO[e.label_tamanho],
    '--pf-label-peso': e.label_peso === 'negrito' ? 700 : 500,
    '--pf-destaque': e.cor_destaque,
    '--pf-selecao': e.cor_selecao,
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

// ── apresentação (migration_029) ──
// ID de 11 caracteres de um link do YouTube (watch, youtu.be, embed, shorts,
// live). Mesma regra na Edge Function e no public/embed.js.
export function idDoYoutube(url) {
  const m = (url || '').trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i)
  return m ? m[1] : null
}
export const embedDoYoutube = id => `https://www.youtube.com/embed/${id}`
