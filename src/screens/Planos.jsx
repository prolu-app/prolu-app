import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useConta } from '../contexts/ContaContext.jsx'
import { IconCheck } from '../components/Icons.jsx'
import {
  PLANOS, PLANO_INFO, COMPARATIVO, nivelPlano, planoDaLinha, planoValido, rotuloPlano, linkWhatsappComercial,
} from '../utils/planos.js'
import './Planos.css'

// Página de planos (todos os perfis logados). Upgrade é manual: o CTA abre o
// WhatsApp do Comercial com escritório, plano atual e plano desejado.
// ?plano=<id> chega das vitrines ("Fazer upgrade") e já destaca o plano.
export default function Planos() {
  const { user } = useAuth()
  const { conta, plano: planoAtual } = useConta()
  const [searchParams] = useSearchParams()
  const pedido = searchParams.get('plano')
  const [desejado, setDesejado] = useState(planoValido(pedido) && pedido !== planoAtual ? pedido : null)
  const ctaRef = useRef(null)

  const escritorio = conta?.nome || user?.empresa || ''
  const whatsapp = linkWhatsappComercial({ escritorio, planoAtual, planoDesejado: desejado })

  function escolher(p) {
    setDesejado(p)
    ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function classeColuna(p) {
    return `${p === planoAtual ? ' pl-atual' : ''}${p === desejado ? ' pl-desejado' : ''}`
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Planos</div>
        <div className="page-sub">
          {planoAtual
            ? <>{escritorio || 'Seu escritório'} está no plano <strong>{rotuloPlano(planoAtual)}</strong>.</>
            : 'Compare os planos do Prolu App.'}
        </div>
      </div>

      <div className="pl-tabela-wrap">
        <table className="pl-tabela">
          <thead>
            <tr>
              <th className="pl-recurso-col" scope="col"><span className="pl-sr">Recurso</span></th>
              {PLANOS.map((p) => (
                <th key={p} scope="col" className={`pl-plano${classeColuna(p)}`}>
                  {p === planoAtual && <span className="pl-badge">Seu plano</span>}
                  {p !== planoAtual && p === desejado && <span className="pl-badge pl-badge-desejado">Escolhido</span>}
                  <div className="pl-nome">{PLANO_INFO[p].rotulo}</div>
                  <div className="pl-preco">{PLANO_INFO[p].preco || 'Fale com o Comercial'}</div>
                  <p className="pl-desc">{PLANO_INFO[p].descricao}</p>
                  {p !== planoAtual && nivelPlano(p) > nivelPlano(planoAtual) && (
                    <button
                      className={p === desejado ? 'btn-primary pl-escolher' : 'btn-cancel pl-escolher'}
                      onClick={() => escolher(p)}
                    >
                      {p === desejado ? 'Escolhido' : 'Quero este'}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARATIVO.map((linha) => {
              const minimo = planoDaLinha(linha)
              return (
                <tr key={linha.rotulo}>
                  <th scope="row" className="pl-recurso-col">{linha.rotulo}</th>
                  {PLANOS.map((p) => (
                    <td key={p} className={classeColuna(p)}>
                      {nivelPlano(p) >= nivelPlano(minimo)
                        ? <span className="pl-sim" aria-label="Incluído"><IconCheck /></span>
                        : <span className="pl-nao" aria-label="Não incluído">—</span>}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section className="card pl-cta" ref={ctaRef}>
        <div>
          <h2 className="pl-cta-titulo">
            {desejado ? <>Quero o plano <em>{rotuloPlano(desejado)}</em></> : 'Quer mudar de plano?'}
          </h2>
          <p className="pl-cta-texto">
            Fale com o Comercial pelo WhatsApp. A gente tira suas dúvidas, envia o link de pagamento e ativa o novo plano no seu escritório.
          </p>
        </div>
        <a className="btn-primary pl-cta-btn" href={whatsapp} target="_blank" rel="noreferrer">
          Fale com o Comercial
        </a>
      </section>
    </>
  )
}
