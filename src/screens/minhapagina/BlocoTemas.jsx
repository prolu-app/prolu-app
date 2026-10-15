// Bloco "Tema" de Aparência: 7 temas prontos com miniatura (dados reais do
// escritório, no layout atual). Aplicar pede confirmação, grava os valores do
// tema no rascunho (utils/pagina/temas.js) e oferece "Desfazer" — que some
// assim que outra coisa muda, para não desfazer o que veio depois. Sem tema
// que bata com os valores atuais: "Personalizado".

import { useEffect, useMemo, useRef, useState } from 'react'
import PaginaRender from '../../components/minhapagina/render/PaginaRender.jsx'
import { TEMAS, aplicarTema, docComTema, temaDoDoc } from '../../utils/pagina/temas.js'

function CartaoTema({ tema, docNormal, empresa, selecionado, off, onEscolher }) {
  const docTema = useMemo(() => docComTema(docNormal, tema), [docNormal, tema])
  return (
    <button
      type="button" role="radio" aria-checked={selecionado} disabled={off}
      className={`mpe-layout mpe-tema${selecionado ? ' on' : ''}`} onClick={() => onEscolher(tema)} aria-label={`Tema ${tema.rotulo}`}
    >
      <span className="mpe-layout-mini" aria-hidden="true">
        <span className="mpe-layout-tela">
          <PaginaRender doc={docTema} selo={false} escritorio={empresa.nome} slug={empresa.slug} modo="previa" alturaTela={700} />
        </span>
      </span>
      <span className="mpe-layout-nome">{tema.rotulo}</span>
    </button>
  )
}

export default function BlocoTemas({ doc, docNormal, alterarDoc, empresa, off }) {
  const atual = temaDoDoc(docNormal)
  const [confirmar, setConfirmar] = useState(null) // tema a aplicar
  const [desfazer, setDesfazer] = useState(null) // { rotulo, anterior, depois }
  const docRef = useRef(doc)
  docRef.current = doc

  // "Desfazer" só enquanto o rascunho for exatamente o que o tema deixou
  useEffect(() => {
    if (desfazer && doc !== desfazer.depois) setDesfazer(null)
  }, [doc, desfazer])

  function aplicar(tema) {
    const anterior = docRef.current
    const depois = aplicarTema(anterior, tema)
    alterarDoc(() => depois)
    setDesfazer({ rotulo: tema.rotulo, anterior, depois })
    setConfirmar(null)
  }

  return (
    <section className="mpe-bloco" aria-labelledby="mpe-tema">
      <h2 className="mpe-titulo" id="mpe-tema">Tema</h2>
      <p className="mpe-nota mpe-nota-topo">
        Um clique troca cores, fontes e botões. Depois dá para ajustar qualquer controle abaixo.
        {!atual && <> Atual: <strong>Personalizado</strong>.</>}
      </p>
      <div className="mpe-layouts" role="radiogroup" aria-labelledby="mpe-tema">
        {TEMAS.map(t => (
          <CartaoTema key={t.id} tema={t} docNormal={docNormal} empresa={empresa} selecionado={atual === t.id} off={off}
            onEscolher={tema => setConfirmar(tema)} />
        ))}
      </div>
      {desfazer && (
        <div className="mpe-tema-desfazer" role="status">
          Tema {desfazer.rotulo} aplicado.
          <button type="button" className="fm-link-btn" onClick={() => { const { anterior } = desfazer; setDesfazer(null); alterarDoc(() => anterior) }}>
            Desfazer
          </button>
        </div>
      )}

      {confirmar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmar(null) }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="mpe-tema-confirmar">
            <div className="modal-title" id="mpe-tema-confirmar">Aplicar o tema {confirmar.rotulo}?</div>
            <p className="fm-confirmar-texto">Isso troca cores, fontes e botões. Seu conteúdo, imagens e layout não mudam.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmar(null)} autoFocus>Cancelar</button>
              <button className="btn-confirm" onClick={() => aplicar(confirmar)}>Aplicar tema</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
