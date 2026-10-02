import { useEffect, useState } from 'react'

// Input que só grava no blur/Enter (e só se mudou) — mesmo padrão dos nomes no CRM/etapas
export default function CampoTextoSalvo({ valor, onSalvar, multilinha, obrigatorio, className, inputRef, ...resto }) {
  const [texto, setTexto] = useState(valor)
  useEffect(() => { setTexto(valor) }, [valor])
  function confirmar() {
    const limpo = texto.trim()
    if (obrigatorio && !limpo) { setTexto(valor); return }
    if (limpo !== (valor || '').trim()) onSalvar(limpo)
  }
  const props = {
    ...resto,
    ref: inputRef,
    className,
    value: texto,
    onChange: e => setTexto(e.target.value),
    onBlur: confirmar,
  }
  return multilinha
    ? <textarea rows={2} {...props} />
    : <input {...props} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setTexto(valor); e.target.blur() } }} />
}
