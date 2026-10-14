// Variáveis de design da Minha Página v2: todo o CSS do render
// (components/minhapagina/render) usa só elas. Recebe o documento JÁ
// normalizado (normalizarDoc). Os temas prontos (Fase 2) serão pacotes de
// valores para estas mesmas variáveis.

import { PATTERNS } from '../pagePatterns.js'
import { familiaDaFonte, urlSombra, urlTextura } from '../paginaConfig.js'
import { normalizarBotao } from './modelo.js'

const RAIO = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '9999px' }
// imagem pequena: acompanha o canto (reto = quadrado, pílula = círculo)
const RAIO_ICONE = { none: '0px', sm: '3px', md: '6px', lg: '10px', full: '50%' }
// imagem grande (card): pílula vira G, não pílula de verdade
const RAIO_CARD = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '16px' }
const SOMBRA = { none: 'none', soft: '0 2px 8px rgba(0,0,0,0.12)', strong: '0 4px 16px rgba(0,0,0,0.25)', hard: '4px 4px 0px rgba(0,0,0,0.8)' }

// texto legível sobre uma cor de fundo (#rrggbb): preto ou branco
export function contraste(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#121210' : '#ffffff'
}

function partesDoBotao(b) {
  return b.estilo === 'contorno'
    ? { fundo: 'transparent', texto: b.cor_texto_contorno || b.cor_contorno, borda: `${b.espessura_contorno}px solid ${b.cor_contorno}` }
    : { fundo: b.cor, texto: b.cor_texto, borda: `2px solid ${b.cor}` }
}

export function varsDoBotao(b) {
  const p = partesDoBotao(b)
  return {
    '--pg-botao-fundo': p.fundo,
    '--pg-botao-texto': p.texto,
    '--pg-botao-borda': p.borda,
    '--pg-raio': RAIO[b.cantos],
    '--pg-raio-icone': RAIO_ICONE[b.cantos],
    '--pg-raio-card': RAIO_CARD[b.cantos],
    '--pg-sombra': SOMBRA[b.sombra],
  }
}

// raiz da página: fundo, textos, fontes, botões e o destaque padrão
export function variaveisDeDesign(doc) {
  const a = doc.aparencia
  const f = a.fundo
  const destaque = a.cor_destaque || (a.botao.estilo === 'contorno' ? a.botao.cor_contorno : a.botao.cor)
  const s = {
    backgroundColor: f.cor,
    '--pg-fundo': f.cor,
    '--pg-texto': a.cor_texto,
    '--pg-texto-suave': a.cor_texto_suave,
    '--pg-fonte-titulo': familiaDaFonte(a.fonte_titulo),
    '--pg-fonte-corpo': familiaDaFonte(a.fonte_corpo),
    '--pg-destaque': destaque,
    '--pg-destaque-fundo': destaque,
    '--pg-destaque-texto': contraste(destaque),
    '--pg-destaque-borda': `2px solid ${destaque}`,
    ...varsDoBotao(a.botao),
  }
  if (f.tipo === 'pattern') s.backgroundImage = PATTERNS[f.pattern].fn(f.pattern_cor, f.pattern_opacidade)
  if (f.tipo === 'textura' || f.tipo === 'sombra') {
    s['--pg-fundo-img'] = `url("${f.tipo === 'textura' ? urlTextura(f.imagem) : urlSombra(f.imagem)}")`
    s['--pg-fundo-op'] = f.imagem_opacidade
  }
  return s
}

// estilo próprio de um item: redefine as variáveis só nele (o destaque também
// passa a usar as cores próprias). Sem estilo próprio: nada.
export function varsDoItem(doc, item) {
  if (!item.estilo?.botao) return undefined
  const b = normalizarBotao(item.estilo.botao, doc.aparencia.botao)
  const v = varsDoBotao(b)
  if (!item.estilo.destaque) return v
  return { ...v, '--pg-destaque-fundo': v['--pg-botao-fundo'], '--pg-destaque-texto': v['--pg-botao-texto'], '--pg-destaque-borda': v['--pg-botao-borda'] }
}
