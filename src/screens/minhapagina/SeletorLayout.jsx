// Seletor de layout de Aparência: 4 wireframes simples (SVG inline, só formas,
// em currentColor nos cinzas do editor — nada do tema da página), proporção
// 3:4. Círculo = foto; barra grossa = nome; barras finas = subtítulo/bio;
// retângulos com contorno = botões. Sem capa (ela só existe no Clássico).
// Setas movem o foco; Enter/Espaço escolhem.

import { useRef } from 'react'
import { LAYOUTS } from '../../components/minhapagina/render/layouts/index.js'

const FUNDO = { fill: 'currentColor', fillOpacity: 0.07 }
const BARRA = { fill: 'currentColor', fillOpacity: 0.32 }
const BARRA_FORTE = { fill: 'currentColor', fillOpacity: 0.5 }
const BOTAO = { fill: 'currentColor', fillOpacity: 0.08, stroke: 'currentColor', strokeOpacity: 0.45, strokeWidth: 0.75 }
const FOTO = { fill: 'currentColor', fillOpacity: 0.3 }
const TRACO = { stroke: 'currentColor', strokeOpacity: 0.3, strokeWidth: 0.6 }
const SETA = { fill: 'none', stroke: 'currentColor', strokeOpacity: 0.5, strokeWidth: 0.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

const WIREFRAMES = {
  classico: (
    <>
      <circle cx="30" cy="14" r="6" {...FOTO} />
      <rect x="18" y="24" width="24" height="3.5" rx="1.2" {...BARRA_FORTE} />
      <rect x="13" y="30.5" width="34" height="2" rx="1" {...BARRA} />
      <rect x="19" y="34.5" width="22" height="2" rx="1" {...BARRA} />
      {[42, 52, 62].map(y => <rect key={y} x="10" y={y} width="40" height="7" rx="2" {...BOTAO} />)}
    </>
  ),
  editorial: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="1" {...FOTO} />
      <rect x="8" y="23" width="36" height="4.5" rx="1.5" {...BARRA_FORTE} />
      <rect x="8" y="29.5" width="24" height="4.5" rx="1.5" {...BARRA_FORTE} />
      <rect x="8" y="37.5" width="40" height="2" rx="1" {...BARRA} />
      <rect x="8" y="41.5" width="28" height="2" rx="1" {...BARRA} />
      {[50, 59, 68].map(y => (
        <g key={y}>
          <rect x="8" y={y} width="26" height="2.5" rx="1" {...BARRA} />
          <path d={`M48.5 ${y - 0.5} l2 1.75 -2 1.75`} {...SETA} />
          <line x1="8" y1={y + 5.5} x2="52" y2={y + 5.5} {...TRACO} />
        </g>
      ))}
    </>
  ),
  quadrados: (
    <>
      <circle cx="30" cy="12" r="5.5" {...FOTO} />
      <rect x="19" y="21" width="22" height="3.5" rx="1.2" {...BARRA_FORTE} />
      <rect x="15" y="27" width="30" height="2" rx="1" {...BARRA} />
      <rect x="9" y="34" width="19.5" height="19.5" rx="2" {...BOTAO} />
      <rect x="31.5" y="34" width="19.5" height="19.5" rx="2" {...BOTAO} />
      <rect x="9" y="56.5" width="42" height="13" rx="2" {...BOTAO} />
    </>
  ),
  cartoes: (
    <>
      <rect x="6" y="6" width="48" height="30" rx="3" fill="currentColor" fillOpacity="0.16" />
      <circle cx="30" cy="15" r="5" {...FOTO} />
      <rect x="20" y="23" width="20" height="3" rx="1.2" {...BARRA_FORTE} />
      <rect x="16" y="29" width="28" height="2" rx="1" {...BARRA} />
      {[42, 59].map(y => (
        <g key={y}>
          <rect x="6" y={y} width="48" height="14" rx="3" {...BOTAO} />
          <rect x="10" y={y + 4} width="24" height="2.5" rx="1" {...BARRA_FORTE} />
          <rect x="10" y={y + 8.5} width="16" height="1.8" rx="0.9" {...BARRA} />
          <circle cx="47.5" cy={y + 7} r="3" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.75" />
        </g>
      ))}
    </>
  ),
}

export function Wireframe({ id }) {
  return (
    <svg className="mpe-wire-svg" viewBox="0 0 60 80" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="60" height="80" {...FUNDO} />
      {WIREFRAMES[id] || WIREFRAMES.classico}
    </svg>
  )
}

export default function SeletorLayout({ atual, off, onEscolher }) {
  const refs = useRef([])
  function teclas(e, i) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    refs.current[(i + passo + LAYOUTS.length) % LAYOUTS.length]?.focus()
  }
  return (
    <div className="mpe-wires" role="radiogroup" aria-label="Layout">
      {LAYOUTS.map((l, i) => {
        const on = atual === l.id
        return (
          <button
            key={l.id} ref={el => { refs.current[i] = el }}
            type="button" role="radio" aria-checked={on} aria-label={l.rotulo} tabIndex={on ? 0 : -1} disabled={off}
            className={`mpe-wire${on ? ' on' : ''}`}
            onClick={() => { if (!on) onEscolher(l.id) }} onKeyDown={e => teclas(e, i)}
          >
            <span className="mpe-wire-mini"><Wireframe id={l.id} /></span>
            <span className="mpe-wire-nome">{l.rotulo}</span>
          </button>
        )
      })}
    </div>
  )
}
