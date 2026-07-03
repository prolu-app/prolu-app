import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './DatePicker.css'

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function parseISO(s) {
  if (!s) return null
  const parts = s.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDisplay(s) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function todayISO() { return toISO(new Date()) }

export function DatePicker({
  value = '',
  onChange,
  placeholder = 'dd/mm/aaaa',
  className = '',
  disabled = false,
  min,
  max,
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    const d = parseISO(value); return d ? d.getFullYear() : new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseISO(value); return d ? d.getMonth() : new Date().getMonth()
  })
  const [calPos, setCalPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const today = todayISO()

  useEffect(() => {
    const d = parseISO(value)
    if (d) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()) }
  }, [value])

  function openCal() {
    if (disabled) return
    const rect = triggerRef.current.getBoundingClientRect()
    let top = rect.bottom + 6
    let left = rect.left
    if (top + 300 > window.innerHeight) top = rect.top - 306
    if (left + 268 > window.innerWidth) left = Math.max(8, window.innerWidth - 276)
    setCalPos({ top, left })
    setOpen(true)
  }

  function selectDay(day) {
    const iso = toISO(new Date(viewYear, viewMonth, day))
    onChange(iso)
    setOpen(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()

  const cells = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`dp-trigger${open ? ' dp-open' : ''}${disabled ? ' dp-disabled' : ''} ${className}`.trim()}
        onClick={openCal}
        disabled={disabled}
      >
        {value
          ? fmtDisplay(value)
          : <span className="dp-placeholder">{placeholder}</span>
        }
      </button>

      {open && createPortal(
        <>
          <div className="dp-scrim" onClick={() => setOpen(false)} />
          <div
            className="dp-calendar"
            style={{ top: calPos.top, left: calPos.left }}
            onClick={e => e.stopPropagation()}
          >
            <div className="dp-header">
              <button type="button" className="dp-nav" onClick={prevMonth} aria-label="Mês anterior">‹</button>
              <span className="dp-month-label">{MONTHS_PT[viewMonth]} {viewYear}</span>
              <button type="button" className="dp-nav" onClick={nextMonth} aria-label="Próximo mês">›</button>
            </div>
            <div className="dp-grid">
              {WEEKDAYS.map(w => (
                <div key={w} className="dp-weekday">{w}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} />
                const iso = toISO(new Date(viewYear, viewMonth, day))
                const isDisabled = (min && iso < min) || (max && iso > max)
                const isSelected = iso === value
                const isToday = iso === today && !isSelected
                return (
                  <button
                    key={day}
                    type="button"
                    className={`dp-day${isSelected ? ' dp-selected' : ''}${isToday ? ' dp-today' : ''}${isDisabled ? ' dp-day-off' : ''}`}
                    onClick={() => !isDisabled && selectDay(day)}
                    tabIndex={isDisabled ? -1 : 0}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
