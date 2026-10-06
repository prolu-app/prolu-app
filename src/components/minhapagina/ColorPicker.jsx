// Seletor de cor da Minha Página (react-colorful). Botão com a amostra e o
// hex; ao clicar abre o seletor + campo HEX editável — num popover abaixo do
// campo no computador, numa folha presa à base da tela no celular (≤ 768px).
// Fecha clicando fora / no fundo escuro, ou com Esc.

import { useEffect, useRef, useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import './ColorPicker.css'

const MOBILE = '(max-width: 768px)'
const ehMobile = () => typeof window !== 'undefined' && window.matchMedia?.(MOBILE).matches

export default function ColorPicker({ valor, onChange, disabled, rotulo }) {
  const [aberto, setAberto] = useState(false)
  const [mobile, setMobile] = useState(ehMobile)
  const caixaRef = useRef(null)
  const botaoRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE)
    if (!mq) return
    const mudou = () => setMobile(mq.matches)
    mq.addEventListener('change', mudou)
    return () => mq.removeEventListener('change', mudou)
  }, [])

  // computador: clique fora fecha; Esc fecha nos dois
  useEffect(() => {
    if (!aberto) return
    const fora = e => { if (!mobile && caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false) }
    const esc = e => { if (e.key === 'Escape') { setAberto(false); botaoRef.current?.focus() } }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto, mobile])

  const seletor = (
    <div className="cp-painel" role="dialog" aria-label={rotulo}>
      {mobile && <div className="cp-titulo">{rotulo}</div>}
      <HexColorPicker color={valor} onChange={v => onChange(v.toLowerCase())} />
      <label className="cp-hex">
        <span>HEX</span>
        <HexColorInput color={valor} onChange={v => onChange(v.toLowerCase())} prefixed aria-label={`${rotulo} (hex)`} />
      </label>
      {mobile && <button type="button" className="btn-primary cp-ok" onClick={() => setAberto(false)}>Pronto</button>}
    </div>
  )

  return (
    <div className="cp" ref={caixaRef}>
      <button
        ref={botaoRef} type="button" className={`fm-cor cp-botao${disabled ? ' off' : ''}`} disabled={disabled}
        aria-label={rotulo} aria-expanded={aberto} aria-haspopup="dialog" onClick={() => setAberto(a => !a)}
      >
        <span className="cp-amostra" style={{ background: valor }} />
        <span>{valor.toUpperCase()}</span>
      </button>
      {aberto && (mobile ? (
        <div className="cp-folha-fundo" onClick={e => { if (e.target === e.currentTarget) setAberto(false) }}>
          <div className="cp-folha">{seletor}</div>
        </div>
      ) : (
        <div className="cp-popover">{seletor}</div>
      ))}
    </div>
  )
}
