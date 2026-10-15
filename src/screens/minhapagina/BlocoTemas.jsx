// Bloco "Tema" de Aparência: seletor compacto de amostras redondas (7 temas
// + "Personalizado"). Cada bolinha é metade cor de fundo, metade cor do botão
// (preenchimento, ou contorno nos temas sem preenchimento). Clicar aplica o
// tema na hora (utils/pagina/temas.js) e mostra um aviso compacto com
// "Desfazer" — que some assim que outra coisa muda, para não desfazer o que
// veio depois.
// "Personalizado" fica marcado quando os valores não batem com nenhum tema.
// Clicar nele com um tema marcado só "desmarca" (nada muda na página): vale
// enquanto o editor está aberto — o tema marcado é calculado pelos valores,
// sem chave no documento.

import { useEffect, useRef, useState } from 'react'
import { TEMAS, aplicarTema, temaDoDoc } from '../../utils/pagina/temas.js'

const DESCRICAO = {
  claro: 'fundo claro, botões de contorno',
  grafite: 'fundo escuro, botões claros',
  terra: 'tons quentes, botões cheios',
  concreto: 'cinza urbano, contorno marcado',
  linho: 'neutros suaves, botões em pílula',
  oliva: 'verdes naturais, botões cheios',
  'editorial-pb': 'preto e branco, título com serifa',
}
export const PERSONALIZADO = 'personalizado'

// o que um clique numa amostra faz: nada (já marcada), desmarcar o tema
// (Personalizado: nada muda na página) ou aplicar o tema
export function acaoDoTema(id, atual) {
  if (id === atual) return 'nada'
  if (id === PERSONALIZADO) return 'desmarcar'
  return 'aplicar'
}

const corDoBotao = t => (t.botao.preenchimento !== 'nenhum' ? t.botao.preenchimento : t.botao.cor_contorno)

// check legível em qualquer cor: traço escuro por baixo, branco por cima
function Check() {
  return (
    <svg className="mpe-swatch-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="rgba(18,18,16,0.85)" strokeWidth="5" />
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#ffffff" strokeWidth="2.4" />
    </svg>
  )
}

// lucide-static 1.57.0 "sliders-horizontal" (ISC — components/minhapagina/icones/LICENCAS.txt)
function IconeAjustes() {
  return (
    <svg className="mpe-swatch-ajustes" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5H3" /><path d="M12 19H3" /><path d="M14 3v4" /><path d="M16 17v4" /><path d="M21 12h-9" />
      <path d="M21 19h-5" /><path d="M21 5h-7" /><path d="M8 10v4" /><path d="M8 12H3" />
    </svg>
  )
}

export default function BlocoTemas({ doc, docNormal, alterarDoc, off }) {
  const porValores = temaDoDoc(docNormal)
  const [desmarcado, setDesmarcado] = useState(null) // tema "zerado" com Personalizado (enquanto os valores não mudam)
  const [desfazer, setDesfazer] = useState(null) // { rotulo, anterior, depois }
  const docRef = useRef(doc)
  docRef.current = doc
  const botoesRef = useRef([])

  // "Personalizado" escolhido continua valendo até os valores mudarem
  const atual = porValores && porValores !== desmarcado ? porValores : PERSONALIZADO
  const opcoes = [...TEMAS.map(t => t.id), PERSONALIZADO]

  useEffect(() => {
    if (desfazer && doc !== desfazer.depois) setDesfazer(null)
  }, [doc, desfazer])
  useEffect(() => {
    if (desmarcado && porValores !== desmarcado) setDesmarcado(null)
  }, [porValores, desmarcado])

  function escolher(id) {
    const acao = off ? 'nada' : acaoDoTema(id, atual)
    if (acao === 'nada') return
    if (acao === 'desmarcar') { setDesmarcado(porValores); return } // nada muda na página
    const tema = TEMAS.find(t => t.id === id)
    const anterior = docRef.current
    const depois = aplicarTema(anterior, tema)
    setDesmarcado(null)
    alterarDoc(() => depois)
    setDesfazer({ rotulo: tema.rotulo, anterior, depois })
  }

  // setas movem o foco entre as amostras (Enter/Espaço aplicam, como botão)
  function teclas(e, i) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    botoesRef.current[(i + passo + opcoes.length) % opcoes.length]?.focus()
  }

  const temaAtual = TEMAS.find(t => t.id === atual)
  return (
    <section className="mpe-bloco mpe-temas" aria-labelledby="mpe-tema">
      <h2 className="mpe-titulo" id="mpe-tema">Tema</h2>
      <p className="mpe-nota mpe-nota-topo">Um clique troca cores, fontes e botões.</p>
      <div className="mpe-swatches" role="radiogroup" aria-label="Tema">
        {opcoes.map((id, i) => {
          const tema = TEMAS.find(t => t.id === id)
          const on = atual === id
          const rotulo = tema ? tema.rotulo : 'Personalizado'
          return (
            <button
              key={id} ref={el => { botoesRef.current[i] = el }}
              type="button" role="radio" aria-checked={on} aria-label={rotulo} data-nome={rotulo}
              tabIndex={on ? 0 : -1} disabled={off}
              className={`mpe-swatch${on ? ' on' : ''}${tema ? '' : ' mpe-swatch--livre'}`}
              onClick={() => escolher(id)} onKeyDown={e => teclas(e, i)}
            >
              <span
                className="mpe-swatch-cor"
                style={tema ? { background: `linear-gradient(135deg, ${tema.fundo} 50%, ${corDoBotao(tema)} 50%)` } : undefined}
              >
                {!tema && <IconeAjustes />}
                {on && tema && <Check />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mpe-tema-nome" aria-live="polite">
        <strong>{temaAtual ? temaAtual.rotulo : 'Personalizado'}</strong>
        {' · '}
        {temaAtual ? DESCRICAO[temaAtual.id] : 'suas próprias escolhas'}
        {!temaAtual && porValores && <span className="mpe-tema-nome-nota"> — cores, fontes e botões continuam os atuais, sem tema</span>}
      </p>
      {desfazer && (
        <div className="mpe-tema-desfazer" role="status">
          Tema {desfazer.rotulo} aplicado.
          <button type="button" className="fm-link-btn" onClick={() => { const { anterior } = desfazer; setDesfazer(null); alterarDoc(() => anterior) }}>
            Desfazer
          </button>
        </div>
      )}
    </section>
  )
}
