import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { IconSparkle } from './Icons.jsx'
import { PlanoTag } from './PlanoTag.jsx'
import { linkWhatsappCurso, linkUpgradePara } from '../utils/planos.js'
import './BloqueioPlano.css'
import './CursoVitrine.css'

// Botão do convite de um curso sem acesso (migration_052):
//   venda avulsa = Sim → "Comprar este curso" (link) ou "Fale com o Comercial"
//   venda avulsa = Não → upgrade (página de planos, sem "Comprar")
export function BotaoCurso({ curso, escritorio, planoAtual, className = 'btn-primary bp-btn' }) {
  if (curso.venda_avulsa) {
    return (
      <a className={className} href={curso.checkout_url || linkWhatsappCurso({ escritorio, curso: curso.titulo })}
        target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
        {curso.checkout_url ? 'Comprar este curso' : 'Fale com o Comercial'}
      </a>
    )
  }
  return (
    <Link className={className} to={linkUpgradePara(curso.planos, planoAtual)} onClick={e => e.stopPropagation()}>
      Fazer upgrade
    </Link>
  )
}

function DisponivelNosPlanos({ planos }) {
  if (!planos?.length) return <p className="cv-planos">Disponível para compra avulsa.</p>
  return (
    <div className="cv-planos">
      <span>Disponível {planos.length === 1 ? 'no plano' : 'nos planos'}</span>
      <span className="cv-planos-tags">{planos.map(p => <PlanoTag key={p} plano={p} />)}</span>
    </div>
  )
}

// Convite de um curso sem acesso, com a estrela verde das vitrines.
export function ConviteCurso({ curso, escritorio, planoAtual }) {
  return (
    <section className="bp-card cv-card" aria-labelledby={`cv-titulo-${curso.id}`}>
      <span className="bp-tag cv-tag"><IconSparkle aria-hidden="true" /> Curso</span>
      <h2 className="bp-titulo" id={`cv-titulo-${curso.id}`}>{curso.titulo}</h2>
      {curso.descricao && <p className="bp-texto">{curso.descricao}</p>}
      <DisponivelNosPlanos planos={curso.planos} />
      <BotaoCurso curso={curso} escritorio={escritorio} planoAtual={planoAtual} />
    </section>
  )
}

// Conteúdo desfocado, inerte e somente leitura + convite por cima.
// O conteúdo vem só de dados de vitrine (títulos), nunca vídeo/PDF/texto.
export function VitrineCurso({ curso, escritorio, planoAtual, children }) {
  const telaRef = useCallback((el) => { if (el) el.setAttribute('inert', '') }, [])
  return (
    <div className="bp-wrap cv-wrap">
      <div className="bp-tela" ref={telaRef} aria-hidden="true">{children}</div>
      <div className="bp-overlay">
        <ConviteCurso curso={curso} escritorio={escritorio} planoAtual={planoAtual} />
      </div>
    </div>
  )
}

// Aula bloqueada pelo plano DENTRO de um curso que o escritório já tem:
// título legível (mais apagado), checkbox e ícone desfocados, "Disponível nos
// planos X" e upgrade (nunca "Comprar"). Linha não clicável: nada carrega.
export function AulaBloqueada({ aula, planoAtual, Icone }) {
  const telaRef = useCallback((el) => { if (el) el.setAttribute('inert', '') }, [])
  return (
    <div className="lesson-row lesson-row-bloqueada" aria-disabled="true">
      {/* checkbox e ícone: desfocados e inertes; o título fica legível */}
      <div className="lesson-bloq-borrado" ref={telaRef} aria-hidden="true">
        <div className="lesson-check pend" />
        {Icone && <Icone tipo={aula.tipo} />}
      </div>
      <div className="lesson-info lesson-bloq-info">
        <div className="lesson-title lesson-bloq-titulo">{aula.titulo}</div>
      </div>
      <div className="lesson-bloq-convite">
        <IconSparkle aria-hidden="true" />
        <span className="lesson-bloq-texto">
          Disponível {aula.planos.length === 1 ? 'no plano' : 'nos planos'}
        </span>
        <span className="cv-planos-tags">{aula.planos.map(p => <PlanoTag key={p} plano={p} />)}</span>
        <Link className="lesson-bloq-btn" to={linkUpgradePara(aula.planos, planoAtual)}>Fazer upgrade</Link>
      </div>
    </div>
  )
}
