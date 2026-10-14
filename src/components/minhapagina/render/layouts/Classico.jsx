// Layout Clássico: coluna central de até 480px — capa, perfil, destaque no
// topo da lista, itens e selo.
// Capa:
// • Banner: contida, com margem; foto parcialmente sobre ela; perfil centralizado.
// • Capa: largura toda da coluna; foto parcialmente sobre ela; perfil centralizado.
// • Hero: imagem alta com gradiente escuro; foto pequena (ocultável), nome,
//   subtítulo e bio em branco SOBRE a imagem, ancorados embaixo e alinhados à
//   esquerda (a foto fica acima do nome, nunca sobre ele). Os itens começam
//   logo abaixo da imagem, sobre o fundo da página.
// Estilo com imagem ausente não desenha capa (o editor avisa e a publicação
// é bloqueada).

import { Capa, ItemPagina } from '../partes.jsx'

function Perfil({ perfil, nome, classeFoto }) {
  return (
    <>
      {perfil.foto && classeFoto && <img className={classeFoto} src={perfil.foto} alt={nome} decoding="async" />}
      {nome && <h1 className="pg-nome">{nome}</h1>}
      {perfil.subtitulo.trim() && <p className="pg-subtitulo">{perfil.subtitulo}</p>}
      {perfil.bio.trim() && <p className="pg-bio">{perfil.bio}</p>}
    </>
  )
}

export default function Classico({ doc, nome, destaque, itens, hrefDe, previa, selo }) {
  const { perfil, capa } = doc
  const estiloCapa = capa.estilo !== 'nenhuma' && capa.imagem ? capa.estilo : 'nenhuma'
  const hero = estiloCapa === 'hero'
  const sobreCapa = estiloCapa === 'banner' || estiloCapa === 'capa'

  return (
    <div className={`pg-coluna pg-coluna--capa-${estiloCapa}`}>
      {estiloCapa === 'capa' && <Capa capa={capa} />}
      {hero && (
        <Capa capa={capa}>
          <div className="pg-hero-texto">
            <Perfil perfil={perfil} nome={nome}
              classeFoto={perfil.foto_oculta ? null : `pg-hero-foto pg-foto--${perfil.foto_formato}`} />
          </div>
        </Capa>
      )}
      <div className="pg-conteudo">
        {estiloCapa === 'banner' && <Capa capa={capa} />}
        {!hero && (
          <Perfil perfil={perfil} nome={nome}
            classeFoto={`pg-foto pg-foto--${perfil.foto_formato}${sobreCapa ? ' pg-foto--sobre-capa' : ''}`} />
        )}

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
