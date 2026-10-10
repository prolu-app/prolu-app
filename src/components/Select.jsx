import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck } from './Icons.jsx'
import './Select.css'

// Dropdown próprio (no lugar do <select> nativo). Acessível: abre por clique,
// Enter, espaço ou setas; navega com setas/Home/End; Enter/espaço escolhe; Esc
// e clique fora fecham. A lista vai para um portal em document.body, então
// nunca é cortada por overflow de tabela ou modal.
//
// options: [{ value, label }]; renderOption(opt) personaliza o conteúdo (ex.:
// tag colorida) — usado também no gatilho, salvo se renderValue for passado.
export default function Select({
  value, onChange, options, renderOption, renderValue, placeholder = 'Selecione',
  ariaLabel, className = '', variante = 'campo', disabled = false,
}) {
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [pos, setPos] = useState(null)
  const gatilhoRef = useRef(null)
  const listaRef = useRef(null)
  const id = useId()

  const indiceAtual = options.findIndex(o => o.value === value)
  const atual = indiceAtual >= 0 ? options[indiceAtual] : null
  const conteudo = (opt) => (renderOption ? renderOption(opt) : opt.label)

  const posicionar = useCallback(() => {
    const r = gatilhoRef.current?.getBoundingClientRect()
    if (!r) return
    const alturaMax = 280
    const abaixo = window.innerHeight - r.bottom
    const acima = abaixo < Math.min(alturaMax, options.length * 40 + 12) && r.top > abaixo
    setPos({
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
      minWidth: Math.max(r.width, 180),
      ...(acima ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxHeight: Math.min(alturaMax, (acima ? r.top : abaixo) - 16),
    })
  }, [options.length])

  function abrir(indice = indiceAtual >= 0 ? indiceAtual : 0) {
    if (disabled) return
    posicionar()
    setAtivo(indice)
    setAberto(true)
  }

  function fechar(focarGatilho = true) {
    setAberto(false)
    if (focarGatilho) gatilhoRef.current?.focus()
  }

  function escolher(indice) {
    const opt = options[indice]
    fechar()
    if (opt && opt.value !== value) onChange(opt.value)
  }

  // foco na lista ao abrir; mantém a opção ativa visível
  useLayoutEffect(() => {
    if (aberto) listaRef.current?.focus()
  }, [aberto])
  useEffect(() => {
    if (!aberto || ativo < 0) return
    listaRef.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativo])

  // fecha ao clicar fora; fecha ao rolar a página (a lista ficaria solta)
  useEffect(() => {
    if (!aberto) return
    function fora(e) {
      if (listaRef.current?.contains(e.target) || gatilhoRef.current?.contains(e.target)) return
      fechar(false)
    }
    function rolagem(e) {
      if (listaRef.current?.contains(e.target)) return
      fechar(false)
    }
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', rolagem, true)
    window.addEventListener('resize', posicionar)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', rolagem, true)
      window.removeEventListener('resize', posicionar)
    }
  }, [aberto, posicionar])

  function teclaGatilho(e) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      abrir()
    }
  }

  function teclaLista(e) {
    const n = options.length
    const mover = (i) => { e.preventDefault(); setAtivo(i) }
    switch (e.key) {
      case 'ArrowDown': mover(ativo < n - 1 ? ativo + 1 : ativo); break
      case 'ArrowUp': mover(ativo > 0 ? ativo - 1 : 0); break
      case 'Home': mover(0); break
      case 'End': mover(n - 1); break
      case 'Enter':
      case ' ':
        e.preventDefault()
        escolher(ativo)
        break
      case 'Escape':
        e.preventDefault()
        fechar()
        break
      case 'Tab':
        fechar(false)
        break
      default: return
    }
    // não deixa a tecla chegar em linhas clicáveis/modais por trás (o portal
    // propaga eventos pela árvore do React)
    e.stopPropagation()
  }

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        className={`sel-gatilho sel-${variante}${aberto ? ' aberto' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => { e.stopPropagation(); aberto ? fechar() : abrir() }}
        onKeyDown={teclaGatilho}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? `${id}-lista` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="sel-valor">
          {atual ? (renderValue ? renderValue(atual) : conteudo(atual)) : <span className="sel-placeholder">{placeholder}</span>}
        </span>
        <svg className="sel-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {aberto && pos && createPortal(
        <ul
          ref={listaRef}
          id={`${id}-lista`}
          className="sel-lista"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={ativo >= 0 ? `${id}-op-${ativo}` : undefined}
          onKeyDown={teclaLista}
          onClick={(e) => e.stopPropagation()}
          style={pos}
        >
          {options.map((opt, i) => {
            const selecionado = opt.value === value
            return (
              <li
                key={String(opt.value)}
                id={`${id}-op-${i}`}
                data-indice={i}
                role="option"
                aria-selected={selecionado}
                className={`sel-opcao${i === ativo ? ' ativa' : ''}${selecionado ? ' selecionada' : ''}`}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(i)}
              >
                <span className="sel-opcao-conteudo">{conteudo(opt)}</span>
                {selecionado && <IconCheck className="sel-check" />}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
