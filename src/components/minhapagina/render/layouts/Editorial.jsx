// Layout Editorial: tudo alinhado à esquerda, nome em corpo grande, muito
// respiro. Sem capa (só no Clássico). Links em duas formas (layout_opcoes.
// editorial_links): "linhas" — linhas de índice com divisor fino e seta à
// direita, sem preenchimento — ou "botoes" — os botões da página (Botões),
// com o texto à esquerda. Item com estilo próprio aparece como botão, com o
// estilo dele, também nas Linhas. Título de seção: pequeno em caixa alta
// (Subtítulo P/M) ou destacado (G/GG). O jeito "tipográfico" vem das fontes
// e dos temas, não de um layout à parte.

import { IconeSvg, ItemPagina, Perfil, Seta, imagemDoItem, propsDoLink } from '../partes.jsx'
import { visualDoItem } from '../../../../utils/pagina/modelo.js'
import './Editorial.css'

function Linha({ item, href, previa }) {
  const visual = visualDoItem(item)
  return (
    <a className={`pg-ed-linha pg-ed-linha--${visual.replace('_', '-')}`} {...propsDoLink(item, href, previa)}>
      {visual === 'imagem_grande' && imagemDoItem(item, 'pg-ed-linha-img')}
      <span className="pg-ed-linha-corpo">
        {visual === 'icone' && <IconeSvg id={item.estilo.icone} className="pg-ed-linha-icone" />}
        {visual === 'imagem_pequena' && imagemDoItem(item, 'pg-ed-linha-mini')}
        <span className="pg-ed-linha-texto">
          <span className="pg-ed-linha-titulo">{item.titulo}</span>
          {item.descricao?.trim() && <span className="pg-ed-linha-desc">{item.descricao}</span>}
        </span>
        <Seta className="pg-ed-linha-seta" />
      </span>
    </a>
  )
}

export default function Editorial({ doc, nome, itens, hrefDe, previa, selo }) {
  const { perfil } = doc
  const modo = doc.layout_opcoes.editorial_links
  const secaoDestacada = doc.aparencia.tamanhos.subtitulo === 'g' || doc.aparencia.tamanhos.subtitulo === 'gg'

  return (
    <div className="pg-coluna pg-ed">
      <div className="pg-conteudo pg-ed-conteudo">
        <div className="pg-ed-perfil">
          <Perfil perfil={perfil} nome={nome} classeFoto={`pg-foto pg-foto--${perfil.foto_formato} pg-ed-foto`} />
        </div>

        {itens.length > 0 && (
          <nav className={`pg-ed-itens pg-ed-itens--${modo}`} aria-label="Links">
            {itens.map(it => {
              if (it.tipo === 'secao') {
                return <h2 key={it.id} className={`pg-secao pg-ed-secao${secaoDestacada ? ' pg-ed-secao--destacada' : ''}`}>{it.titulo}</h2>
              }
              if (modo === 'botoes' || it.estilo?.botao) {
                return <ItemPagina key={it.id} doc={doc} item={it} href={hrefDe(it)} previa={previa} classe="pg-ed-botao" />
              }
              return <Linha key={it.id} item={it} href={hrefDe(it)} previa={previa} />
            })}
          </nav>
        )}

        {selo}
      </div>
    </div>
  )
}
