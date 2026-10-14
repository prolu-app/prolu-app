// Peças do render da Minha Página v2, compartilhadas pelos layouts: capa,
// ícone da biblioteca e o desenho de cada tipo de item. Tudo visual vem das
// variáveis de design (utils/pagina/tema.js); aqui só estrutura.

import { ICONES } from '../icones/icones.js'
import { visualDoItem } from '../../../utils/pagina/modelo.js'
import { varsDoItem } from '../../../utils/pagina/tema.js'

const POSICAO = { topo: 'center top', centro: 'center', base: 'center bottom' }

// banner (contido, com margem), capa (largura da coluna) ou hero (alto, com o
// perfil por cima — children). É a maior imagem da página (LCP): carrega com prioridade.
export function Capa({ capa, children }) {
  return (
    <div className={`pg-capa pg-capa--${capa.estilo}`}>
      <img
        className="pg-capa-img" src={capa.imagem} alt="" decoding="async" fetchpriority="high"
        style={{ objectPosition: POSICAO[capa.foco] }}
      />
      {children}
    </div>
  )
}

// SVG constante deste código (ICONES), escolhido por id de lista fechada
export function IconeSvg({ id, className }) {
  const icone = ICONES[id]
  if (!icone) return null
  const marca = icone.grupo === 'marca'
  return (
    <svg
      className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={marca ? 'currentColor' : 'none'}
      {...(marca ? {} : { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })}
      dangerouslySetInnerHTML={{ __html: icone.svg }}
    />
  )
}

// item da lista: título de seção, ou link/formulário com o visual escolhido
export function ItemPagina({ doc, item, href, previa, destaque = false }) {
  if (item.tipo === 'secao') return <h2 className="pg-secao">{item.titulo}</h2>
  const visual = visualDoItem(item)
  const externo = item.tipo === 'link' && /^https?:/i.test(item.url)
  return (
    <a
      className={`pg-item pg-item--${visual.replace('_', '-')}${destaque ? ' pg-item--destaque' : ''}`}
      href={href}
      style={varsDoItem(doc, item)}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...(previa ? { tabIndex: -1, onClick: e => e.preventDefault() } : {})}
    >
      {visual === 'imagem_grande' && <img className="pg-item-banner" src={item.imagem_url} alt="" loading="lazy" decoding="async" />}
      {visual === 'imagem_pequena' && <img className="pg-item-mini" src={item.imagem_url} alt="" loading="lazy" decoding="async" />}
      {visual === 'icone' && <IconeSvg id={item.estilo.icone} className="pg-item-icone" />}
      <span className="pg-item-texto">
        <span className="pg-item-titulo">{item.titulo}</span>
        {item.descricao?.trim() && <span className="pg-item-desc">{item.descricao}</span>}
      </span>
    </a>
  )
}
