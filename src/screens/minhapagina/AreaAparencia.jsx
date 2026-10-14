// Área "Aparência" do editor da Minha Página v2: layout, cabeçalho (foto de
// perfil e capa), botões (todos, de uma vez), fundo e texto. Temas prontos
// entram na Fase 2.
// Capa e Hero exigem imagem (sem ela: aviso + envio, sem trocar de estilo em
// silêncio; a publicação fica bloqueada) e não aceitam GIF.

import { FmSwitch } from '../Formularios.jsx'
import { Linha, Segmentos } from '../FormularioAparencia.jsx'
import ColorPicker from '../../components/minhapagina/ColorPicker.jsx'
import FundoSelector from '../../components/minhapagina/FundoSelector.jsx'
import PaginaRender from '../../components/minhapagina/render/PaginaRender.jsx'
import { LAYOUTS } from '../../components/minhapagina/render/layouts/index.js'
import { comprimirCapa, comprimirFoto } from '../../utils/comprimirImagem.js'
import { FONTES_V2 } from '../../utils/pagina/fontes.js'
import { ESCALA } from '../../utils/pagina/tema.js'
import { comCaminho } from '../../utils/pagina/modelo.js'
import { UploadImagem } from './comum.jsx'
import BotaoControles, { botaoGravavel } from './BotaoControles.jsx'

const ESTILOS_CAPA = [{ value: 'nenhuma', label: 'Sem capa' }, { value: 'banner', label: 'Banner' }, { value: 'capa', label: 'Capa' }, { value: 'hero', label: 'Hero' }]
const DICA_CAPA = {
  banner: 'Contida, com margem; a foto fica parcialmente sobre ela. Proporção 3:1 (ex.: 1440×480 px).',
  capa: 'Largura toda da coluna, sem margens. Proporção 3:2 (ex.: 1440×960 px). JPG, PNG ou WEBP.',
  hero: 'Imagem alta com o nome sobre ela. Ex.: 1440×1440 px. JPG, PNG ou WEBP.',
}
const FORMATO_FOTO = [{ value: 'quadrado', label: 'Quadrado' }, { value: 'arredondado', label: 'Arredondado' }, { value: 'redondo', label: 'Redondo' }]
const FOCO = [{ value: 'topo', label: 'Topo' }, { value: 'centro', label: 'Centro' }, { value: 'base', label: 'Base' }]
const CANTOS = [{ value: 'none', label: 'Reto' }, { value: 'sm', label: 'P' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'G' }, { value: 'full', label: 'Pílula' }]
const SOMBRA = [{ value: 'none', label: 'Nenhuma' }, { value: 'soft', label: 'Suave' }, { value: 'strong', label: 'Forte' }, { value: 'hard', label: 'Marcada' }]
const TAMANHOS = [{ value: 'p', label: 'P' }, { value: 'm', label: 'M' }, { value: 'g', label: 'G' }, { value: 'gg', label: 'GG' }]
// títulos de seção seguem o estilo do Subtítulo
const ELEMENTOS = [
  { id: 'titulo', rotulo: 'Título (nome)' },
  { id: 'subtitulo', rotulo: 'Subtítulo', dica: 'Também os títulos de seção.' },
  { id: 'descricao', rotulo: 'Descrição (bio)' },
  { id: 'botoes', rotulo: 'Botões', dica: 'O tamanho ajusta também a altura do botão.' },
]
const pxDe = (el, t) => (el === 'botoes' ? ESCALA.botoes[t].fonte : ESCALA[el][t])

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
  const precisaImagem = capa.estilo !== 'nenhuma' && !capa.imagem
  const grande = capa.estilo === 'capa' || capa.estilo === 'hero'

  // "Sem capa" só desliga a capa: a imagem fica guardada e volta ao escolher
  // outro estilo. Para apagar a imagem, "Remover" no envio da imagem.
  const escolherCapa = estilo => alterar(['capa', 'estilo'], estilo)

  const cfgFundo = Object.fromEntries(Object.entries(FUNDO_CHAVES).map(([antiga, nova]) => [antiga, a.fundo[nova]]))
  const mudarFundo = patch => alterarDoc(d => Object.entries(patch).reduce(
    (acc, [k, v]) => (FUNDO_CHAVES[k] ? comCaminho(acc, ['aparencia', 'fundo', FUNDO_CHAVES[k]], v) : acc), d))
  const mudarBotao = (chave, v) => alterar(['aparencia', 'botao', chave], v)
  // preenchimento/contorno/texto: grava o modelo novo inteiro (nada mais é derivado de Sólido/Contorno)
  const mudarBotaoNovo = patch => alterarDoc(d => comCaminho(d, ['aparencia', 'botao'], botaoGravavel(d.aparencia?.botao, b, patch)))

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

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-cabecalho" id="mpe-capa-bloco">
        <h2 className="mpe-titulo" id="mpe-cabecalho">Cabeçalho</h2>

        <h3 className="mpe-subtitulo-bloco">Foto de perfil</h3>
        <Linha rotulo="Foto" dica="Logo ou foto. Até 10 MB — reduzida no envio.">
          <UploadImagem
            url={docNormal.perfil.foto} rotulo="Foto de perfil" empresaId={empresaId} prefixo="foto" comprimir={comprimirFoto}
            redonda={docNormal.perfil.foto_formato === 'redondo'} off={off} onMudar={v => alterar(['perfil', 'foto'], v)}
          />
        </Linha>
        <Linha rotulo="Formato">
          <Segmentos rotulo="Formato da foto de perfil" valor={docNormal.perfil.foto_formato} opcoes={FORMATO_FOTO} disabled={off} onChange={v => alterar(['perfil', 'foto_formato'], v)} />
        </Linha>
        {capa.estilo === 'hero' && (
          <Linha rotulo="Mostrar foto" dica="No Hero: pequena, sobre a imagem, acima do nome.">
            <FmSwitch ligado={!docNormal.perfil.foto_oculta} disabled={off} rotulo="Mostrar a foto de perfil sobre a capa" onChange={v => alterar(['perfil', 'foto_oculta'], !v)} />
            <span className="fm-status-texto">{docNormal.perfil.foto_oculta ? 'Oculta' : 'Visível'}</span>
          </Linha>
        )}

        <h3 className="mpe-subtitulo-bloco" id="mpe-capa">Capa</h3>
        <Linha rotulo="Estilo" dica={DICA_CAPA[capa.estilo]}>
          <Segmentos rotulo="Estilo da capa" valor={capa.estilo} opcoes={ESTILOS_CAPA} disabled={off} onChange={escolherCapa} />
        </Linha>
        {capa.estilo === 'nenhuma' && capa.imagem && (
          <p className="mpe-nota mpe-nota-topo">A imagem da capa continua guardada. Escolha Banner, Capa ou Hero para usá-la de novo.</p>
        )}
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
          </>
        )}
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-botoes">
        <h2 className="mpe-titulo" id="mpe-botoes">Botões</h2>
        <p className="mpe-nota mpe-nota-topo">Valem para todos os botões. Um item com "Estilo próprio" (em Conteúdo) usa o dele.</p>
        <BotaoControles botao={b} mudar={mudarBotaoNovo} off={off} />
        <Linha rotulo="Cantos">
          <Segmentos rotulo="Cantos dos botões" valor={b.cantos} opcoes={CANTOS} disabled={off} onChange={v => mudarBotao('cantos', v)} />
        </Linha>
        <Linha rotulo="Sombra">
          <Segmentos rotulo="Sombra dos botões" valor={b.sombra} opcoes={SOMBRA} disabled={off} onChange={v => mudarBotao('sombra', v)} />
        </Linha>
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-fundo">
        <h2 className="mpe-titulo" id="mpe-fundo">Fundo</h2>
        <FundoSelector config={cfgFundo} mudar={mudarFundo} off={off} />
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-texto">
        <h2 className="mpe-titulo" id="mpe-texto">Texto</h2>
        <Linha rotulo="Fonte principal" dica="Vale para tudo que não tiver fonte própria abaixo.">
          <select className="fm-tipo mp-fonte" value={a.fonte} disabled={off} aria-label="Fonte principal da página"
            onChange={e => alterar(['aparencia', 'fonte'], e.target.value)}>
            {FONTES_V2.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}
          </select>
        </Linha>
        <details className="mpe-avancado">
          <summary>Por elemento</summary>
          {ELEMENTOS.map(el => (
            <Linha key={el.id} rotulo={el.rotulo} dica={`${el.dica ? el.dica + ' ' : ''}Tamanho ${a.tamanhos[el.id].toUpperCase()} = ${pxDe(el.id, a.tamanhos[el.id])}px.`}>
              <select className="fm-tipo mp-fonte" value={a.fontes[el.id] || ''} disabled={off} aria-label={`Fonte: ${el.rotulo}`}
                onChange={e => alterar(['aparencia', 'fontes', el.id], e.target.value || null)}>
                <option value="">Igual à principal ({a.fonte})</option>
                {FONTES_V2.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}
              </select>
              <Segmentos rotulo={`Tamanho: ${el.rotulo}`} valor={a.tamanhos[el.id]} opcoes={TAMANHOS} disabled={off}
                onChange={v => alterar(['aparencia', 'tamanhos', el.id], v)} />
            </Linha>
          ))}
        </details>
        <Linha rotulo="Cor do nome">
          <ColorPicker rotulo="Cor do nome" valor={a.cor_texto} disabled={off} onChange={v => alterar(['aparencia', 'cor_texto'], v)} />
        </Linha>
        <Linha rotulo="Cor do texto" dica="Subtítulo, bio e títulos de seção.">
          <ColorPicker rotulo="Cor do subtítulo, da bio e das seções" valor={a.cor_texto_suave} disabled={off} onChange={v => alterar(['aparencia', 'cor_texto_suave'], v)} />
        </Linha>
      </section>

    </>
  )
}
