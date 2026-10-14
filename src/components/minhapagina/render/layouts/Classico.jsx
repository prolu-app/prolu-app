// Layout Clássico: coluna central de até 480px — capa, foto, nome,
// subtítulo, bio, destaque no topo da lista, itens e selo.
// Capa: banner (contido, foto parcialmente sobre ele), capa (largura toda da
// coluna, foto parcialmente sobre ela) ou hero (alto; foto pequena logo
// abaixo, sem sobrepor o nome, ocultável). Estilo com imagem ausente não
// desenha capa (o editor avisa e a publicação é bloqueada).

import { Capa, ItemPagina } from '../partes.jsx'

export default function Classico({ doc, nome, destaque, itens, hrefDe, previa, selo }) {
  const { perfil, capa } = doc
  const estiloCapa = capa.estilo !== 'nenhuma' && capa.imagem ? capa.estilo : 'nenhuma'
  const foraDaColuna = estiloCapa === 'capa' || estiloCapa === 'hero'
  const hero = estiloCapa === 'hero'
  const mostraFoto = perfil.foto && !(hero && perfil.foto_oculta)
  const sobreCapa = estiloCapa === 'banner' || estiloCapa === 'capa'

  return (
    <div className={`pg-coluna pg-coluna--capa-${estiloCapa}`}>
      {foraDaColuna && <Capa capa={capa} />}
      <div className="pg-conteudo">
        {estiloCapa === 'banner' && <Capa capa={capa} />}
        {mostraFoto && (
          <img
            className={`pg-foto pg-foto--${perfil.foto_formato}${sobreCapa ? ' pg-foto--sobre-capa' : ''}${hero ? ' pg-foto--hero' : ''}`}
            src={perfil.foto} alt={nome} decoding="async"
          />
        )}
        {nome && <h1 className="pg-nome">{nome}</h1>}
        {perfil.subtitulo.trim() && <p className="pg-subtitulo">{perfil.subtitulo}</p>}
        {perfil.bio.trim() && <p className="pg-bio">{perfil.bio}</p>}

        {(destaque || itens.length > 0) && (
          <nav className="pg-itens" aria-label="Links">
            {destaque && <ItemPagina doc={doc} item={destaque} href={hrefDe(destaque)} previa={previa} destaque />}
            {itens.map(it => <ItemPagina key={it.id} doc={doc} item={it} href={hrefDe(it)} previa={previa} />)}
          </nav>
        )}

        {selo}
      </div>
    </div>
  )
}
