// Render único da Minha Página v2 — o mesmo na página pública (documento
// publicado, via pagina_publica) e na prévia do editor (rascunho).
// O núcleo cuida do que vale para todos os layouts: variáveis de design,
// fundo, fontes, itens visíveis e o selo "Feito com Prolu"
// (anexado aqui, então aparece em qualquer layout). O layout só decide a
// estrutura (layouts/index.js).
//
// Props:
//   doc        documento JÁ normalizado (normalizarDoc); itens de formulário
//              com slug_formulario resolvido (só os ativos do escritório)
//   selo       boolean decidido fora: público = servidor (plano); prévia = plano da conta
//   escritorio nome do escritório (nome vazio na página = nome do escritório)
//   slug       slug do escritório (link dos formulários)
//   modo       'publico' | 'previa' (prévia: links não navegam; altura da
//              tela vem da moldura, por --pg-altura-tela)
//   alturaTela px da tela da prévia (só no modo prévia)

import { useEffect } from 'react'
import { carregarFonteV2 } from '../../../utils/pagina/fontes.js'
import { itemVisivel } from '../../../utils/pagina/modelo.js'
import { fontesDoDoc, variaveisDeDesign } from '../../../utils/pagina/tema.js'
import { ehDominioCurto } from '../../../utils/slug.js'
import { layoutDe } from './layouts/index.js'
import './PaginaRender.css'

const URL_SELO = 'https://prolu.com.br/?utm_source=selo&utm_medium=minha-pagina'

// no domínio curto sem /e/ (prolu.link/<escritório>/<formulário>); no app, /e/…
function hrefDoItem(item, slug) {
  if (item.tipo === 'formulario') {
    const prefixo = typeof window !== 'undefined' && !ehDominioCurto() ? '/e' : ''
    return `${prefixo}/${slug}/${item.slug_formulario}`
  }
  return item.url
}

function Selo({ previa }) {
  return (
    <div className="pg-selo-wrap">
      <a className="pg-selo" href={URL_SELO} target="_blank" rel="noopener"
        {...(previa ? { tabIndex: -1, onClick: e => e.preventDefault() } : {})}>
        <img src="/prolu_app_icon_logo.png" alt="" width="20" height="20" />
        Feito com Prolu
      </a>
    </div>
  )
}

export default function PaginaRender({ doc, selo, escritorio = '', slug = '', modo = 'publico', alturaTela }) {
  const previa = modo === 'previa'
  // só as fontes usadas na página (principal + as escolhidas por elemento)
  const usadas = [...new Set([doc.aparencia.fonte, ...Object.values(fontesDoDoc(doc))])].join('|')
  useEffect(() => { usadas.split('|').forEach(carregarFonteV2) }, [usadas])

  const itens = doc.itens.filter(itemVisivel)
  const Layout = layoutDe(doc.layout).Componente
  const comImagem = doc.aparencia.fundo.tipo === 'textura' || doc.aparencia.fundo.tipo === 'sombra'

  const estilo = variaveisDeDesign(doc)
  if (previa && alturaTela) estilo['--pg-altura-tela'] = `${alturaTela}px`

  return (
    <div
      className={`pg-pagina pg-layout-${doc.layout}${comImagem ? ' pg-pagina--imagem' : ''}${previa ? ' pg-pagina--previa' : ''}`}
      style={estilo}
    >
      <Layout
        doc={doc}
        nome={doc.perfil.nome.trim() || escritorio}
        itens={itens}
        hrefDe={it => hrefDoItem(it, slug)}
        previa={previa}
        selo={selo ? <Selo previa={previa} /> : null}
      />
    </div>
  )
}
