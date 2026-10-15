// Peças do render da Minha Página v2, compartilhadas pelos layouts: capa,
// perfil, ícone da biblioteca, seta e o desenho de cada tipo de item. Tudo
// visual vem das variáveis de design (utils/pagina/tema.js); aqui só estrutura.

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

// foto (com o formato escolhido), nome, subtítulo e bio — o layout só decide
// as classes; classeFoto null = sem foto
export function Perfil({ perfil, nome, classeFoto }) {
  return (
    <>
      {perfil.foto && classeFoto && <img className={classeFoto} src={perfil.foto} alt={nome} decoding="async" />}
      {nome && <h1 className="pg-nome">{nome}</h1>}
      {perfil.subtitulo.trim() && <p className="pg-subtitulo">{perfil.subtitulo}</p>}
      {perfil.bio.trim() && <p className="pg-bio">{perfil.bio}</p>}
    </>
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

export function Seta({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
    </svg>
  )
}

// atributos comuns do <a> de um item: endereço, nova aba (links http) e, na
// prévia, sem navegar
export function propsDoLink(item, href, previa) {
  return {
    href,
    ...(item.tipo === 'link' && /^https?:/i.test(item.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    ...(previa ? { tabIndex: -1, onClick: e => e.preventDefault() } : {}),
  }
}

export const imagemDoItem = (item, className) => <img className={className} src={item.imagem_url} alt="" loading="lazy" decoding="async" />

// item da lista no formato botão (Clássico; também os botões do Editorial e
// os itens com estilo próprio nas Linhas): título de seção, ou link/formulário
// com o visual escolhido. classe: classe extra do layout.
export function ItemPagina({ doc, item, href, previa, classe = '' }) {
  if (item.tipo === 'secao') return <h2 className="pg-secao">{item.titulo}</h2>
  const visual = visualDoItem(item)
  return (
    <a className={`pg-item pg-item--${visual.replace('_', '-')}${classe ? ` ${classe}` : ''}`} style={varsDoItem(doc, item)} {...propsDoLink(item, href, previa)}>
      {visual === 'imagem_grande' && imagemDoItem(item, 'pg-item-banner')}
      {visual === 'imagem_pequena' && imagemDoItem(item, 'pg-item-mini')}
      {visual === 'icone' && <IconeSvg id={item.estilo.icone} className="pg-item-icone" />}
      <span className="pg-item-texto">
        <span className="pg-item-titulo">{item.titulo}</span>
        {item.descricao?.trim() && <span className="pg-item-desc">{item.descricao}</span>}
      </span>
    </a>
  )
}
