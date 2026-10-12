import { useEffect, useRef } from 'react'
import { IconClose } from './Icons.jsx'
import './ComoFuncionaModal.css'

const FOCAVEIS = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Modal "Como funciona" de um serviço (Mentoria/Consultoria) em /planos.
// Textos em utils/planosComoFunciona.js. Fecha pelo X, clique fora e Esc;
// prende o foco enquanto aberto e devolve ao elemento que abriu (quem chama
// guarda a referência e foca de volta em onFechar).
export default function ComoFuncionaModal({ conteudo, whatsappUrl, onFechar }) {
  const caixaRef = useRef(null)
  const id = 'cf-titulo'

  useEffect(() => {
    const caixa = caixaRef.current
    caixa?.querySelector('.cf-fechar')?.focus()
    // a página não rola por baixo do modal
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function teclado(e) {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); return }
      if (e.key !== 'Tab' || !caixa) return
      const itens = [...caixa.querySelectorAll(FOCAVEIS)]
      if (!itens.length) return
      const primeiro = itens[0], ultimo = itens[itens.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
      else if (!caixa.contains(document.activeElement)) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      document.removeEventListener('keydown', teclado)
      document.body.style.overflow = overflowAntes
    }
  }, [onFechar])

  return (
    <div className="modal-overlay cf-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="modal cf-modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={caixaRef}>
        <div className="cf-cabeca">
          <h2 className="modal-title cf-titulo" id={id}>{conteudo.titulo}</h2>
          <button type="button" className="cf-fechar" onClick={onFechar} aria-label="Fechar"><IconClose /></button>
        </div>

        <div className="cf-corpo">
          <p className="cf-resumo">{conteudo.resumo}</p>
          {conteudo.secoes.map(s => (
            <section key={s.titulo} className="cf-secao">
              <h3 className="cf-secao-titulo">{s.titulo}</h3>
              <ul className="cf-lista">
                {s.itens.map(item => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <div className="cf-acoes">
          <a className="btn-primary cf-btn" href={whatsappUrl} target="_blank" rel="noreferrer">Falar com o Comercial</a>
          <a className="cf-pagina" href={conteudo.paginaUrl} target="_blank" rel="noopener">Ver página completa</a>
        </div>
      </div>
    </div>
  )
}
