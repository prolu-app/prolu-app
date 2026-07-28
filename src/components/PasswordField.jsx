import { useState } from 'react'
import { IconEye, IconEyeOff } from './Icons.jsx'
import './PasswordField.css'

export function PasswordField({ value, onChange, onKeyDown, placeholder, autoFocus, className = 'modal-input' }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="pw-field">
      <input
        className={className}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        tabIndex={-1}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  )
}
