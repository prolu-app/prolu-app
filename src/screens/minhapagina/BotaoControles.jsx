// Controles de botão da Minha Página v2 (botões da página e estilo próprio de
// um item): preenchimento, contorno e texto independentes, com "Sólido" e
// "Contorno" como atalhos que preenchem esses controles.
// `botao` é o botão efetivo (normalizado); `mudar(patch)` recebe só o que mudou.

import { FmSwitch } from '../Formularios.jsx'
import { Linha, Segmentos } from '../FormularioAparencia.jsx'
import ColorPicker from '../../components/minhapagina/ColorPicker.jsx'

const CONTORNO = [{ value: 0, label: 'Nenhum' }, { value: 1, label: '1px' }, { value: 2, label: '2px' }, { value: 3, label: '3px' }]

// atalhos: Sólido = com preenchimento e sem contorno; Contorno = sem preenchimento e com contorno
export function patchDoAtalho(atalho, b) {
  return atalho === 'solido'
    ? { estilo: 'solido', preenchimento: b.preenchimento !== 'nenhum' ? b.preenchimento : b.cor, contorno: 0 }
    : { estilo: 'contorno', preenchimento: 'nenhum', contorno: b.contorno || 2 }
}

export default function BotaoControles({ botao: b, mudar, off, rotulo = 'botões' }) {
  const semPreenchimento = b.preenchimento === 'nenhum'
  return (
    <>
      <Linha rotulo="Atalhos" dica="Preenchem os controles abaixo; depois dá para ajustar cada um.">
        <div className="mpe-atalhos">
          <button type="button" className="fm-embed-btn" disabled={off} onClick={() => mudar(patchDoAtalho('solido', b))}>Sólido</button>
          <button type="button" className="fm-embed-btn" disabled={off} onClick={() => mudar(patchDoAtalho('contorno', b))}>Contorno</button>
        </div>
      </Linha>
      <Linha rotulo="Preenchimento">
        {!semPreenchimento && (
          <ColorPicker rotulo={`Cor de preenchimento dos ${rotulo}`} valor={b.preenchimento} disabled={off}
            onChange={v => mudar({ preenchimento: v, cor: v })} />
        )}
        <FmSwitch ligado={semPreenchimento} disabled={off} rotulo={`Sem preenchimento nos ${rotulo}`}
          onChange={v => mudar({ preenchimento: v ? 'nenhum' : b.cor })} />
        <span className="fm-status-texto">Sem preenchimento</span>
      </Linha>
      <Linha rotulo="Contorno">
        <Segmentos rotulo={`Espessura do contorno dos ${rotulo}`} valor={b.contorno} opcoes={CONTORNO} disabled={off} onChange={v => mudar({ contorno: v })} />
        {b.contorno > 0 && (
          <ColorPicker rotulo={`Cor do contorno dos ${rotulo}`} valor={b.cor_contorno} disabled={off} onChange={v => mudar({ cor_contorno: v })} />
        )}
      </Linha>
      <Linha rotulo="Texto">
        <ColorPicker rotulo={`Cor do texto dos ${rotulo}`} valor={b.texto} disabled={off} onChange={v => mudar({ texto: v })} />
      </Linha>
    </>
  )
}

// grava o modelo novo inteiro (preenchimento, contorno, cor do contorno e
// texto) a partir do efetivo + o que mudou: dali em diante nada é derivado
export const botaoGravavel = (cru, efetivo, patch) => ({
  ...(cru && typeof cru === 'object' ? cru : {}),
  preenchimento: efetivo.preenchimento, contorno: efetivo.contorno, cor_contorno: efetivo.cor_contorno, texto: efetivo.texto,
  ...patch,
})
