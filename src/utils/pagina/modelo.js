// Minha Página v2 (migrations 056/057): um documento por escritório, em
// paginas.rascunho (editor e prévia) e paginas.publicado (página pública).
//
// Duas leituras diferentes do mesmo documento:
// • normalizarDoc — para DESENHAR: completa com os padrões e descarta o que
//   não é válido; nunca lança erro. Vale para a prévia e para o público (o
//   JSON vem do banco e é aberto a qualquer visitante: nada vira CSS cru).
// • o editor GRAVA o documento que carregou, só com os caminhos alterados
//   (comCaminho): chave que este código não conhece é preservada. Quem
//   valida o que é gravado é o servidor (pagina_v2_validar), com as mesmas
//   listas fechadas daqui — mudar nos dois lugares.

import { FONTES, TEXTURAS, SOMBRAS } from '../paginaConfig.js'
import { FONTE_IDS, FONTE_PADRAO } from './fontes.js'
import { PATTERNS } from '../pagePatterns.js'
import { ICONE_IDS } from '../../components/minhapagina/icones/icones.js'

export const VERSAO = 2
export const LIMITES = { nome: 80, subtitulo: 40, bio: 300, titulo: 100, descricao: 80, itens: 100, url: 2000 }

export const LISTAS = {
  layout: ['classico', 'editorial', 'quadrados', 'cartoes'],
  capa_estilo: ['nenhuma', 'banner', 'capa', 'hero'],
  capa_foco: ['topo', 'centro', 'base'],
  foto_formato: ['quadrado', 'arredondado', 'redondo'],
  fonte: FONTE_IDS,
  // fonte_titulo/fonte_corpo de rascunhos anteriores à 057: aceitas no banco
  // (lista antiga + nova), lidas só se estiverem na lista nova
  fonte_legada: [...new Set([...FONTES.map(f => f.id), ...FONTE_IDS])],
  tamanho: ['p', 'm', 'g', 'gg'],
  elemento: ['titulo', 'subtitulo', 'descricao', 'botoes'],
  fundo_tipo: ['cor', 'pattern', 'textura', 'sombra'],
  fundo_pattern: Object.keys(PATTERNS),
  fundo_imagem: [...TEXTURAS, ...SOMBRAS].map(t => t.id),
  botao_estilo: ['solido', 'contorno'],
  botao_espessura: [1, 2, 3],
  botao_contorno: [0, 1, 2, 3], // 0 = sem contorno
  botao_cantos: ['none', 'sm', 'md', 'lg', 'full'],
  botao_sombra: ['none', 'soft', 'strong', 'hard'],
  item_tipo: ['link', 'formulario', 'secao'],
  imagem_modo: ['icone', 'banner'], // icone = imagem pequena, banner = imagem grande
  icone: ICONE_IDS,
}
export const OPACIDADE = [0.05, 0.4]

// Botão: preenchimento, contorno e texto independentes (057). As chaves de
// antes (estilo Sólido/Contorno + cores) continuam valendo: sem as novas,
// preenchimento/contorno/texto são derivados delas — a aparência não muda.
export const BOTAO_PADRAO = {
  estilo: 'solido', cor: '#1a1a1a', cor_texto: '#ffffff', cor_contorno: '#1a1a1a',
  cor_texto_contorno: '', espessura_contorno: 2, cantos: 'md', sombra: 'none',
  preenchimento: '#1a1a1a', contorno: 0, texto: '#ffffff',
}
export const CHAVES_BOTAO_NOVAS = ['preenchimento', 'contorno', 'texto']

// preenchimento/contorno/texto a partir de Sólido/Contorno e das cores de antes
export function derivarBotao(v) {
  return v.estilo === 'contorno'
    ? { preenchimento: 'nenhum', contorno: v.espessura_contorno, texto: v.cor_texto_contorno || v.cor_contorno }
    : { preenchimento: v.cor, contorno: 0, texto: v.cor_texto }
}

export const PADRAO_V2 = {
  v: VERSAO,
  layout: 'classico',
  tema: null,
  perfil: { nome: '', subtitulo: '', bio: '', foto: null, foto_formato: 'redondo', foto_oculta: false },
  capa: { estilo: 'nenhuma', imagem: null, foco: 'centro' },
  aparencia: {
    fonte: FONTE_PADRAO,
    fontes: { titulo: null, subtitulo: null, descricao: null, botoes: null }, // null = igual à principal
    tamanhos: { titulo: 'm', subtitulo: 'm', descricao: 'm', botoes: 'm' },
    cor_texto: '#1a1a1a', cor_texto_suave: '#555555', cor_destaque: null,
    fundo: { tipo: 'cor', cor: '#f8f7f5', pattern: null, pattern_cor: '#000000', pattern_opacidade: 0.1, imagem: null, imagem_opacidade: 0.15 },
    botao: BOTAO_PADRAO,
  },
  selo: true,
  itens: [],
}

export const COR_RE = /^#[0-9a-f]{6}$/i
export const IMG_RE = /^https:\/\/[^\s"'()\\]+$/i
export const URL_LINK_RE = /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9() -]+)$/i
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9-]{1,80}$/

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const texto = (v, max, padrao = '') => (typeof v === 'string' ? v.slice(0, max) : padrao)
const opcao = (v, lista, padrao) => (lista.includes(v) ? v : padrao)
const cor = (v, padrao) => (typeof v === 'string' && COR_RE.test(v) ? v.toLowerCase() : padrao)
const imagem = v => (typeof v === 'string' && v.length <= LIMITES.url && IMG_RE.test(v) ? v : null)
const bool = (v, padrao) => (typeof v === 'boolean' ? v : padrao)
const opacidade = (v, padrao) => (Number.isFinite(v) ? Math.min(OPACIDADE[1], Math.max(OPACIDADE[0], Math.round(v * 100) / 100)) : padrao)

const preenchimentoValido = v => v === 'nenhum' || (typeof v === 'string' && COR_RE.test(v))

// botão completo (aparencia.botao): chaves de antes + preenchimento/contorno/texto
// (presentes e válidas, ou derivadas de Sólido/Contorno)
export function normalizarBotao(bruto, base = BOTAO_PADRAO) {
  const b = obj(bruto)
  const velho = {
    estilo: opcao(b.estilo, LISTAS.botao_estilo, base.estilo),
    cor: cor(b.cor, base.cor),
    cor_texto: cor(b.cor_texto, base.cor_texto),
    cor_contorno: cor(b.cor_contorno, base.cor_contorno),
    cor_texto_contorno: b.cor_texto_contorno === '' ? '' : cor(b.cor_texto_contorno, base.cor_texto_contorno),
    espessura_contorno: opcao(b.espessura_contorno, LISTAS.botao_espessura, base.espessura_contorno),
    cantos: opcao(b.cantos, LISTAS.botao_cantos, base.cantos),
    sombra: opcao(b.sombra, LISTAS.botao_sombra, base.sombra),
  }
  const d = derivarBotao(velho)
  return {
    ...velho,
    preenchimento: preenchimentoValido(b.preenchimento) ? b.preenchimento.toLowerCase() : d.preenchimento,
    contorno: opcao(b.contorno, LISTAS.botao_contorno, d.contorno),
    texto: cor(b.texto, d.texto),
  }
}

// estilo próprio de um item: só as chaves presentes e válidas (null = nenhuma)
function botaoParcial(bruto) {
  if (!bruto || typeof bruto !== 'object') return null
  const n = {}
  if (LISTAS.botao_estilo.includes(bruto.estilo)) n.estilo = bruto.estilo
  for (const k of ['cor', 'cor_texto', 'cor_contorno', 'texto']) if (cor(bruto[k], null)) n[k] = bruto[k].toLowerCase()
  if (bruto.cor_texto_contorno === '' || cor(bruto.cor_texto_contorno, null)) n.cor_texto_contorno = bruto.cor_texto_contorno.toLowerCase()
  if (LISTAS.botao_espessura.includes(bruto.espessura_contorno)) n.espessura_contorno = bruto.espessura_contorno
  if (LISTAS.botao_cantos.includes(bruto.cantos)) n.cantos = bruto.cantos
  if (LISTAS.botao_sombra.includes(bruto.sombra)) n.sombra = bruto.sombra
  if (preenchimentoValido(bruto.preenchimento)) n.preenchimento = bruto.preenchimento.toLowerCase()
  if (LISTAS.botao_contorno.includes(bruto.contorno)) n.contorno = bruto.contorno
  return Object.keys(n).length ? n : null
}

// botão efetivo de um item: página + estilo próprio. Estilo próprio só com
// chaves de antes (rascunho convertido) deriva preenchimento/contorno/texto
// delas; com as novas, as novas valem.
export function botaoDoItem(paginaBotao, proprio) {
  if (!proprio) return paginaBotao
  if (CHAVES_BOTAO_NOVAS.some(k => k in proprio)) return { ...paginaBotao, ...proprio }
  const velho = { ...paginaBotao, ...proprio }
  return ['estilo', 'cor', 'cor_texto', 'cor_contorno', 'cor_texto_contorno', 'espessura_contorno'].some(k => k in proprio)
    ? { ...velho, ...derivarBotao(velho) }
    : velho
}

// fonte principal + por elemento (null = igual à principal) e tamanhos P/M/G/GG.
// Rascunho anterior à 057: fonte_corpo vira a principal e fonte_titulo, se
// diferente, a do título — só se estiverem na lista nova.
function normalizarTipografia(a) {
  const fonte = opcao(a.fonte, LISTAS.fonte, null) ?? opcao(a.fonte_corpo, LISTAS.fonte, null) ?? FONTE_PADRAO
  const f = obj(a.fontes)
  const t = obj(a.tamanhos)
  const tituloLegado = !a.fontes && LISTAS.fonte.includes(a.fonte_titulo) && a.fonte_titulo !== fonte ? a.fonte_titulo : null
  return {
    fonte,
    fontes: {
      titulo: opcao(f.titulo, LISTAS.fonte, tituloLegado),
      subtitulo: opcao(f.subtitulo, LISTAS.fonte, null),
      descricao: opcao(f.descricao, LISTAS.fonte, null),
      botoes: opcao(f.botoes, LISTAS.fonte, null),
    },
    tamanhos: Object.fromEntries(LISTAS.elemento.map(e => [e, opcao(t[e], LISTAS.tamanho, 'm')])),
  }
}

function normalizarFundo(bruto) {
  const f = obj(bruto)
  const p = PADRAO_V2.aparencia.fundo
  const n = {
    tipo: opcao(f.tipo, LISTAS.fundo_tipo, p.tipo),
    cor: cor(f.cor, p.cor),
    pattern: opcao(f.pattern, LISTAS.fundo_pattern, null),
    pattern_cor: cor(f.pattern_cor, p.pattern_cor),
    pattern_opacidade: opacidade(f.pattern_opacidade, p.pattern_opacidade),
    imagem: opcao(f.imagem, LISTAS.fundo_imagem, null),
    imagem_opacidade: opacidade(f.imagem_opacidade, p.imagem_opacidade),
  }
  // tipo sem o item escolhido → só a cor
  if (n.tipo === 'pattern' && !n.pattern) n.tipo = 'cor'
  if (n.tipo === 'textura' && !TEXTURAS.some(t => t.id === n.imagem)) n.tipo = 'cor'
  if (n.tipo === 'sombra' && !SOMBRAS.some(t => t.id === n.imagem)) n.tipo = 'cor'
  return n
}

function normalizarItem(bruto) {
  const it = obj(bruto)
  if (typeof it.id !== 'string' || !UUID_RE.test(it.id) || !LISTAS.item_tipo.includes(it.tipo)) return null
  const base = { id: it.id, tipo: it.tipo, ativo: bool(it.ativo, true), titulo: texto(it.titulo, LIMITES.titulo) }
  if (it.tipo === 'secao') return base
  const e = obj(it.estilo)
  const url = imagem(it.imagem_url)
  const n = {
    ...base,
    descricao: texto(it.descricao, LIMITES.descricao),
    url: it.tipo === 'link' && typeof it.url === 'string' && it.url.length <= LIMITES.url && URL_LINK_RE.test(it.url) ? it.url : null,
    formulario_id: it.tipo === 'formulario' && typeof it.formulario_id === 'string' && UUID_RE.test(it.formulario_id) ? it.formulario_id : null,
    imagem_url: url,
    imagem_modo: url ? opcao(it.imagem_modo, LISTAS.imagem_modo, 'icone') : null, // modo ausente com imagem = pequena
    estilo: {
      destaque: e.destaque === true,
      icone: url ? null : opcao(e.icone, LISTAS.icone, null), // imagem vence o ícone
      botao: botaoParcial(e.botao), // só as chaves válidas; o resto vem de aparencia.botao
    },
  }
  // só chega pela função pública (formulário ativo do próprio escritório)
  if (it.tipo === 'formulario' && typeof it.slug_formulario === 'string' && SLUG_RE.test(it.slug_formulario)) n.slug_formulario = it.slug_formulario
  return n
}

export function normalizarDoc(bruto) {
  const d = obj(bruto)
  const p = obj(d.perfil)
  const c = obj(d.capa)
  const a = obj(d.aparencia)
  const P = PADRAO_V2
  const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, LIMITES.itens).map(normalizarItem).filter(Boolean)
  // ids únicos e no máximo 1 destaque (vale o primeiro)
  const vistos = new Set()
  let temDestaque = false
  const unicos = itens.filter(it => !vistos.has(it.id) && vistos.add(it.id)).map(it => {
    if (!it.estilo?.destaque) return it
    if (temDestaque) return { ...it, estilo: { ...it.estilo, destaque: false } }
    temDestaque = true
    return it
  })
  return {
    v: VERSAO,
    layout: opcao(d.layout, LISTAS.layout, P.layout),
    tema: null,
    perfil: {
      nome: texto(p.nome, LIMITES.nome),
      subtitulo: texto(p.subtitulo, LIMITES.subtitulo),
      bio: texto(p.bio, LIMITES.bio),
      foto: imagem(p.foto),
      foto_formato: opcao(p.foto_formato, LISTAS.foto_formato, P.perfil.foto_formato),
      foto_oculta: bool(p.foto_oculta, false),
    },
    capa: {
      estilo: opcao(c.estilo, LISTAS.capa_estilo, P.capa.estilo),
      imagem: imagem(c.imagem),
      foco: opcao(c.foco, LISTAS.capa_foco, P.capa.foco),
    },
    aparencia: {
      ...normalizarTipografia(a),
      cor_texto: cor(a.cor_texto, P.aparencia.cor_texto),
      cor_texto_suave: cor(a.cor_texto_suave, P.aparencia.cor_texto_suave),
      cor_destaque: cor(a.cor_destaque, null),
      fundo: normalizarFundo(a.fundo),
      botao: normalizarBotao(a.botao),
    },
    selo: bool(d.selo, true),
    itens: unicos,
  }
}

// Documento que o servidor aceita, a partir de qualquer coisa (usado no 1º
// rascunho convertido da página antiga, cujos valores nunca passaram pela
// validação v2): normaliza e devolve só o que pagina_v2_validar conhece,
// preservando estilo.legado de cada item.
export function docGravavel(bruto) {
  const n = normalizarDoc(bruto)
  const originais = new Map((Array.isArray(bruto?.itens) ? bruto.itens : []).map(it => [it?.id, it]))
  return {
    ...n,
    itens: n.itens.map(it => {
      if (it.tipo === 'secao') return it
      const { slug_formulario, ...resto } = it // eslint-disable-line no-unused-vars
      const legado = originais.get(it.id)?.estilo?.legado
      return {
        ...resto,
        estilo: {
          v: 1,
          destaque: it.estilo.destaque,
          icone: it.estilo.icone,
          ...(it.estilo.botao ? { botao: it.estilo.botao } : {}),
          ...(legado && typeof legado === 'object' && !Array.isArray(legado) ? { legado } : {}),
        },
      }
    }),
  }
}

// ── leitura para o desenho ──

// mesma regra de pagina_publica (migration_056): ativo, com título; link com
// URL; formulário com slug resolvido (ativo, do próprio escritório)
export function itemVisivel(it) {
  if (!it.ativo || !it.titulo.trim()) return false
  if (it.tipo === 'secao') return true
  if (it.tipo === 'link') return !!it.url
  return !!it.slug_formulario
}

// "Visual" de um item: nada | icone | imagem_pequena | imagem_grande
export function visualDoItem(it) {
  if (it.imagem_url) return it.imagem_modo === 'banner' ? 'imagem_grande' : 'imagem_pequena'
  if (it.estilo?.icone) return 'icone'
  return 'nada'
}

// capa que precisa de imagem e está sem: bloqueia a publicação (o servidor também confere)
export const capaSemImagem = doc => doc.capa.estilo !== 'nenhuma' && !doc.capa.imagem

// ── edição: altera só um caminho, preservando o resto do documento ──
export function comCaminho(alvo, caminho, valor) {
  const [chave, ...resto] = caminho
  const base = alvo && typeof alvo === 'object' && !Array.isArray(alvo) ? alvo : {}
  return { ...base, [chave]: resto.length ? comCaminho(base[chave], resto, valor) : valor }
}
