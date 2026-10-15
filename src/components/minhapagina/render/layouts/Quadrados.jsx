// Layout Quadrados: perfil centralizado (sem capa — só no Clássico) e os
// links numa grade de 2 colunas de botões quadrados (1:1). Preenchimento,
// contorno, cantos, sombra e texto seguem Botões (ou o estilo próprio do item).
// Título de seção ocupa as 2 colunas; num grupo (itens entre seções) com
// quantidade ímpar, o último ocupa a largura toda. Descrição curta não aparece.
// Visual: nada = só o título; ícone = grande, no topo; imagem (pequena ou
// grande) = preenche o quadrado, com gradiente escuro e título branco por cima.

import { IconeSvg, Perfil, imagemDoItem, propsDoLink } from '../partes.jsx'
import { visualDoItem } from '../../../../utils/pagina/modelo.js'
import { varsDoItem } from '../../../../utils/pagina/tema.js'
import './Quadrados.css'

function Quadrado({ doc, item, href, previa, largo }) {
  const visual = visualDoItem(item)
  const comImagem = visual === 'imagem_pequena' || visual === 'imagem_grande'
  return (
    <a
      className={`pg-qd pg-qd--${comImagem ? 'imagem' : visual}${largo ? ' pg-qd--largo' : ''}`}
      style={varsDoItem(doc, item)} {...propsDoLink(item, href, previa)}
    >
      {comImagem && imagemDoItem(item, 'pg-qd-img')}
      {visual === 'icone' && <IconeSvg id={item.estilo.icone} className="pg-qd-icone" />}
      <span className="pg-qd-titulo">{item.titulo}</span>
    </a>
  )
}

// grupos de itens entre títulos de seção (para saber qual é o último ímpar)
function emGrupos(itens) {
  const grupos = []
  let atual = []
  for (const it of itens) {
    if (it.tipo === 'secao') {
      if (atual.length) grupos.push({ itens: atual })
      atual = []
      grupos.push({ secao: it })
    } else atual.push(it)
  }
  if (atual.length) grupos.push({ itens: atual })
  return grupos
}

export default function Quadrados({ doc, nome, itens, hrefDe, previa, selo }) {
  const { perfil } = doc
  return (
    <div className="pg-coluna pg-qd-layout">
      <div className="pg-conteudo">
        <Perfil perfil={perfil} nome={nome} classeFoto={`pg-foto pg-foto--${perfil.foto_formato}`} />

        {itens.length > 0 && (
          <nav className="pg-qd-grade" aria-label="Links">
            {emGrupos(itens).map(g => (g.secao
              ? <h2 key={g.secao.id} className="pg-secao pg-qd-secao">{g.secao.titulo}</h2>
              : g.itens.map((it, i) => (
                <Quadrado key={it.id} doc={doc} item={it} href={hrefDe(it)} previa={previa}
                  largo={g.itens.length % 2 === 1 && i === g.itens.length - 1} />
              ))))}
          </nav>
        )}

        {selo}
      </div>
    </div>
  )
}
