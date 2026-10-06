// Minha Página (empresas.pagina_config, migration_041) — vale para a página
// pública app.prolu.com.br/e/<slug> e para a prévia do editor.
// O JSON vem do banco e é aberto a qualquer visitante: tudo passa por
// normalizarPagina (só valores conhecidos; cores #rrggbb; imagens https;
// padrões/texturas/fontes de listas fechadas) antes de virar CSS ou SVG.

import { PATTERNS } from './pagePatterns.js'

export const PAGINA_PADRAO = {
  publicada: false, // só aparece para visitantes depois de publicar (aba Geral)
  nome_exibicao: '',
  bio: '',
  foto_perfil: null,
  foto_perfil_formato: 'redondo', // quadrado | arredondado | redondo
  banner_url: null,

  botao_estilo: 'solido', // solido | contorno
  botao_cor: '#1a1a1a',
  botao_cor_texto: '#ffffff',
  botao_cor_contorno: '#1a1a1a',
  botao_cor_texto_contorno: '', // contorno: '' = mesma cor do contorno
  botao_espessura_contorno: 2, // contorno: 1 | 2 | 3 px
  botao_arredondamento: 'md', // none | sm | md | lg | full
  botao_sombra: 'none', // none | soft | strong | hard

  fonte: 'Inter',
  cor_texto: '#1a1a1a',
  cor_texto_bio: '#555555',

  fundo_tipo: 'cor', // cor | pattern | textura | sombra
  fundo_cor: '#f8f7f5',
  fundo_pattern: null,
  fundo_pattern_cor: '#000000',
  fundo_pattern_opacity: 0.1,
  fundo_imagem: null, // id de TEXTURAS (textura) ou SOMBRAS (sombra)
  fundo_imagem_opacity: 0.15,

  rodape_prolu: true,
}

export const NOME_MAX = 80
export const BIO_MAX = 300
export const TITULO_LINK_MAX = 100
export const OPACIDADE = [0.05, 0.4] // sliders de padrão/textura/luz

// arquivos em /public/textures/<id>.webp e /public/shadows/<id>.webp (adicionados
// à parte — se faltar, o fundo fica só na cor, sem quebrar nada)
export const TEXTURAS = [
  { id: 'madeira-fina', label: 'Madeira Fina' },
  { id: 'madeira-larga', label: 'Madeira Larga' },
  { id: 'madeira-escura', label: 'Wengê' },
  { id: 'marmore-branco', label: 'Mármore Branco' },
  { id: 'marmore-escuro', label: 'Mármore Negro' },
  { id: 'granito', label: 'Granito' },
  { id: 'travertino', label: 'Travertino' },
  { id: 'concreto-liso', label: 'Concreto Liso' },
  { id: 'concreto-bruto', label: 'Concreto Bruto' },
  { id: 'linho', label: 'Linho' },
  { id: 'canvas', label: 'Canvas' },
]
export const SOMBRAS = [
  { id: 'sombra-monstera', label: 'Monstera' },
  { id: 'sombra-palmeira', label: 'Palmeira' },
  { id: 'sombra-veneziana', label: 'Veneziana' },
  { id: 'sombra-janela', label: 'Janela' },
  { id: 'sombra-bambu', label: 'Bambu' },
  { id: 'sombra-geometrica', label: 'Geométrica' },
  { id: 'sombra-pampas', label: 'Pampas' },
  { id: 'sombra-samambaia', label: 'Samambaia' },
  { id: 'sombra-janela-folha', label: 'Janela + Folha' },
]
export const urlTextura = id => `/textures/${id}.webp`
export const urlSombra = id => `/shadows/${id}.webp`

// Google Fonts carregadas sob demanda (só a escolhida). `familia` = valor do CSS.
export const FONTES = [
  { id: 'Inter', familia: "'Inter', sans-serif" },
  { id: 'Rubik', familia: "'Rubik', sans-serif" },
  { id: 'Montserrat', familia: "'Montserrat', sans-serif" },
  { id: 'Poppins', familia: "'Poppins', sans-serif" },
  { id: 'DM Sans', familia: "'DM Sans', sans-serif" },
  { id: 'Lato', familia: "'Lato', sans-serif" },
  { id: 'Raleway', familia: "'Raleway', sans-serif" },
  { id: 'Josefin Sans', familia: "'Josefin Sans', sans-serif" },
  { id: 'Playfair Display', familia: "'Playfair Display', serif" },
  { id: 'Cormorant Garamond', familia: "'Cormorant Garamond', serif" },
  { id: 'Libre Baskerville', familia: "'Libre Baskerville', serif" },
  { id: 'Abhaya Libre', familia: "'Abhaya Libre', serif" },
]

export function carregarFonte(id) {
  const fonte = FONTES.find(f => f.id === id)
  if (!fonte || typeof document === 'undefined') return
  const elId = `mp-fonte-${id.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(elId)) return
  const link = document.createElement('link')
  link.id = elId
  link.rel = 'stylesheet'
  // Libre Baskerville não tem 600: a API recusa a família inteira se pedir peso que não existe
  const pesos = id === 'Libre Baskerville' ? '400;700' : '400;600;700'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(id).replace(/%20/g, '+')}:wght@${pesos}&display=swap`
  document.head.appendChild(link)
}

const COR_RE = /^#[0-9a-f]{6}$/i
const IMG_RE = /^https:\/\/[^\s"'()\\]+$/i
const OPCOES = {
  foto_perfil_formato: ['quadrado', 'arredondado', 'redondo'],
  botao_estilo: ['solido', 'contorno'],
  botao_espessura_contorno: [1, 2, 3],
  botao_arredondamento: ['none', 'sm', 'md', 'lg', 'full'],
  botao_sombra: ['none', 'soft', 'strong', 'hard'],
  fundo_tipo: ['cor', 'pattern', 'textura', 'sombra'],
  fonte: FONTES.map(f => f.id),
}
const TEXTOS = { nome_exibicao: NOME_MAX, bio: BIO_MAX }
const IMAGENS = ['foto_perfil', 'banner_url']
const OPACIDADES = ['fundo_pattern_opacity', 'fundo_imagem_opacity']

export function normalizarPagina(bruto) {
  const p = { ...PAGINA_PADRAO }
  if (!bruto || typeof bruto !== 'object') return p
  for (const k of Object.keys(PAGINA_PADRAO)) {
    const v = bruto[k]
    if (OPCOES[k]) { if (OPCOES[k].includes(v)) p[k] = v }
    else if (TEXTOS[k]) { if (typeof v === 'string') p[k] = v.slice(0, TEXTOS[k]) }
    else if (IMAGENS.includes(k)) { if (typeof v === 'string' && IMG_RE.test(v)) p[k] = v }
    else if (OPACIDADES.includes(k)) { if (Number.isFinite(v)) p[k] = Math.min(OPACIDADE[1], Math.max(OPACIDADE[0], Math.round(v * 100) / 100)) }
    else if (k === 'fundo_pattern') { if (PATTERNS[v]) p[k] = v }
    else if (k === 'fundo_imagem') { if ([...TEXTURAS, ...SOMBRAS].some(t => t.id === v)) p[k] = v }
    else if (k === 'botao_cor_texto_contorno') { if (v === '' || (typeof v === 'string' && COR_RE.test(v))) p[k] = v.toLowerCase() }
    else if (typeof PAGINA_PADRAO[k] === 'boolean') { if (typeof v === 'boolean') p[k] = v }
    else if (typeof v === 'string' && COR_RE.test(v)) p[k] = v.toLowerCase()
  }
  // tipo de fundo sem o item escolhido → só a cor
  if (p.fundo_tipo === 'pattern' && !p.fundo_pattern) p.fundo_tipo = 'cor'
  if (p.fundo_tipo === 'textura' && !TEXTURAS.some(t => t.id === p.fundo_imagem)) p.fundo_tipo = 'cor'
  if (p.fundo_tipo === 'sombra' && !SOMBRAS.some(t => t.id === p.fundo_imagem)) p.fundo_tipo = 'cor'
  return p
}

const RAIO = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '9999px' }
const SOMBRA = { none: 'none', soft: '0 2px 8px rgba(0,0,0,0.12)', strong: '0 4px 16px rgba(0,0,0,0.25)', hard: '4px 4px 0px rgba(0,0,0,0.8)' }

// override por link (pagina_links.estilo): só as mesmas chaves dos botões
const CHAVES_BOTAO = ['botao_estilo', 'botao_cor', 'botao_cor_texto', 'botao_cor_contorno', 'botao_cor_texto_contorno', 'botao_espessura_contorno', 'botao_arredondamento', 'botao_sombra']
export function estiloDoBotao(p, override) {
  const o = override && typeof override === 'object'
    ? normalizarPagina({ ...p, ...Object.fromEntries(CHAVES_BOTAO.filter(k => k in override).map(k => [k, override[k]])) })
    : p
  const base = { borderRadius: RAIO[o.botao_arredondamento], boxShadow: SOMBRA[o.botao_sombra] }
  return o.botao_estilo === 'contorno'
    ? { ...base, background: 'transparent', border: `${o.botao_espessura_contorno}px solid ${o.botao_cor_contorno}`, color: o.botao_cor_texto_contorno || o.botao_cor_contorno }
    : { ...base, background: o.botao_cor, border: `2px solid ${o.botao_cor}`, color: o.botao_cor_texto }
}

// imagem do link (pagina_links.imagem_url / imagem_modo, migration_042)
// ícone: recorte acompanha o canto do botão (reto = quadrado, pílula = círculo)
const RAIO_ICONE = { none: '0px', sm: '3px', md: '6px', lg: '10px', full: '50%' }
export const raioDoIcone = p => RAIO_ICONE[p.botao_arredondamento]
// card (banner): reto, P, M ou G — pílula vira G (16px), não pílula de verdade
export const raioDoCard = p => (p.botao_arredondamento === 'full' ? RAIO.lg : RAIO[p.botao_arredondamento])
export const MODOS_IMAGEM = ['icone', 'banner']
// imagem só https (mesma regra das fotos); modo ausente com imagem = ícone
export function imagemDoLink(link) {
  const url = typeof link?.imagem_url === 'string' && IMG_RE.test(link.imagem_url) ? link.imagem_url : null
  if (!url) return null
  return { url, modo: MODOS_IMAGEM.includes(link.imagem_modo) ? link.imagem_modo : 'icone' }
}

// fundo: cor + (padrão em background-image) ou (imagem no ::before, com opacidade)
export function estiloDoFundo(p) {
  const s = { backgroundColor: p.fundo_cor }
  if (p.fundo_tipo === 'pattern') s.backgroundImage = PATTERNS[p.fundo_pattern].fn(p.fundo_pattern_cor, p.fundo_pattern_opacity)
  if (p.fundo_tipo === 'textura' || p.fundo_tipo === 'sombra') {
    s['--mp-fundo-img'] = `url("${p.fundo_tipo === 'textura' ? urlTextura(p.fundo_imagem) : urlSombra(p.fundo_imagem)}")`
    s['--mp-fundo-op'] = p.fundo_imagem_opacity
  }
  return s
}

export function familiaDaFonte(id) {
  return (FONTES.find(f => f.id === id) || FONTES[0]).familia
}

// ── links ──
// só http(s), e-mail e telefone (mesma regra da constraint pagina_links_valida)
export const URL_LINK_RE = /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9() -]+)$/i

// "seusite.com.br" → "https://seusite.com.br"; null se não der para usar
export function completarUrlLink(digitada) {
  const v = (digitada || '').trim()
  if (!v) return null
  const url = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  return URL_LINK_RE.test(url) && url.length <= 2000 ? url : null
}

// mesmo prefixo dos formulários: /e/<escritório> (página) e /e/<escritório>/<formulário>
export function urlPaginaPublica(slugEscritorio) {
  return `${window.location.origin}/e/${slugEscritorio}`
}
