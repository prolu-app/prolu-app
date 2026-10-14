// Fontes da Minha Página v2: 12 curadas, pesos 400 e 700 (DM Serif Display
// só tem 400 — o "negrito" dela usa 400; nunca peso falso, ver
// font-synthesis no PaginaRender.css). Os ids estão espelhados em
// pagina_v2_validar (migration_057).
//
// Self-host: arquivos woff2 (subconjunto latin — cobre os acentos do
// português e o travessão) em public/fonts/ (licenças em
// public/fonts/LICENCAS.txt). Nenhuma chamada a serviço de fontes de
// terceiros: o @font-face é injetado só para as fontes usadas pela página.
// Família com prefixo "PG " para não se misturar com as fontes do app
// (index.html), que têm o mesmo nome e outros pesos.

export const FONTE_PADRAO = 'Montserrat'

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'

export const FONTES_V2 = [
  { id: 'Montserrat', arquivo: 'montserrat', fallback: SANS, pesos: [400, 700] },
  { id: 'Inter', arquivo: 'inter', fallback: SANS, pesos: [400, 700] },
  { id: 'Poppins', arquivo: 'poppins', fallback: SANS, pesos: [400, 700] },
  { id: 'DM Sans', arquivo: 'dm-sans', fallback: SANS, pesos: [400, 700] },
  { id: 'Josefin Sans', arquivo: 'josefin-sans', fallback: SANS, pesos: [400, 700] },
  { id: 'Work Sans', arquivo: 'work-sans', fallback: SANS, pesos: [400, 700] },
  { id: 'Space Grotesk', arquivo: 'space-grotesk', fallback: SANS, pesos: [400, 700] },
  { id: 'Playfair Display', arquivo: 'playfair-display', fallback: SERIF, pesos: [400, 700] },
  { id: 'Cormorant Garamond', arquivo: 'cormorant-garamond', fallback: SERIF, pesos: [400, 700] },
  { id: 'Lora', arquivo: 'lora', fallback: SERIF, pesos: [400, 700] },
  { id: 'DM Serif Display', arquivo: 'dm-serif-display', fallback: SERIF, pesos: [400] },
  { id: 'Oswald', arquivo: 'oswald', fallback: `"Arial Narrow", ${SANS}`, pesos: [400, 700] },
].map(f => ({ ...f, familia: `'PG ${f.id}', ${f.fallback}` }))

export const FONTE_IDS = FONTES_V2.map(f => f.id)
const porId = id => FONTES_V2.find(f => f.id === id) || FONTES_V2[0]

export const familiaV2 = id => porId(id).familia
// peso "forte" disponível de verdade na fonte (700, ou 400 quando não há 700)
export const pesoForte = id => (porId(id).pesos.includes(700) ? 700 : 400)
export const urlDaFonte = (id, peso) => `/fonts/${porId(id).arquivo}-${peso}.woff2`

// Fontes da lista antiga (Minha Página v1 / rascunhos anteriores à 057) que
// saíram da curadoria → a mais próxima da lista nova.
const LEGADAS = { Rubik: 'Work Sans', Lato: 'Inter', Raleway: 'Josefin Sans', 'Libre Baskerville': 'Lora', 'Abhaya Libre': 'Lora' }
export function fonteDaLista(id) {
  if (FONTE_IDS.includes(id)) return id
  return LEGADAS[id] || null
}

// @font-face das fontes pedidas (ids fora da lista são ignorados)
export function cssDasFontes(ids) {
  return [...new Set(ids)].filter(id => FONTE_IDS.includes(id)).flatMap(id => porId(id).pesos.map(peso =>
    `@font-face{font-family:'PG ${id}';font-style:normal;font-weight:${peso};font-display:swap;src:url(${urlDaFonte(id, peso)}) format('woff2')}`,
  )).join('\n')
}

export function carregarFonteV2(id) {
  if (typeof document === 'undefined' || !FONTE_IDS.includes(id)) return
  const elId = `pg-fonte-${porId(id).arquivo}`
  if (document.getElementById(elId)) return
  const style = document.createElement('style')
  style.id = elId
  style.textContent = cssDasFontes([id])
  document.head.appendChild(style)
}
