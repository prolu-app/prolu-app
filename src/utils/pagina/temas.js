// Temas prontos da Minha Página v2: pacotes de valores que já existem
// (fundo, cores do nome e do texto, fontes, tamanhos e Botões), aplicados
// com um clique. O tema NÃO é uma referência: aplicarTema grava os valores
// normais no rascunho e a pessoa pode mudar qualquer controle depois. O tema
// "selecionado" é calculado comparando valores (temaDoDoc) — sem chave nova
// no documento. Independente do layout; não mexe em layout, capa, foto,
// itens, ícones nem no estilo próprio de cada item.
// Contraste conferido (≥ 4,5:1) para nome e texto sobre o fundo, texto do
// botão e descrição curta (80%) sobre o botão (ou o fundo, sem preenchimento).

import { comCaminho, normalizarDoc } from './modelo.js'

const ELEMENTOS = ['titulo', 'subtitulo', 'descricao', 'botoes']

// botao: preenchimento ('nenhum' ou cor), contorno (0-3) e cor_contorno, texto, cantos, sombra
export const TEMAS = [
  { id: 'claro', rotulo: 'Claro', fundo: '#f6f4ef', nome: '#1a1a1a', texto: '#555555', fonte: 'Inter',
    botao: { preenchimento: 'nenhum', contorno: 1, cor_contorno: '#1a1a1a', texto: '#1a1a1a', cantos: 'md', sombra: 'none' } },
  { id: 'grafite', rotulo: 'Grafite', fundo: '#1a1a1a', nome: '#ffffff', texto: '#b8b8b8', fonte: 'Montserrat',
    botao: { preenchimento: '#f2f2f2', contorno: 0, cor_contorno: '#f2f2f2', texto: '#1a1a1a', cantos: 'lg', sombra: 'soft' } },
  // botão #A8573C → #974E36: a descrição curta (branco a 80%) ficava em 3,9:1
  { id: 'terra', rotulo: 'Terra', fundo: '#f1e7dc', nome: '#3b2a20', texto: '#6b5547', fonte: 'DM Sans', fontes: { titulo: 'Lora' },
    botao: { preenchimento: '#974e36', contorno: 0, cor_contorno: '#974e36', texto: '#ffffff', cantos: 'lg', sombra: 'none' } },
  { id: 'concreto', rotulo: 'Concreto', fundo: '#e4e4e2', nome: '#1f1f1f', texto: '#4a4a4a', fonte: 'Space Grotesk',
    botao: { preenchimento: 'nenhum', contorno: 2, cor_contorno: '#1f1f1f', texto: '#1f1f1f', cantos: 'none', sombra: 'hard' } },
  { id: 'linho', rotulo: 'Linho', fundo: '#faf6ee', nome: '#2e2a25', texto: '#6a6258', fonte: 'Work Sans', fontes: { titulo: 'Playfair Display' }, tamanhos: { titulo: 'g' },
    botao: { preenchimento: '#eadfcb', contorno: 1, cor_contorno: '#2e2a25', texto: '#2e2a25', cantos: 'full', sombra: 'none' } },
  { id: 'oliva', rotulo: 'Oliva', fundo: '#eef0e4', nome: '#2f3a24', texto: '#5c6650', fonte: 'DM Sans',
    botao: { preenchimento: '#4f6b3a', contorno: 0, cor_contorno: '#4f6b3a', texto: '#ffffff', cantos: 'md', sombra: 'soft' } },
  { id: 'editorial-pb', rotulo: 'Editorial P&B', fundo: '#ffffff', nome: '#000000', texto: '#444444', fonte: 'Inter', fontes: { titulo: 'Cormorant Garamond' }, tamanhos: { titulo: 'g' },
    botao: { preenchimento: 'nenhum', contorno: 1, cor_contorno: '#000000', texto: '#000000', cantos: 'none', sombra: 'none' } },
]

// valores que o tema define, já no formato de aparencia (normalizado)
export function valoresDoTema(tema) {
  return {
    fundo: { tipo: 'cor', cor: tema.fundo },
    cor_texto: tema.nome,
    cor_texto_suave: tema.texto,
    fonte: tema.fonte,
    fontes: Object.fromEntries(ELEMENTOS.map(e => [e, tema.fontes?.[e] || null])),
    tamanhos: Object.fromEntries(ELEMENTOS.map(e => [e, tema.tamanhos?.[e] || 'm'])),
    botao: tema.botao,
  }
}

// grava os valores do tema no documento cru (o resto fica como está)
export function aplicarTema(doc, tema) {
  const v = valoresDoTema(tema)
  const b = v.botao
  const solido = b.preenchimento !== 'nenhum'
  const botaoCru = {
    ...(doc?.aparencia?.botao && typeof doc.aparencia.botao === 'object' ? doc.aparencia.botao : {}),
    ...b,
    // chaves de antes coerentes com o tema (atalhos Sólido/Contorno partem delas)
    estilo: solido ? 'solido' : 'contorno',
    cor: solido ? b.preenchimento : b.cor_contorno,
    cor_texto: b.texto,
    cor_texto_contorno: b.texto,
    espessura_contorno: b.contorno > 0 ? b.contorno : 2,
  }
  let d = doc
  d = comCaminho(d, ['aparencia', 'fundo', 'tipo'], 'cor')
  d = comCaminho(d, ['aparencia', 'fundo', 'cor'], v.fundo.cor)
  d = comCaminho(d, ['aparencia', 'cor_texto'], v.cor_texto)
  d = comCaminho(d, ['aparencia', 'cor_texto_suave'], v.cor_texto_suave)
  d = comCaminho(d, ['aparencia', 'fonte'], v.fonte)
  d = comCaminho(d, ['aparencia', 'fontes'], v.fontes)
  d = comCaminho(d, ['aparencia', 'tamanhos'], v.tamanhos)
  d = comCaminho(d, ['aparencia', 'botao'], botaoCru)
  return d
}

// id do tema cujos valores batem com o documento (normalizado), ou null (= personalizado)
export function temaDoDoc(docNormal) {
  const a = docNormal.aparencia
  for (const tema of TEMAS) {
    const v = valoresDoTema(tema)
    const iguais = a.fundo.tipo === 'cor' && a.fundo.cor === v.fundo.cor
      && a.cor_texto === v.cor_texto && a.cor_texto_suave === v.cor_texto_suave
      && a.fonte === v.fonte
      && ELEMENTOS.every(e => a.fontes[e] === v.fontes[e] && a.tamanhos[e] === v.tamanhos[e])
      && Object.entries(v.botao).every(([k, val]) => a.botao[k] === val
        // sem contorno, a cor do contorno não aparece: não conta
        || (k === 'cor_contorno' && v.botao.contorno === 0))
    if (iguais) return tema.id
  }
  return null
}

// documento normalizado com o tema aplicado (miniaturas)
export const docComTema = (docNormal, tema) => normalizarDoc(aplicarTema(docNormal, tema))
