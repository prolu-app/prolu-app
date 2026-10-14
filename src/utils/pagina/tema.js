// Variáveis de design da Minha Página v2: todo o CSS do render
// (components/minhapagina/render) usa só elas — qualquer layout respeita
// fontes, tamanhos e botões por aqui. Recebe o documento JÁ normalizado
// (normalizarDoc). Os temas prontos (Fase 2) serão pacotes de valores para
// estas mesmas variáveis.

import { PATTERNS } from '../pagePatterns.js'
import { urlSombra, urlTextura } from '../paginaConfig.js'
import { familiaV2, pesoForte } from './fontes.js'
import { botaoDoItem } from './modelo.js'

const RAIO = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '9999px' }
// imagem pequena: acompanha o canto (reto = quadrado, pílula = círculo)
const RAIO_ICONE = { none: '0px', sm: '3px', md: '6px', lg: '10px', full: '50%' }
// imagem grande (card): pílula vira G, não pílula de verdade
const RAIO_CARD = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '16px' }
const SOMBRA = { none: 'none', soft: '0 2px 8px rgba(0,0,0,0.12)', strong: '0 4px 16px rgba(0,0,0,0.25)', hard: '4px 4px 0px rgba(0,0,0,0.8)' }

// Escala de tamanhos (px). M = o tamanho de antes; P/G/GG proporcionais, com
// teto que cabe em 360px de largura (inclusive no Hero, texto sobre a imagem).
// Botões: o tamanho ajusta também altura mínima e padding (P mantém 44px de toque).
export const ESCALA = {
  titulo: { p: 17, m: 20, g: 24, gg: 28 },
  subtitulo: { p: 13, m: 14, g: 16, gg: 18 },
  descricao: { p: 13, m: 14, g: 15, gg: 17 },
  botoes: {
    p: { fonte: 14, py: 10, px: 16, altura: 44 },
    m: { fonte: 15, py: 12, px: 20, altura: 48 },
    g: { fonte: 17, py: 14, px: 22, altura: 54 },
    gg: { fonte: 19, py: 16, px: 24, altura: 60 },
  },
}

// texto legível sobre uma cor de fundo (#rrggbb): preto ou branco
export function contraste(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#121210' : '#ffffff'
}

// Sem contorno = borda transparente de 2px: o preenchimento aparece por baixo
// dela (background-clip padrão), então um botão "Sólido" fica exatamente como
// antes (que tinha borda de 2px na mesma cor do fundo).
function partesDoBotao(b) {
  return {
    fundo: b.preenchimento === 'nenhum' ? 'transparent' : b.preenchimento,
    texto: b.texto,
    borda: b.contorno > 0 ? `${b.contorno}px solid ${b.cor_contorno}` : '2px solid transparent',
  }
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

// fontes efetivas de cada elemento (null = igual à principal)
export function fontesDoDoc(doc) {
  const a = doc.aparencia
  return Object.fromEntries(['titulo', 'subtitulo', 'descricao', 'botoes'].map(e => [e, a.fontes[e] || a.fonte]))
}

// cor do destaque "automática": a do botão (preenchimento; sem ele, o contorno; sem os dois, o texto)
function corDestaqueAuto(b) {
  if (b.preenchimento !== 'nenhum') return b.preenchimento
  return b.contorno > 0 ? b.cor_contorno : b.texto
}

// raiz da página: fundo, textos, fontes, tamanhos, botões e o destaque padrão
export function variaveisDeDesign(doc) {
  const a = doc.aparencia
  const f = a.fundo
  const fontes = fontesDoDoc(doc)
  const t = a.tamanhos
  const bt = ESCALA.botoes[t.botoes]
  const destaque = a.cor_destaque || corDestaqueAuto(a.botao)
  const s = {
    backgroundColor: f.cor,
    '--pg-fundo': f.cor,
    '--pg-texto': a.cor_texto,
    '--pg-texto-suave': a.cor_texto_suave,
    '--pg-fonte': familiaV2(a.fonte),
    '--pg-fonte-titulo': familiaV2(fontes.titulo),
    '--pg-fonte-subtitulo': familiaV2(fontes.subtitulo),
    '--pg-fonte-descricao': familiaV2(fontes.descricao),
    '--pg-fonte-botoes': familiaV2(fontes.botoes),
    '--pg-peso-titulo': pesoForte(fontes.titulo),
    '--pg-peso-subtitulo': pesoForte(fontes.subtitulo),
    '--pg-peso-botoes': pesoForte(fontes.botoes),
    '--pg-tam-titulo': `${ESCALA.titulo[t.titulo]}px`,
    '--pg-tam-subtitulo': `${ESCALA.subtitulo[t.subtitulo]}px`,
    '--pg-tam-descricao': `${ESCALA.descricao[t.descricao]}px`,
    '--pg-tam-botoes': `${bt.fonte}px`,
    '--pg-botao-py': `${bt.py}px`,
    '--pg-botao-px': `${bt.px}px`,
    '--pg-botao-altura': `${bt.altura}px`,
    '--pg-destaque': destaque,
    '--pg-destaque-fundo': destaque,
    '--pg-destaque-texto': contraste(destaque),
    '--pg-destaque-borda': '2px solid transparent',
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
// passa a usar preenchimento, contorno e texto próprios). Sem estilo próprio: nada.
export function varsDoItem(doc, item) {
  if (!item.estilo?.botao) return undefined
  const v = varsDoBotao(botaoDoItem(doc.aparencia.botao, item.estilo.botao))
  if (!item.estilo.destaque) return v
  return { ...v, '--pg-destaque-fundo': v['--pg-botao-fundo'], '--pg-destaque-texto': v['--pg-botao-texto'], '--pg-destaque-borda': v['--pg-botao-borda'] }
}
