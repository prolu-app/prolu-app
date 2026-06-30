import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import './SelectDropdown.css'

export function SelectDropdown({ col, value, onChange, onEditOptions, variant = 'cell' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({})
  const btnRef = useRef(null)

  const opts = col.options || []
  const selected = opts.find(o => o.value === value)

  function openMenu(e) {
    e.stopPropagation()
    const r = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const menuH = Math.min(opts.length * 42 + 60, 320)
    const above = spaceBelow < menuH && r.top > menuH
    setPos({
      left: r.left,
      minWidth: Math.max(r.width, 190),
      ...(above
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    })
    setOpen(true)
  }

  function pick(val) {
    onChange(val)
    setOpen(false)
  }

  return (
    <div className={`sd-wrap sd-${variant}`}>
      <button
        ref={btnRef}
        type="button"
        className={`sd-trigger${open ? ' sd-open' : ''}${!value ? ' sd-empty' : ''}`}
        onClick={openMenu}
      >
        <span className="sd-value">
          {selected
            ? <span className={`pill pill-${selected.color}`}><span className="dot" />{selected.value}</span>
            : <span className="sd-placeholder">—</span>
          }
        </span>
        <svg className="sd-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <>
          <div className="sd-scrim" onClick={() => setOpen(false)} />
          <div className="sd-menu" style={pos}>
            {opts.map(o => (
              <button
                key={o.value}
                type="button"
                className={`sd-item${value === o.value ? ' sd-selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); pick(o.value) }}
              >
                <span className={`pill pill-${o.color}`}><span className="dot" />{o.value}</span>
                {value === o.value && <svg className="sd-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>}
              </button>
            ))}
            {value && (
              <button
                type="button"
                className="sd-item sd-item-muted"
                onMouseDown={e => { e.preventDefault(); pick('') }}
              >
                Limpar seleção
              </button>
            )}
            {col.editableOptions && onEditOptions && (
              <button
                type="button"
                className="sd-item sd-item-edit"
                onMouseDown={e => { e.preventDefault(); setOpen(false); onEditOptions(col) }}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editar lista…
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
