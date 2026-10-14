// Área "Aparência" do editor da Minha Página v2: layout, capa, botões,
// fundo e texto. Tema e fontes por pacote entram na Fase 2.
// Capa e Hero exigem imagem (sem ela: aviso + envio, sem trocar de estilo em
// silêncio; a publicação fica bloqueada) e não aceitam GIF.

import { useState } from 'react'
import { FmSwitch } from '../Formularios.jsx'
import { Linha, Segmentos } from '../FormularioAparencia.jsx'
import ColorPicker from '../../components/minhapagina/ColorPicker.jsx'
import FundoSelector from '../../components/minhapagina/FundoSelector.jsx'
import PaginaRender from '../../components/minhapagina/render/PaginaRender.jsx'
import { LAYOUTS } from '../../components/minhapagina/render/layouts/index.js'
import { comprimirCapa } from '../../utils/comprimirImagem.js'
import { FONTES } from '../../utils/paginaConfig.js'
import { comCaminho } from '../../utils/pagina/modelo.js'
import { UploadImagem } from './comum.jsx'

const ESTILOS_CAPA = [{ value: 'nenhuma', label: 'Sem capa' }, { value: 'banner', label: 'Banner' }, { value: 'capa', label: 'Capa' }, { value: 'hero', label: 'Hero' }]
const DICA_CAPA = {
  banner: 'Contida, com margem; a foto fica parcialmente sobre ela. Proporção 3:1 (ex.: 1440×480 px).',
  capa: 'Largura toda da coluna, sem margens. Proporção 3:2 (ex.: 1440×960 px). JPG, PNG ou WEBP.',
  hero: 'Alta (cerca de metade da tela no celular), foto pequena logo abaixo. Ex.: 1440×1440 px. JPG, PNG ou WEBP.',
}
const FOCO = [{ value: 'topo', label: 'Topo' }, { value: 'centro', label: 'Centro' }, { value: 'base', label: 'Base' }]
const ESTILO_BOTAO = [{ value: 'solido', label: 'Sólido' }, { value: 'contorno', label: 'Contorno' }]
const CANTOS = [{ value: 'none', label: 'Reto' }, { value: 'sm', label: 'P' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'G' }, { value: 'full', label: 'Pílula' }]
const SOMBRA = [{ value: 'none', label: 'Nenhuma' }, { value: 'soft', label: 'Suave' }, { value: 'strong', label: 'Forte' }, { value: 'hard', label: 'Marcada' }]
const ESPESSURA = [{ value: 1, label: '1px' }, { value: 2, label: '2px' }, { value: 3, label: '3px' }]

// FundoSelector fala as chaves antigas (fundo_*): tradução para aparencia.fundo
const FUNDO_CHAVES = {
  fundo_tipo: 'tipo', fundo_cor: 'cor', fundo_pattern: 'pattern', fundo_pattern_cor: 'pattern_cor',
  fundo_pattern_opacity: 'pattern_opacidade', fundo_imagem: 'imagem', fundo_imagem_opacity: 'imagem_opacidade',
}

export const gifNaCapa = capa => (capa.estilo === 'capa' || capa.estilo === 'hero') && /\.gif($|\?)/i.test(capa.imagem || '')

function CartaoLayout({ layout, atual, docNormal, empresa, off, onEscolher }) {
  const on = atual === layout.id
  return (
    <button
      type="button" role="radio" aria-checked={on} disabled={off || !layout.disponivel}
      className={`mpe-layout${on ? ' on' : ''}${layout.disponivel ? '' : ' em-breve'}`}
      onClick={() => onEscolher(layout.id)} aria-label={layout.disponivel ? layout.rotulo : `${layout.rotulo} (em breve)`}
    >
      <span className="mpe-layout-mini" aria-hidden="true">
        {layout.disponivel
          ? <span className="mpe-layout-tela"><PaginaRender doc={{ ...docNormal, layout: layout.id }} selo={false} escritorio={empresa.nome} slug={empresa.slug} modo="previa" alturaTela={700} /></span>
          : <span className="mpe-layout-breve">Em breve</span>}
      </span>
      <span className="mpe-layout-nome">{layout.rotulo}</span>
    </button>
  )
}

export default function AreaAparencia({ doc, docNormal, alterar, alterarDoc, empresa, empresaId, off }) {
  const { capa } = docNormal
  const a = docNormal.aparencia
  const b = a.botao
  const [confirmarSemCapa, setConfirmarSemCapa] = useState(false)
  const precisaImagem = capa.estilo !== 'nenhuma' && !capa.imagem
  const grande = capa.estilo === 'capa' || capa.estilo === 'hero'

  function escolherCapa(estilo) {
    if (estilo === 'nenhuma') {
      if (capa.imagem) setConfirmarSemCapa(true)
      else alterar(['capa', 'estilo'], 'nenhuma')
      return
    }
    alterar(['capa', 'estilo'], estilo)
  }
  const removerCapa = () => alterarDoc(d => comCaminho(comCaminho(d, ['capa', 'estilo'], 'nenhuma'), ['capa', 'imagem'], null))

  const cfgFundo = Object.fromEntries(Object.entries(FUNDO_CHAVES).map(([antiga, nova]) => [antiga, a.fundo[nova]]))
  const mudarFundo = patch => alterarDoc(d => Object.entries(patch).reduce(
    (acc, [k, v]) => (FUNDO_CHAVES[k] ? comCaminho(acc, ['aparencia', 'fundo', FUNDO_CHAVES[k]], v) : acc), d))
  const mudarBotao = (chave, v) => alterar(['aparencia', 'botao', chave], v)
  const corDestaqueAuto = !doc.aparencia?.cor_destaque

  return (
    <>
      <section className="mpe-bloco" aria-labelledby="mpe-layout">
        <h2 className="mpe-titulo" id="mpe-layout">Layout</h2>
        <div className="mpe-layouts" role="radiogroup" aria-labelledby="mpe-layout">
          {LAYOUTS.map(l => (
            <CartaoLayout key={l.id} layout={l} atual={docNormal.layout} docNormal={docNormal} empresa={empresa} off={off}
              onEscolher={id => alterar(['layout'], id)} />
          ))}
        </div>
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-capa" id="mpe-capa-bloco">
        <h2 className="mpe-titulo" id="mpe-capa">Capa</h2>
        <Linha rotulo="Estilo" dica={DICA_CAPA[capa.estilo]}>
          <Segmentos rotulo="Estilo da capa" valor={capa.estilo} opcoes={ESTILOS_CAPA} disabled={off} onChange={escolherCapa} />
        </Linha>
        {capa.estilo !== 'nenhuma' && (
          <>
            {precisaImagem && <p className="mpe-aviso" role="status">Este estilo precisa de uma imagem. Envie abaixo — sem ela, a página não pode ser publicada.</p>}
            {gifNaCapa(capa) && <p className="mpe-aviso" role="status">GIF não é aceito em Capa e Hero. Envie uma imagem JPG, PNG ou WEBP.</p>}
            <Linha rotulo="Imagem">
              <UploadImagem
                url={capa.imagem} rotulo="Imagem da capa" empresaId={empresaId} prefixo="capa" larga off={off} semGif={grande}
                comprimir={grande ? f => comprimirCapa(f, { ladoMax: 1440 }) : comprimirCapa}
                onMudar={v => alterar(['capa', 'imagem'], v)}
              />
            </Linha>
            <Linha rotulo="Ponto de foco" dica="Que parte da imagem fica visível quando ela é cortada.">
              <Segmentos rotulo="Ponto de foco da capa" valor={capa.foco} opcoes={FOCO} disabled={off} onChange={v => alterar(['capa', 'foco'], v)} />
            </Linha>
            {capa.estilo === 'hero' && (
              <Linha rotulo="Foto de perfil">
                <FmSwitch ligado={!docNormal.perfil.foto_oculta} disabled={off} rotulo="Mostrar a foto de perfil abaixo da capa" onChange={v => alterar(['perfil', 'foto_oculta'], !v)} />
                <span className="fm-status-texto">Mostrar abaixo da capa</span>
              </Linha>
            )}
          </>
        )}
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-botoes">
        <h2 className="mpe-titulo" id="mpe-botoes">Botões</h2>
        <Linha rotulo="Estilo">
          <Segmentos rotulo="Estilo dos botões" valor={b.estilo} opcoes={ESTILO_BOTAO} disabled={off} onChange={v => mudarBotao('estilo', v)} />
        </Linha>
        {b.estilo === 'solido' ? (
          <>
            <Linha rotulo="Cor do botão"><ColorPicker rotulo="Cor dos botões" valor={b.cor} disabled={off} onChange={v => mudarBotao('cor', v)} /></Linha>
            <Linha rotulo="Cor do texto"><ColorPicker rotulo="Cor do texto dos botões" valor={b.cor_texto} disabled={off} onChange={v => mudarBotao('cor_texto', v)} /></Linha>
          </>
        ) : (
          <>
            <Linha rotulo="Cor do contorno"><ColorPicker rotulo="Cor do contorno dos botões" valor={b.cor_contorno} disabled={off} onChange={v => mudarBotao('cor_contorno', v)} /></Linha>
            <Linha rotulo="Cor do texto"><ColorPicker rotulo="Cor do texto dos botões com contorno" valor={b.cor_texto_contorno || b.cor_contorno} disabled={off} onChange={v => mudarBotao('cor_texto_contorno', v)} /></Linha>
          </>
        )}
        <Linha rotulo="Cor do destaque" dica={corDestaqueAuto ? 'Automática: a cor dos botões.' : undefined}>
          <FmSwitch ligado={corDestaqueAuto} disabled={off} rotulo="Cor do destaque automática"
            onChange={v => alterar(['aparencia', 'cor_destaque'], v ? null : (b.estilo === 'contorno' ? b.cor_contorno : b.cor))} />
          <span className="fm-status-texto">Automática</span>
          {!corDestaqueAuto && <ColorPicker rotulo="Cor do botão em destaque" valor={a.cor_destaque || b.cor} disabled={off} onChange={v => alterar(['aparencia', 'cor_destaque'], v)} />}
        </Linha>
        <details className="mpe-avancado">
          <summary>Avançado</summary>
          <Linha rotulo="Cantos">
            <Segmentos rotulo="Cantos dos botões" valor={b.cantos} opcoes={CANTOS} disabled={off} onChange={v => mudarBotao('cantos', v)} />
          </Linha>
          {b.estilo === 'contorno' && (
            <Linha rotulo="Espessura do contorno">
              <Segmentos rotulo="Espessura do contorno" valor={b.espessura_contorno} opcoes={ESPESSURA} disabled={off} onChange={v => mudarBotao('espessura_contorno', v)} />
            </Linha>
          )}
          <Linha rotulo="Sombra">
            <Segmentos rotulo="Sombra dos botões" valor={b.sombra} opcoes={SOMBRA} disabled={off} onChange={v => mudarBotao('sombra', v)} />
          </Linha>
        </details>
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-fundo">
        <h2 className="mpe-titulo" id="mpe-fundo">Fundo</h2>
        <FundoSelector config={cfgFundo} mudar={mudarFundo} off={off} />
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-texto">
        <h2 className="mpe-titulo" id="mpe-texto">Texto</h2>
        <Linha rotulo="Fonte">
          <select className="fm-tipo mp-fonte" value={a.fonte_titulo} disabled={off} aria-label="Fonte da página"
            onChange={e => alterarDoc(d => comCaminho(comCaminho(d, ['aparencia', 'fonte_titulo'], e.target.value), ['aparencia', 'fonte_corpo'], e.target.value))}>
            {FONTES.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Cor do nome">
          <ColorPicker rotulo="Cor do nome" valor={a.cor_texto} disabled={off} onChange={v => alterar(['aparencia', 'cor_texto'], v)} />
        </Linha>
        <Linha rotulo="Cor do texto" dica="Subtítulo, bio e títulos de seção.">
          <ColorPicker rotulo="Cor do subtítulo, da bio e das seções" valor={a.cor_texto_suave} disabled={off} onChange={v => alterar(['aparencia', 'cor_texto_suave'], v)} />
        </Linha>
      </section>

      {confirmarSemCapa && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmarSemCapa(false) }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="mpe-semcapa-titulo">
            <div className="modal-title" id="mpe-semcapa-titulo">Remover a capa?</div>
            <p className="fm-confirmar-texto">A imagem da capa sai do rascunho. A página publicada só muda quando você publicar.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmarSemCapa(false)} autoFocus>Cancelar</button>
              <button className="btn-danger" onClick={() => { removerCapa(); setConfirmarSemCapa(false) }}>Remover capa</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
