// Padrões de fundo da Minha Página: SVG gerado na hora, repetido como
// background-image sobre a cor de fundo. A cor e a opacidade chegam já
// validadas (normalizarPagina, utils/paginaConfig.js) — nada do banco entra
// cru no SVG. Cada `fn(cor, opacity)` devolve o valor CSS url("data:…").

const svg = (w, h, corpo) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${corpo}</svg>`)}")`

// grupo preenchido / só contorno, com a opacidade aplicada uma vez
const cheio = (cor, op, formas) => `<g fill="${cor}" opacity="${op}">${formas}</g>`
const traco = (cor, op, formas, largura = 1) =>
  `<g fill="none" stroke="${cor}" stroke-width="${largura}" opacity="${op}">${formas}</g>`

// hexágono de ponta para cima, lado 12: largura √3·12, duas fileiras por bloco
const HEX_L = 20.785
const HEX_H = 36

const LISTA = [
  // ── Pontos ──
  { id: 'pontilhado-fino', label: 'Pontilhado Fino', categoria: 'Pontos',
    fn: (c, o) => svg(16, 16, cheio(c, o, '<circle cx="8" cy="8" r="1"/>')) },
  { id: 'pontilhado-medio', label: 'Pontilhado Médio', categoria: 'Pontos',
    fn: (c, o) => svg(20, 20, cheio(c, o, '<circle cx="10" cy="10" r="2"/>')) },
  { id: 'confete', label: 'Confete', categoria: 'Pontos',
    fn: (c, o) => svg(24, 24, cheio(c, o, '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>')) },

  // ── Linhas ──
  { id: 'linhas-horizontais', label: 'Linhas Horizontais', categoria: 'Linhas',
    fn: (c, o) => svg(1, 8, cheio(c, o, '<rect width="1" height="0.6"/>')) },
  { id: 'linhas-verticais', label: 'Linhas Verticais', categoria: 'Linhas',
    fn: (c, o) => svg(8, 1, cheio(c, o, '<rect width="0.6" height="1"/>')) },
  { id: 'diagonal-suave', label: 'Diagonal Suave', categoria: 'Linhas',
    // cantos repetidos para a linha emendar entre um bloco e o outro
    fn: (c, o) => svg(16, 16, traco(c, o, '<path d="M0 16L16 0M-4 4L4 -4M12 20L20 12"/>', 0.8)) },
  { id: 'diagonal-dupla', label: 'Diagonal Dupla', categoria: 'Linhas',
    fn: (c, o) => svg(16, 16, traco(c, o, '<path d="M0 16L16 0M-4 4L4 -4M12 20L20 12M0 0L16 16M-4 12L4 20M12 -4L20 4"/>', 0.8)) },

  // ── Geométrico ──
  { id: 'grade', label: 'Grade', categoria: 'Geométrico',
    // traço de 1px na borda: metade fica no bloco → linha de 0,5px
    fn: (c, o) => svg(20, 20, traco(c, o, '<path d="M20 0H0V20"/>')) },
  { id: 'grade-larga', label: 'Grade Larga', categoria: 'Geométrico',
    fn: (c, o) => svg(40, 40, traco(c, o, '<path d="M40 0H0V40"/>')) },
  { id: 'xadrez', label: 'Xadrez', categoria: 'Geométrico',
    fn: (c, o) => svg(16, 16, cheio(c, o, '<rect width="8" height="8"/><rect x="8" y="8" width="8" height="8"/>')) },
  { id: 'tijolo', label: 'Tijolo', categoria: 'Geométrico',
    fn: (c, o) => svg(40, 20, traco(c, o, '<path d="M0 0.5H40M0 10.5H40M0.5 0.5V10.5M20.5 10.5V20"/>')) },
  { id: 'hexagono', label: 'Hexágono', categoria: 'Geométrico',
    fn: (c, o) => svg(HEX_L, HEX_H, traco(c, o,
      `<path d="M${HEX_L / 2} 0L${HEX_L} 6V18L${HEX_L / 2} 24L0 18V6ZM${HEX_L / 2} 24V${HEX_H}"/>`)) },

  // ── Orgânico ──
  { id: 'onda', label: 'Onda', categoria: 'Orgânico',
    fn: (c, o) => svg(40, 20, traco(c, o, '<path d="M0 10Q10 0 20 10T40 10"/>')) },
  { id: 'escama', label: 'Escama', categoria: 'Orgânico',
    fn: (c, o) => svg(20, 20, traco(c, o, '<path d="M0 20A10 10 0 0 1 20 20M-10 10A10 10 0 0 1 10 10M10 10A10 10 0 0 1 30 10"/>')) },
  { id: 'topografia', label: 'Topografia', categoria: 'Orgânico',
    fn: (c, o) => svg(80, 80, traco(c, o,
      '<ellipse cx="40" cy="40" rx="30" ry="18"/><ellipse cx="43" cy="38" rx="19" ry="11"/><ellipse cx="46" cy="36" rx="8" ry="4.5"/>')) },
  { id: 'arco', label: 'Arco', categoria: 'Orgânico',
    fn: (c, o) => svg(40, 40, traco(c, o,
      '<path d="M0 40A20 20 0 0 1 40 40M7 40A13 13 0 0 1 33 40M14 40A6 6 0 0 1 26 40M0 20A20 20 0 0 1 40 20" />')) },
  { id: 'petala', label: 'Pétala', categoria: 'Orgânico',
    fn: (c, o) => {
      const petala = '<path d="M20 20C15 14 15 6 20 3C25 6 25 14 20 20Z"/>'
      return svg(40, 40, cheio(c, o, [0, 90, 180, 270].map(g => `<g transform="rotate(${g} 20 20)">${petala}</g>`).join('')))
    } },
]

export const PATTERNS = Object.fromEntries(LISTA.map(p => [p.id, p]))
export const CATEGORIAS_PATTERN = ['Pontos', 'Linhas', 'Geométrico', 'Orgânico']
export const patternsDaCategoria = categoria => LISTA.filter(p => p.categoria === categoria)
