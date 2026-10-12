import { Fragment, useEffect, useRef } from 'react'
import { IconAgente, IconCalendar, IconCheck, IconClientes, IconClose, IconCRM, IconDashboard, IconIndicadores, IconMoney, IconPlay, IconSparkle, IconTarget } from './Icons.jsx'
import { PlanoTag } from './PlanoTag.jsx'
import './ComoFuncionaModal.css'

const FOCAVEIS = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

// nomes usados em utils/planosComoFunciona.js → ícones do app (Icons.jsx)
const ICONES = {
  calendario: IconCalendar,
  pessoas: IconClientes,
  play: IconPlay,
  dinheiro: IconMoney,
  agente: IconAgente,
  crm: IconCRM,
  alvo: IconTarget,
  indicadores: IconIndicadores,
  grafico: IconDashboard,
  sparkle: IconSparkle,
}

// cor dos números dos destaques: a do plano, sempre com contraste AA no branco
const ACENTO = { mentoria: '#734e00', consultoria: 'var(--green-ink)' }

// **negrito** dentro dos textos do arquivo de conteúdo
function Rico({ texto }) {
  const partes = String(texto || '').split(/\*\*(.+?)\*\*/g)
  return partes.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))
}

// Modal "Como funciona" de um serviço (Mentoria/Consultoria) em /planos.
// Textos em utils/planosComoFunciona.js. Fecha pelo X, clique fora e Esc;
// prende o foco enquanto aberto; quem chama devolve o foco em onFechar.
export default function ComoFuncionaModal({ plano, conteudo, whatsappUrl, onFechar }) {
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
      if (!caixa.contains(document.activeElement)) { e.preventDefault(); primeiro.focus() }
      else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      document.removeEventListener('keydown', teclado)
      document.body.style.overflow = overflowAntes
    }
  }, [onFechar])

  const { destaques = [], passos, cartoes, paraQuem = [] } = conteudo

  return (
    <div className="modal-overlay cf-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="modal cf-modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={caixaRef}
        style={{ '--cf-acento': ACENTO[plano] || 'var(--ink)' }}>
        <header className="cf-cabeca">
          <div className="cf-cabeca-txt">
            <PlanoTag plano={plano} />
            <h2 className="modal-title cf-titulo" id={id}>{conteudo.titulo}</h2>
          </div>
          <button type="button" className="cf-fechar" onClick={onFechar} aria-label="Fechar"><IconClose /></button>
        </header>

        <div className="cf-corpo">
          {conteudo.resumo && <p className="cf-resumo"><Rico texto={conteudo.resumo} /></p>}

          {destaques.length > 0 && (
            <ul className={`cf-destaques cf-destaques-${Math.min(destaques.length, 4)}`} aria-label="Destaques">
              {destaques.map(d => (
                <li key={d.valor} className="cf-destaque">
                  <span className="cf-destaque-valor">{d.valor}</span>
                  <span className="cf-destaque-rotulo">{d.rotulo}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="cf-grade">
            {passos?.itens?.length > 0 && (
              <section className="cf-bloco cf-area-passos" aria-labelledby="cf-passos">
                <h3 className="cf-bloco-titulo" id="cf-passos">{passos.titulo}</h3>
                <ol className="cf-passos">
                  {passos.itens.map((p, i) => (
                    <li key={p.titulo} className="cf-passo">
                      <span className="cf-passo-num" aria-hidden="true">{i + 1}</span>
                      <span className="cf-passo-txt"><strong>{p.titulo}</strong> <Rico texto={p.texto} /></span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {cartoes?.itens?.length > 0 && (
              <section className="cf-bloco cf-area-cartoes" aria-labelledby="cf-cartoes">
                <h3 className="cf-bloco-titulo" id="cf-cartoes">{cartoes.titulo}</h3>
                <ul className="cf-cartoes">
                  {cartoes.itens.map(c => {
                    const Icone = ICONES[c.icone] || IconCheck
                    return (
                      <li key={c.titulo} className="cf-cartao">
                        <span className="cf-cartao-icone" aria-hidden="true"><Icone /></span>
                        <span className="cf-cartao-txt">
                          <span className="cf-cartao-titulo">{c.titulo}</span>
                          {c.texto && <span className="cf-cartao-texto"><Rico texto={c.texto} /></span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {paraQuem.length > 0 && (
              <section className="cf-bloco cf-area-para" aria-labelledby="cf-para">
                <h3 className="cf-bloco-titulo" id="cf-para">Para quem é</h3>
                <ul className="cf-para">
                  {paraQuem.map(t => (
                    <li key={t}><span className="cf-para-check" aria-hidden="true"><IconCheck /></span><span><Rico texto={t} /></span></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <footer className="cf-acoes">
          <a className="cf-pagina" href={conteudo.paginaUrl} target="_blank" rel="noopener">Ver página completa</a>
          <a className="btn-primary cf-btn" href={whatsappUrl} target="_blank" rel="noreferrer">Falar com o Comercial</a>
        </footer>
      </div>
    </div>
  )
}
