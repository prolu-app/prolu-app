import { createContext, useCallback, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useConta } from '../contexts/ContaContext.jsx'
import { RECURSOS, planoMinimo, rotuloPlano } from '../utils/planos.js'
import './BloqueioPlano.css'

const SomenteLeituraContext = createContext(false)

// true dentro de uma vitrine: a tela não deve gravar nada (nem os "seeds"
// automáticos de primeira abertura). O servidor também recusa (migration_045).
export function useSomenteLeitura() {
  return useContext(SomenteLeituraContext)
}

// Bloqueio como vitrine: com o plano liberando o recurso, renderiza a tela
// normalmente. Sem, renderiza a tela REAL (dados do escritório) desfocada,
// inerte e somente leitura, com um convite para o plano mínimo por cima.
// O menu não muda: quem decide o que aparece é o perfil (AuthContext.acesso).
export default function BloqueioPlano({ recurso, children }) {
  const { planoLibera } = useConta()
  const navigate = useNavigate()

  // `inert` tira a tela do foco por teclado e de leitores de tela; o React 18
  // não conhece o atributo, então é aplicado direto no elemento.
  const telaRef = useCallback((el) => { if (el) el.setAttribute('inert', '') }, [])

  if (planoLibera(recurso)) return children

  const minimo = planoMinimo(recurso)
  const rotulo = rotuloPlano(minimo)
  const info = RECURSOS[recurso]

  return (
    <div className="bp-wrap">
      <div className="bp-tela" ref={telaRef} aria-hidden="true">
        <SomenteLeituraContext.Provider value={true}>
          {children}
        </SomenteLeituraContext.Provider>
      </div>

      <div className="bp-overlay">
        <section className="bp-card" aria-labelledby="bp-titulo">
          <span className="bp-tag">{info?.rotulo}</span>
          <h2 className="bp-titulo" id="bp-titulo">Disponível no plano <em>{rotulo}</em></h2>
          {info?.beneficio && <p className="bp-texto">{info.beneficio}</p>}
          <button className="btn-primary bp-btn" onClick={() => navigate(`/planos?plano=${minimo}`)}>
            Fazer upgrade
          </button>
          <Link className="bp-link" to="/planos">Ver planos</Link>
        </section>
      </div>
    </div>
  )
}

// Aviso pontual para um botão bloqueado pelo plano (ex.: convidar pessoas)
export function AvisoPlano({ recurso }) {
  const minimo = planoMinimo(recurso)
  return (
    <span className="bp-aviso">
      Disponível no plano {rotuloPlano(minimo)} · <Link to={`/planos?plano=${minimo}`}>Ver planos</Link>
    </span>
  )
}
