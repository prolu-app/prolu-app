import DOMPurify from 'dompurify'

// Introdução do formulário (formularios.intro_texto): HTML do Tiptap
// (EditorIntro.jsx). A página pública /e/:escritorio/:formulario é aberta por qualquer
// visitante no domínio do app, então o HTML é sempre limpo antes de ir para
// dangerouslySetInnerHTML — vale mesmo se a coluna for alterada fora do
// editor. Só as marcações que a barra do editor gera; de atributo, só o
// alinhamento (style="text-align: …"). public/embed.js aplica a mesma lista.

const TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'ul', 'ol', 'li']
const ALINHAMENTOS = ['left', 'center', 'right', 'justify']
export const INTRO_MAX = 5000 // constraint formularios_apresentacao_valida (migration_029)

const escapar = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Introduções salvas antes do editor rico eram texto puro com quebras de
// linha: viram um parágrafo por linha.
export function introParaHtml(valor) {
  const v = (valor || '').trim()
  if (!v) return ''
  if (/<\/?[a-z][^>]*>/i.test(v)) return v
  return v.split(/\r?\n/).map(l => `<p>${escapar(l)}</p>`).join('')
}

export function sanitizarIntro(valor) {
  const frag = DOMPurify.sanitize(introParaHtml(valor), {
    ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ['style'], RETURN_DOM_FRAGMENT: true,
  })
  // do style, só o text-align (sem posição, fundo, url() etc.)
  frag.querySelectorAll('[style]').forEach(el => {
    const alinhamento = el.style.textAlign
    el.removeAttribute('style')
    if (ALINHAMENTOS.includes(alinhamento)) el.style.textAlign = alinhamento
  })
  const div = document.createElement('div')
  div.appendChild(frag)
  return div.innerHTML
}

// editor vazio devolve "<p></p>": trata como sem introdução
export function introVazia(html) {
  return !(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}
