// Desenho da Minha Página — o mesmo na página pública (/<slug>) e na prévia ao
// vivo do editor. Recebe a configuração JÁ normalizada (normalizarPagina) e os
// links no formato da função pagina_publica: { id, tipo, titulo, url,
// slug_formulario, estilo }.

import { useEffect } from 'react'
import { carregarFonte, estiloDoBotao, estiloDoFundo, familiaDaFonte } from '../../utils/paginaConfig.js'
import './PaginaView.css'

function hrefDoLink(link, slugEscritorio) {
  if (link.tipo === 'formulario') return link.slug_formulario ? `/e/${slugEscritorio}/${link.slug_formulario}` : null
  return link.url || null
}

export default function PaginaView({ config, links, slugEscritorio, escritorio, previa = false }) {
  useEffect(() => { carregarFonte(config.fonte) }, [config.fonte])

  const nome = config.nome_exibicao.trim() || escritorio || ''
  const comImagem = config.fundo_tipo === 'textura' || config.fundo_tipo === 'sombra'
  const visiveis = links.filter(l => l.titulo.trim() && hrefDoLink(l, slugEscritorio))

  return (
    <div
      className={`mp-pagina${comImagem ? ' mp-pagina--imagem' : ''}${previa ? ' mp-pagina--previa' : ''}`}
      style={{ ...estiloDoFundo(config), fontFamily: familiaDaFonte(config.fonte) }}
    >
      <div className="mp-conteudo">
        {config.banner_url && <img className="mp-banner" src={config.banner_url} alt="" />}
        {config.foto_perfil && (
          <img
            className={`mp-foto mp-foto--${config.foto_perfil_formato}${config.banner_url ? ' mp-foto--sobre-banner' : ''}`}
            src={config.foto_perfil} alt={nome}
          />
        )}
        {nome && <h1 className="mp-nome" style={{ color: config.cor_texto }}>{nome}</h1>}
        {config.bio.trim() && <p className="mp-bio" style={{ color: config.cor_texto_bio }}>{config.bio}</p>}

        {visiveis.length > 0 && (
          <nav className="mp-links" aria-label="Links">
            {visiveis.map(l => {
              const externo = l.tipo === 'link' && /^https?:/i.test(l.url)
              return (
                <a
                  key={l.id}
                  className="mp-link"
                  href={hrefDoLink(l, slugEscritorio)}
                  style={estiloDoBotao(config, l.estilo)}
                  {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  {...(previa ? { tabIndex: -1, onClick: e => e.preventDefault() } : {})}
                >
                  {l.titulo}
                </a>
              )
            })}
          </nav>
        )}

        {config.rodape_prolu && (
          <a className="mp-rodape" href="https://prolu.com.br" target="_blank" rel="noopener noreferrer" style={{ color: config.cor_texto_bio }}
            {...(previa ? { tabIndex: -1, onClick: e => e.preventDefault() } : {})}>
            Feito com Prolu
          </a>
        )}
      </div>
    </div>
  )
}
