// Fontes da Minha Página v2: 12 curadas, pesos 400 e 700 (DM Serif Display
// só tem 400 — o "negrito" dela usa 400; nunca peso falso, ver
// font-synthesis no PaginaRender.css). Só as fontes usadas na página são
// carregadas. Os ids estão espelhados em pagina_v2_validar (migration_057).
// Carregamento: Google Fonts (o mesmo mecanismo de hoje) — self-host em proposta.

export const FONTE_PADRAO = 'Montserrat'

export const FONTES_V2 = [
  { id: 'Montserrat', familia: "'Montserrat', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'Inter', familia: "'Inter', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'Poppins', familia: "'Poppins', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'DM Sans', familia: "'DM Sans', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'Josefin Sans', familia: "'Josefin Sans', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'Work Sans', familia: "'Work Sans', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'Space Grotesk', familia: "'Space Grotesk', system-ui, sans-serif", pesos: [400, 700] },
  { id: 'Playfair Display', familia: "'Playfair Display', Georgia, serif", pesos: [400, 700] },
  { id: 'Cormorant Garamond', familia: "'Cormorant Garamond', Georgia, serif", pesos: [400, 700] },
  { id: 'Lora', familia: "'Lora', Georgia, serif", pesos: [400, 700] },
  { id: 'DM Serif Display', familia: "'DM Serif Display', Georgia, serif", pesos: [400] },
  { id: 'Oswald', familia: "'Oswald', 'Arial Narrow', sans-serif-condensed, sans-serif", pesos: [400, 700] },
]

export const FONTE_IDS = FONTES_V2.map(f => f.id)
const porId = id => FONTES_V2.find(f => f.id === id) || FONTES_V2[0]

export const familiaV2 = id => porId(id).familia
// peso "forte" disponível de verdade na fonte (700, ou 400 quando não há 700)
export const pesoForte = id => (porId(id).pesos.includes(700) ? 700 : 400)

export function carregarFonteV2(id) {
  if (typeof document === 'undefined' || !FONTE_IDS.includes(id)) return
  const elId = `pg-fonte-${id.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(elId)) return
  const link = document.createElement('link')
  link.id = elId
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(id).replace(/%20/g, '+')}:wght@${porId(id).pesos.join(';')}&display=swap`
  document.head.appendChild(link)
}
