import { useState } from 'react'

// Confirmação para trocar um endereço público (slug do escritório ou do
// formulário): a pessoa precisa digitar o endereço novo — o botão vermelho só
// libera quando o texto bate exatamente. Mesmo visual dos outros modais.
export default function ConfirmarSlugModal({ titulo, texto, novoSlug, salvando, erro, onConfirmar, onCancelar }) {
  const [digitado, setDigitado] = useState('')
  const bate = digitado === novoSlug

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onCancelar() }}>
      <div className="modal confirmar-slug" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-slug-titulo" aria-describedby="confirmar-slug-texto">
        <div className="modal-title" id="confirmar-slug-titulo">{titulo}</div>
        <p className="confirmar-slug-texto" id="confirmar-slug-texto">{texto}</p>
        <p className="confirmar-slug-novo">Novo endereço: <code>{novoSlug}</code></p>
        <input
          className="modal-input"
          value={digitado}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="Digite o novo endereço para confirmar"
          aria-label="Digite o novo endereço para confirmar"
          onChange={e => setDigitado(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && bate && !salvando) onConfirmar() }}
        />
        {erro && <p className="confirmar-slug-erro" role="alert">{erro}</p>}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancelar} disabled={salvando}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirmar} disabled={!bate || salvando}>
            {salvando ? 'Alterando…' : 'Confirmar alteração'}
          </button>
        </div>
      </div>
    </div>
  )
}
