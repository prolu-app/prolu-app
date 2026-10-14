// Um item da lista da Minha Página v2 no editor: link, formulário ou título
// de seção. Altera o item cru (spread), então chave que o editor não conhece
// é preservada — inclusive estilo.legado e qualquer chave futura.
// Visual (link/formulário): Nada | Ícone (biblioteca, sugerido pelo endereço)
// | Imagem pequena (imagem_modo 'icone') | Imagem grande (imagem_modo 'banner').

import { useEffect, useRef, useState } from 'react'
import { FmSwitch } from '../Formularios.jsx'
import { Linha, Segmentos } from '../FormularioAparencia.jsx'
import ColorPicker from '../../components/minhapagina/ColorPicker.jsx'
import { IconeSvg } from '../../components/minhapagina/render/partes.jsx'
import { ICONES, ICONE_IDS } from '../../components/minhapagina/icones/icones.js'
import { sugerirIcone } from '../../components/minhapagina/icones/sugerir.js'
import { IconChevronDown, IconGrip, IconStar, IconTrash } from '../../components/Icons.jsx'
import { comprimirCapa, comprimirFoto } from '../../utils/comprimirImagem.js'
import { completarUrlLink } from '../../utils/paginaConfig.js'
import { LIMITES, normalizarBotao } from '../../utils/pagina/modelo.js'
import { UploadImagem } from './comum.jsx'

const VISUAIS = [
  { value: 'nada', label: 'Nada' },
  { value: 'icone', label: 'Ícone' },
  { value: 'imagem_pequena', label: 'Imagem pequena' },
  { value: 'imagem_grande', label: 'Imagem grande' },
]
const ESTILO_BOTAO = [{ value: 'solido', label: 'Sólido' }, { value: 'contorno', label: 'Contorno' }]
const CANTOS = [{ value: 'none', label: 'Reto' }, { value: 'sm', label: 'P' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'G' }, { value: 'full', label: 'Pílula' }]

// visual escolhido no editor (imagem_modo sem imagem = modo escolhido, aguardando o envio)
function visualNoEditor(it) {
  if (it.imagem_url || it.imagem_modo) return it.imagem_modo === 'banner' ? 'imagem_grande' : 'imagem_pequena'
  return it.estilo?.icone ? 'icone' : 'nada'
}

const iconePadrao = it => sugerirIcone(it.url) || (it.tipo === 'formulario' ? 'documento' : 'link')

function SeletorIcone({ valor, sugerido, onChange, off, rotulo }) {
  return (
    <div className="mpe-icones" role="radiogroup" aria-label={rotulo}>
      {ICONE_IDS.map(id => (
        <button
          key={id} type="button" role="radio" aria-checked={valor === id} disabled={off}
          className={`mpe-icone${valor === id ? ' on' : ''}${sugerido === id ? ' sugerido' : ''}`}
          title={`${ICONES[id].rotulo}${sugerido === id ? ' (sugerido)' : ''}`} aria-label={ICONES[id].rotulo}
          onClick={() => onChange(id)}
        >
          <IconeSvg id={id} className="mpe-icone-svg" />
        </button>
      ))}
    </div>
  )
}

export default function ItemEditor({
  item, indice, total, formularios, off, empresaId, ehDestaque, botaoPagina, focar, onFocado,
  onMudar, onRemover, onMover, onDestacar, arrastando, sobre, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const tituloRef = useRef(null)
  const [armado, setArmado] = useState(false) // só arrasta pelo puxador
  const [urlTexto, setUrlTexto] = useState(item.url || '')
  const [urlInvalida, setUrlInvalida] = useState(false)
  const [estiloAberto, setEstiloAberto] = useState(false)
  const secao = item.tipo === 'secao'
  const form = item.tipo === 'formulario' ? formularios.find(f => f.id === item.formulario_id) : null
  const visual = visualNoEditor(item)
  const n = indice + 1

  useEffect(() => {
    if (focar && tituloRef.current) { tituloRef.current.focus(); onFocado() }
  }, [focar]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = obj => onMudar(it => ({ ...it, ...obj }))
  const patchEstilo = (obj, extra = {}) => onMudar(it => ({ ...it, ...extra, estilo: { ...(it.estilo || {}), v: 1, ...obj } }))

  function digitarUrl(v) {
    setUrlTexto(v)
    if (!v.trim()) { setUrlInvalida(false); patch({ url: null }); return }
    const url = completarUrlLink(v)
    setUrlInvalida(!url)
    if (!url) return
    // ícone que estava na sugestão acompanha o novo endereço
    const auto = visual === 'icone' && item.estilo?.icone === iconePadrao(item)
    if (auto) patchEstilo({ icone: iconePadrao({ ...item, url }) }, { url })
    else patch({ url })
  }

  function escolherVisual(v) {
    if (v === 'nada') patchEstilo({ icone: null }, { imagem_url: null, imagem_modo: null })
    else if (v === 'icone') patchEstilo({ icone: item.estilo?.icone || iconePadrao(item) }, { imagem_url: null, imagem_modo: null })
    else patchEstilo({ icone: null }, { imagem_modo: v === 'imagem_grande' ? 'banner' : 'icone' })
  }

  const botaoProprio = item.estilo?.botao || null
  const botao = normalizarBotao(botaoProprio || {}, botaoPagina)
  const mudarBotao = obj => patchEstilo({ botao: { ...(botaoProprio || {}), ...obj } })
  function usarEstiloProprio(ligado) {
    if (ligado) { patchEstilo({ botao: { ...botaoPagina } }); setEstiloAberto(true); return }
    onMudar(it => {
      const { botao: _fora, ...resto } = it.estilo || {} // eslint-disable-line no-unused-vars
      return { ...it, estilo: resto }
    })
  }

  const titulo = item.titulo || ''
  const aviso = !titulo.trim() ? (secao ? 'Sem título, a seção não aparece.' : 'Sem título, o link não aparece na página.')
    : item.tipo === 'link' && !urlTexto.trim() ? 'Sem endereço, o link não aparece na página.'
    : item.tipo === 'formulario' && !form ? 'Escolha um formulário.'
    : item.tipo === 'formulario' && !form.ativo ? 'Formulário inativo: o link não aparece na página.'
    : !secao && visual !== 'nada' && visual !== 'icone' && !item.imagem_url ? 'Envie a imagem — sem ela, o link aparece sem imagem.'
    : null

  const podeMover = !off && !ehDestaque
  return (
    <div
      className={['mp-link-card', ehDestaque ? 'mpe-destaque' : '', secao ? 'mpe-secao' : '', arrastando ? 'dragging' : '',
        item.ativo === false ? 'inativo' : '', sobre === 'before' ? 'drag-over-before' : '', sobre === 'after' ? 'drag-over-after' : ''].filter(Boolean).join(' ')}
      draggable={podeMover && armado}
      {...(podeMover ? { onDragStart, onDragOver, onDrop, onDragEnd: e => { setArmado(false); onDragEnd(e) } } : {})}
    >
      {podeMover && (
        <div className="fm-campo-handle">
          <span className="fm-grip" onMouseDown={() => setArmado(true)} onMouseUp={() => setArmado(false)} title="Arraste para reordenar" aria-hidden="true"><IconGrip /></span>
          <button type="button" className="fm-mover" onClick={() => onMover(-1)} disabled={indice === 0} aria-label={`Mover item ${n} para cima`} title="Mover para cima">
            <IconChevronDown style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button type="button" className="fm-mover" onClick={() => onMover(1)} disabled={indice === total - 1} aria-label={`Mover item ${n} para baixo`} title="Mover para baixo">
            <IconChevronDown />
          </button>
        </div>
      )}
      <div className="mp-link-corpo">
        <div className="mp-link-linha">
          {ehDestaque
            ? <span className="mp-link-tipo mpe-selo-destaque">Destaque</span>
            : <span className="mp-link-tipo">{secao ? 'Seção' : item.tipo === 'formulario' ? 'Formulário' : 'Link'}</span>}
          <input
            ref={tituloRef}
            className="fm-label-input mp-link-titulo" value={titulo} disabled={off} maxLength={LIMITES.titulo}
            placeholder={secao ? 'Título da seção' : 'Título do botão'} aria-label={`Título do item ${n}`}
            onChange={e => patch({ titulo: e.target.value })}
          />
        </div>

        {item.tipo === 'link' && (
          <input
            className={`fm-pos-input mp-link-url${urlInvalida ? ' invalido' : ''}`} value={urlTexto} disabled={off}
            placeholder="seusite.com.br, wa.me/55…, mailto:…" aria-label={`Endereço do item ${n}`}
            aria-invalid={urlInvalida || undefined} onChange={e => digitarUrl(e.target.value)}
          />
        )}
        {item.tipo === 'formulario' && (
          <select
            className="fm-tipo mp-link-form" value={item.formulario_id || ''} disabled={off} aria-label={`Formulário do item ${n}`}
            onChange={e => {
              const f = formularios.find(x => x.id === e.target.value)
              patch({ formulario_id: f?.id || null, ...(f && !(item.titulo || '').trim() ? { titulo: f.nome.slice(0, LIMITES.titulo) } : {}) })
            }}
          >
            {!form && <option value="">Escolha um formulário</option>}
            {formularios.map(f => <option key={f.id} value={f.id}>{f.nome}{f.ativo ? '' : ' (inativo)'}</option>)}
          </select>
        )}

        {!secao && (
          <>
            <input
              className="fm-pos-input" value={item.descricao || ''} disabled={off} maxLength={LIMITES.descricao}
              placeholder="Descrição curta (opcional)" aria-label={`Descrição do item ${n}`}
              onChange={e => patch({ descricao: e.target.value })}
            />
            <div className="mpe-visual">
              <span className="mpe-rotulo">Visual</span>
              <Segmentos rotulo={`Visual do item ${n}`} valor={visual} opcoes={VISUAIS} disabled={off} onChange={escolherVisual} />
            </div>
            {visual === 'icone' && (
              <SeletorIcone
                valor={item.estilo?.icone} sugerido={iconePadrao(item)} off={off} rotulo={`Ícone do item ${n}`}
                onChange={id => patchEstilo({ icone: id })}
              />
            )}
            {(visual === 'imagem_pequena' || visual === 'imagem_grande') && (
              <UploadImagem
                url={item.imagem_url} rotulo={`Imagem do item ${n}`} empresaId={empresaId} prefixo="link" off={off}
                comprimir={visual === 'imagem_grande' ? comprimirCapa : comprimirFoto} larga={visual === 'imagem_grande'}
                onMudar={url => patch({ imagem_url: url })}
              />
            )}

            <div className="mpe-item-extras">
              <button
                type="button" className={`fm-link-btn mpe-destacar${ehDestaque ? ' on' : ''}`} disabled={off}
                aria-pressed={ehDestaque} onClick={() => onDestacar(!ehDestaque)}
              >
                <IconStar /> {ehDestaque ? 'Tirar destaque' : 'Destacar'}
              </button>
              <button type="button" className="fm-link-btn" onClick={() => setEstiloAberto(a => !a)} aria-expanded={estiloAberto}>
                Estilo próprio{botaoProprio ? ' (ligado)' : ''}
              </button>
            </div>
            {estiloAberto && (
              <div className="mpe-estilo-proprio">
                <Linha rotulo="Estilo próprio" dica="Desligado = segue os botões da página.">
                  <FmSwitch ligado={!!botaoProprio} disabled={off} rotulo={`Estilo próprio do item ${n}`} onChange={usarEstiloProprio} />
                </Linha>
                {botaoProprio && (
                  <>
                    <Linha rotulo="Estilo">
                      <Segmentos rotulo={`Estilo do botão ${n}`} valor={botao.estilo} opcoes={ESTILO_BOTAO} disabled={off} onChange={v => mudarBotao({ estilo: v })} />
                    </Linha>
                    {botao.estilo === 'solido' ? (
                      <>
                        <Linha rotulo="Cor"><ColorPicker rotulo={`Cor do botão ${n}`} valor={botao.cor} disabled={off} onChange={v => mudarBotao({ cor: v })} /></Linha>
                        <Linha rotulo="Texto"><ColorPicker rotulo={`Cor do texto do botão ${n}`} valor={botao.cor_texto} disabled={off} onChange={v => mudarBotao({ cor_texto: v })} /></Linha>
                      </>
                    ) : (
                      <>
                        <Linha rotulo="Contorno"><ColorPicker rotulo={`Cor do contorno do botão ${n}`} valor={botao.cor_contorno} disabled={off} onChange={v => mudarBotao({ cor_contorno: v })} /></Linha>
                        <Linha rotulo="Texto"><ColorPicker rotulo={`Cor do texto do botão ${n}`} valor={botao.cor_texto_contorno || botao.cor_contorno} disabled={off} onChange={v => mudarBotao({ cor_texto_contorno: v })} /></Linha>
                      </>
                    )}
                    <Linha rotulo="Cantos">
                      <Segmentos rotulo={`Cantos do botão ${n}`} valor={botao.cantos} opcoes={CANTOS} disabled={off} onChange={v => mudarBotao({ cantos: v })} />
                    </Linha>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {urlInvalida && <span className="fm-publico-aviso" role="alert">Endereço inválido: use um site (https://…), mailto: ou tel:.</span>}
        {!urlInvalida && aviso && item.ativo !== false && <span className="fm-publico-aviso">{aviso}</span>}
      </div>
      <div className="mp-link-acoes">
        <FmSwitch ligado={item.ativo !== false} disabled={off} rotulo={item.ativo !== false ? `Ocultar item ${n}` : `Mostrar item ${n}`} onChange={v => patch({ ativo: v })} />
        {!off && (
          <button type="button" className="fm-remover" onClick={onRemover} aria-label={`Excluir item ${n}`} title="Excluir">
            <IconTrash />
          </button>
        )}
      </div>
    </div>
  )
}
