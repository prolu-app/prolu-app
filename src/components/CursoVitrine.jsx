import { useCallback } from 'react'
import { IconSparkle } from './Icons.jsx'
import { PlanoTag } from './PlanoTag.jsx'
import { linkWhatsappCurso } from '../utils/planos.js'
import './BloqueioPlano.css'
import './CursoVitrine.css'

// Convite de um curso sem acesso (Passo 3B): "Disponível nos planos X" +
// "Comprar este curso" (checkout_url) ou "Fale com o Comercial" (WhatsApp).
// Mesmo cartão das vitrines de plano (BloqueioPlano.css), com a estrela verde.
export function ConviteCurso({ curso, escritorio }) {
  const planos = curso.planos || []
  return (
    <section className="bp-card cv-card" aria-labelledby={`cv-titulo-${curso.id}`}>
      <span className="bp-tag cv-tag"><IconSparkle aria-hidden="true" /> Curso</span>
      <h2 className="bp-titulo" id={`cv-titulo-${curso.id}`}>{curso.titulo}</h2>
      {curso.descricao && <p className="bp-texto">{curso.descricao}</p>}
      {planos.length > 0 ? (
        <div className="cv-planos">
          <span>Disponível {planos.length === 1 ? 'no plano' : 'nos planos'}</span>
          <span className="cv-planos-tags">{planos.map(p => <PlanoTag key={p} plano={p} />)}</span>
        </div>
      ) : (
        <p className="cv-planos">Disponível para compra avulsa.</p>
      )}
      {curso.checkout_url ? (
        <a className="btn-primary bp-btn" href={curso.checkout_url} target="_blank" rel="noreferrer">Comprar este curso</a>
      ) : (
        <a className="btn-primary bp-btn" href={linkWhatsappCurso({ escritorio, curso: curso.titulo })} target="_blank" rel="noreferrer">
          Fale com o Comercial
        </a>
      )}
    </section>
  )
}

// Conteúdo real desfocado, inerte e somente leitura + convite por cima.
// O conteúdo vem só de dados de vitrine (títulos), nunca vídeo/PDF/texto.
export function VitrineCurso({ curso, escritorio, children }) {
  const telaRef = useCallback((el) => { if (el) el.setAttribute('inert', '') }, [])
  return (
    <div className="bp-wrap cv-wrap">
      <div className="bp-tela" ref={telaRef} aria-hidden="true">{children}</div>
      <div className="bp-overlay">
        <ConviteCurso curso={curso} escritorio={escritorio} />
      </div>
    </div>
  )
}
