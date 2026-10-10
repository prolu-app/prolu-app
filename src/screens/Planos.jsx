import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useConta } from '../contexts/ContaContext.jsx'
import { IconCheck } from '../components/Icons.jsx'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import { PlanoTag } from '../components/PlanoTag.jsx'
import {
  PLANOS, PLANO_INFO, COMPARATIVO, nivelPlano, planoDaLinha, planoValido, rotuloPlano,
  precoPlano, precoPlanoMes, linkWhatsappComercial,
} from '../utils/planos.js'
import './Planos.css'

// Página de planos (todos os perfis logados). Upgrade é manual: a barra fixa
// abre o WhatsApp do Comercial com escritório, plano atual e plano escolhido.
// Clicar no cabeçalho de um plano o escolhe; ?plano=<id> (vindo de "Fazer
// upgrade" nas vitrines) já chega escolhido.
export default function Planos() {
  const { user } = useAuth()
  const { conta, plano: planoAtual } = useConta()
  const [searchParams] = useSearchParams()
  const pedido = searchParams.get('plano')
  const [escolhido, setEscolhido] = useState(planoValido(pedido) && pedido !== planoAtual ? pedido : null)

  const escritorio = conta?.nome || user?.empresa || ''
  const whatsapp = linkWhatsappComercial({ escritorio, planoAtual, planoDesejado: escolhido })

  function classeColuna(p) {
    return `${p === planoAtual ? ' pl-atual' : ''}${p === escolhido ? ' pl-escolhido' : ''}`
  }

  return (
    <PageContainer>
      <PageHeader
        titulo="Planos"
        descricao={planoAtual
          ? <>{escritorio || 'Seu escritório'} está no plano <strong>{rotuloPlano(planoAtual)}</strong>. Escolha um plano para falar com o Comercial.</>
          : 'Compare os planos do Prolu App e escolha um para falar com o Comercial.'}
      />

      <div className="pl-tabela-wrap">
        <table className="pl-tabela">
          <thead>
            <tr>
              <th className="pl-recurso-col" scope="col"><span className="pl-sr">Recurso</span></th>
              {PLANOS.map((p) => {
                const atual = p === planoAtual
                return (
                  <th key={p} scope="col" className={`pl-plano${classeColuna(p)}`}>
                    <button
                      type="button"
                      className="pl-plano-card"
                      onClick={() => setEscolhido(escolhido === p ? null : p)}
                      disabled={atual}
                      aria-pressed={atual ? undefined : escolhido === p}
                      aria-label={atual ? `${rotuloPlano(p)}: seu plano atual` : `Escolher o plano ${rotuloPlano(p)}`}
                    >
                      <span className="pl-marca">
                        {atual ? 'Seu plano' : escolhido === p ? <><IconCheck /> Escolhido</> : 'Escolher'}
                      </span>
                      <PlanoTag plano={p} tamanho="grande" />
                      <span className="pl-preco">
                        <strong>{precoPlano(p)}</strong>
                        {PLANO_INFO[p].precoMes > 0 && <span>/mês</span>}
                      </span>
                      <span className="pl-desc">{PLANO_INFO[p].descricao}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          {COMPARATIVO.map((g) => (
            <tbody key={g.grupo}>
              <tr className="pl-grupo">
                <th scope="colgroup" colSpan={PLANOS.length + 1}>
                  <span className="pl-grupo-nome">{g.grupo}{g.emBreve && <span className="pl-em-breve">em breve</span>}</span>
                </th>
              </tr>
              {g.itens.map((linha) => {
                const minimo = linha.emBreve ? null : planoDaLinha(linha)
                return (
                  <tr key={linha.rotulo}>
                    <th scope="row" className="pl-recurso-col">{linha.rotulo}</th>
                    {PLANOS.map((p) => (
                      <td key={p} className={classeColuna(p)}>
                        {linha.emBreve
                          ? <span className="pl-breve" aria-label="Em breve">em breve</span>
                          : nivelPlano(p) >= nivelPlano(minimo)
                            ? <span className="pl-sim" aria-label="Incluído"><IconCheck /></span>
                            : <span className="pl-nao" aria-label="Não incluído">—</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>

      {/* barra fixa: sempre no mesmo lugar e com a mesma altura */}
      <div className="pl-barra" role="region" aria-label="Falar com o Comercial">
        <div className="pl-barra-texto" aria-live="polite">
          {escolhido ? (
            <>
              <span className="pl-barra-rotulo">Plano escolhido:</span>
              <PlanoTag plano={escolhido} />
              <span className="pl-barra-preco">— {precoPlanoMes(escolhido)}</span>
            </>
          ) : (
            <span className="pl-barra-rotulo">Quer mudar de plano? Fale com o Comercial.</span>
          )}
        </div>
        <a className="btn-primary pl-barra-btn" href={whatsapp} target="_blank" rel="noreferrer">
          Falar com o Comercial
        </a>
      </div>
    </PageContainer>
  )
}
