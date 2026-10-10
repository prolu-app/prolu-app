import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useConta } from '../contexts/ContaContext.jsx'
import { IconCheck } from '../components/Icons.jsx'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import { PlanoTag } from '../components/PlanoTag.jsx'
import {
  PLANOS, PLANO_INFO, COMPARATIVO, planoLibera, planoValido, rotuloPlano,
  precoPlano, precoPlanoMes, linkWhatsappComercial,
} from '../utils/planos.js'
import './Planos.css'

const ALTURA_FAIXA = 74

// Página de planos (todos os perfis logados). Upgrade é manual: a barra de
// baixo abre o WhatsApp do Comercial com escritório, plano atual e plano
// escolhido. Clicar no cabeçalho de um plano o escolhe; ?plano=<id> (vindo de
// "Fazer upgrade" nas vitrines) já chega escolhido.
//
// Faixa reduzida: quando o cabeçalho completo da tabela sai da tela, uma faixa
// com tag + preço gruda no topo, com as mesmas larguras de coluna (medidas da
// tabela) e acompanhando a rolagem horizontal. Ela não ocupa espaço no fluxo
// (âncora sticky de altura 0), então aparecer/sumir não mexe no layout.
export default function Planos() {
  const { user } = useAuth()
  const { conta, plano: planoAtual } = useConta()
  const [searchParams] = useSearchParams()
  const pedido = searchParams.get('plano')
  const [escolhido, setEscolhido] = useState(planoValido(pedido) && pedido !== planoAtual ? pedido : null)

  const ancoraRef = useRef(null)
  const wrapRef = useRef(null)
  const linhaCabecalhoRef = useRef(null)
  const [larguras, setLarguras] = useState([])
  const [rolagemX, setRolagemX] = useState(0)
  const [faixaVisivel, setFaixaVisivel] = useState(false)

  const escritorio = conta?.nome || user?.empresa || ''
  const whatsapp = linkWhatsappComercial({ escritorio, planoAtual, planoDesejado: escolhido })

  // larguras reais das colunas do cabeçalho (mudam com a janela)
  useLayoutEffect(() => {
    const linha = linhaCabecalhoRef.current
    if (!linha) return
    const medir = () => setLarguras([...linha.children].map((c) => c.getBoundingClientRect().width))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(linha)
    return () => ro.disconnect()
  }, [])

  // faixa aparece quando o cabeçalho completo passa por baixo dela
  // A âncora (sticky, altura 0) marca onde a faixa fica: quando ela gruda no
  // topo e o cabeçalho completo já passou por baixo dela, a faixa aparece.
  // Mede a posição real (não depende do padding da área de conteúdo).
  useEffect(() => {
    const linha = linhaCabecalhoRef.current
    const ancora = ancoraRef.current
    if (!linha || !ancora) return
    let quadro = 0
    const conferir = () => {
      quadro = 0
      const visivel = linha.getBoundingClientRect().bottom <= ancora.getBoundingClientRect().top + ALTURA_FAIXA
      setFaixaVisivel(visivel)
    }
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(conferir) }
    conferir()
    window.addEventListener('scroll', agendar, true) // captura: a rolagem é do <main>
    window.addEventListener('resize', agendar)
    return () => {
      window.removeEventListener('scroll', agendar, true)
      window.removeEventListener('resize', agendar)
      if (quadro) cancelAnimationFrame(quadro)
    }
  }, [])

  function classeColuna(p) {
    return `${p === planoAtual ? ' pl-atual' : ''}${p === escolhido ? ' pl-escolhido' : ''}`
  }

  return (
    <PageContainer className="pl-pagina">
      <PageHeader
        titulo="Planos"
        descricao={planoAtual
          ? <>{escritorio || 'Seu escritório'} está no plano <strong>{rotuloPlano(planoAtual)}</strong>. Escolha um plano para falar com o Comercial.</>
          : 'Compare os planos do Prolu App e escolha um para falar com o Comercial.'}
      />

      <div className="pl-faixa-ancora" ref={ancoraRef}>
        <div className={`pl-faixa${faixaVisivel ? ' on' : ''}`} aria-hidden="true" style={{ height: ALTURA_FAIXA }}>
          <div className="pl-faixa-primeira" style={{ width: larguras[0] || 0 }} />
          <div className="pl-faixa-clip">
            <div className="pl-faixa-trilho" style={{ transform: `translateX(${-rolagemX}px)` }}>
              {PLANOS.map((p, i) => (
                <div key={p} className={`pl-faixa-cel${classeColuna(p)}`} style={{ width: larguras[i + 1] || 0 }}>
                  <PlanoTag plano={p} />
                  <span className="pl-faixa-preco">{precoPlano(p)}{PLANO_INFO[p].precoMes > 0 && <span className="pl-faixa-mes">/mês</span>}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pl-tabela-wrap" ref={wrapRef} onScroll={(e) => setRolagemX(e.currentTarget.scrollLeft)}>
        <table className="pl-tabela">
          <thead>
            <tr ref={linhaCabecalhoRef}>
              <th className="pl-recurso-col" scope="col"><span className="pl-sr">Recurso</span></th>
              {PLANOS.map((p) => {
                const atual = p === planoAtual
                const marcado = p === escolhido
                return (
                  <th key={p} scope="col" className={`pl-plano${classeColuna(p)}`}>
                    <button
                      type="button"
                      className="pl-plano-card"
                      onClick={() => setEscolhido(marcado ? null : p)}
                      disabled={atual}
                      aria-pressed={atual ? undefined : marcado}
                      aria-label={atual ? `${rotuloPlano(p)}: seu plano atual` : `Escolher o plano ${rotuloPlano(p)}`}
                    >
                      <span className="pl-estado">
                        {atual
                          ? <span className="pl-seu">Seu plano</span>
                          : <>
                              <span className={`pl-radio${marcado ? ' on' : ''}`} aria-hidden="true">{marcado && <IconCheck />}</span>
                              {marcado && <span className="pl-escolhido-txt">Escolhido</span>}
                            </>}
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
            <tbody key={g.grupo} className={g.emBreve ? 'pl-grupo-futuro' : ''}>
              <tr className="pl-grupo">
                <th scope="colgroup" colSpan={PLANOS.length + 1}>
                  <span className="pl-grupo-nome">{g.grupo}{g.emBreve && <span className="pl-chip-breve">em breve</span>}</span>
                </th>
              </tr>
              {g.itens.map((linha) => (
                <tr key={linha.rotulo} className={linha.emBreve ? 'pl-linha-futura' : ''}>
                  <th scope="row" className="pl-recurso-col">{linha.rotulo}</th>
                  {PLANOS.map((p) => {
                    const inclui = planoLibera(p, linha.recurso)
                    return (
                      <td key={p} className={classeColuna(p)}>
                        {!inclui
                          ? <span className="pl-nao" aria-label="Não incluído">—</span>
                          : linha.emBreve
                            ? <span className="pl-chip-breve">em breve</span>
                            : <span className="pl-sim" aria-label="Incluído"><IconCheck /></span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* barra de ação: no fim da página, depois do comparativo */}
      <div className="pl-barra" role="region" aria-label="Falar com o Comercial">
        <div className="pl-barra-texto" aria-live="polite">
          {escolhido ? (
            <>
              <span className="pl-barra-rotulo">Plano escolhido:</span>
              <PlanoTag plano={escolhido} />
              <span className="pl-barra-preco">· {precoPlanoMes(escolhido)}</span>
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
