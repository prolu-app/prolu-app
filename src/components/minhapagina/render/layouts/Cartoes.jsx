// Layout Cartões: cabeçalho (foto, nome, subtítulo, bio) dentro de um cartão
// no topo (sem capa — só no Clássico) e cada link como um cartão grande:
// título, descrição curta opcional e um botão de seta à direita, que some com
// layout_opcoes.cartoes_seta = false. Os cartões dos links seguem Botões
// (preenchimento, contorno, cantos, sombra, texto) ou o estilo próprio.
// Visual: ícone ou imagem pequena à esquerda; imagem grande no topo do cartão.

import { IconeSvg, Perfil, Seta, imagemDoItem, propsDoLink } from '../partes.jsx'
import { visualDoItem } from '../../../../utils/pagina/modelo.js'
import { varsDoItem } from '../../../../utils/pagina/tema.js'
import './Cartoes.css'

function Cartao({ doc, item, href, previa, seta }) {
  const visual = visualDoItem(item)
  return (
    <a className={`pg-ct-item pg-ct-item--${visual.replace('_', '-')}`} style={varsDoItem(doc, item)} {...propsDoLink(item, href, previa)}>
      {visual === 'imagem_grande' && imagemDoItem(item, 'pg-ct-img')}
      <span className="pg-ct-linha">
        {visual === 'icone' && <IconeSvg id={item.estilo.icone} className="pg-ct-icone" />}
        {visual === 'imagem_pequena' && imagemDoItem(item, 'pg-ct-mini')}
        <span className="pg-ct-texto">
          <span className="pg-ct-titulo">{item.titulo}</span>
          {item.descricao?.trim() && <span className="pg-ct-desc">{item.descricao}</span>}
        </span>
        {seta && <span className="pg-ct-seta"><Seta /></span>}
      </span>
    </a>
  )
}

export default function Cartoes({ doc, nome, itens, hrefDe, previa, selo }) {
  const { perfil } = doc
  const seta = doc.layout_opcoes.cartoes_seta
  return (
    <div className="pg-coluna pg-ct">
      <div className="pg-conteudo">
        {(perfil.foto || nome || perfil.subtitulo.trim() || perfil.bio.trim()) && (
          <header className="pg-ct-cabecalho">
            <Perfil perfil={perfil} nome={nome} classeFoto={`pg-foto pg-foto--${perfil.foto_formato}`} />
          </header>
        )}

        {itens.length > 0 && (
          <nav className="pg-itens pg-ct-itens" aria-label="Links">
            {itens.map(it => (it.tipo === 'secao'
              ? <h2 key={it.id} className="pg-secao">{it.titulo}</h2>
              : <Cartao key={it.id} doc={doc} item={it} href={hrefDe(it)} previa={previa} seta={seta} />))}
          </nav>
        )}

        {selo}
      </div>
    </div>
  )
}
