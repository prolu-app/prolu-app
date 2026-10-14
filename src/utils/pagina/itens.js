// Tipos de item da lista da Minha Página v2. Cada tipo declara o rótulo e
// como nasce um item novo (já no formato que pagina_v2_validar aceita).
// Tipo novo (galeria, vídeo, cartão de visita…): uma entrada aqui, o desenho
// em components/minhapagina/render/partes.jsx e o case no SQL.

import { LIMITES } from './modelo.js'

export function novoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  b[6] = (b[6] & 15) | 64
  b[8] = (b[8] & 63) | 128
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const estiloNovo = () => ({ v: 1, destaque: false, icone: null })

export const TIPOS_ITEM = {
  link: {
    rotulo: 'Link',
    criar: () => ({ id: novoId(), tipo: 'link', ativo: true, titulo: '', descricao: '', url: null, formulario_id: null, imagem_url: null, imagem_modo: null, estilo: estiloNovo() }),
  },
  formulario: {
    rotulo: 'Formulário',
    criar: form => ({
      id: novoId(), tipo: 'formulario', ativo: true, titulo: form ? form.nome.slice(0, LIMITES.titulo) : '', descricao: '',
      url: null, formulario_id: form?.id || null, imagem_url: null, imagem_modo: null, estilo: { ...estiloNovo(), icone: 'documento' },
    }),
  },
  secao: {
    rotulo: 'Título de seção',
    criar: () => ({ id: novoId(), tipo: 'secao', ativo: true, titulo: '' }),
  },
}
