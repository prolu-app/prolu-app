import { useEffect, useRef, useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import CampoTextoSalvo from '../components/CampoTextoSalvo.jsx'
import { FmSwitch } from './Formularios.jsx'
import { supabase } from '../services/supabaseClient.js'
import {
  ESTILO_PADRAO, RAIO_MAX, BOTAO_TEXTO_MAX, BOTAO_TEXTO_PADRAO, normalizarEstilo, estiloParaPagina, textoDoBotao,
  SUCESSO_TITULO_PADRAO, URL_REDIRECT_RE, idDoYoutube,
} from '../utils/formularioEstilo.js'
import './FormularioPublico.css'

// Editor do formulário — "Apresentação" (aba Geral, migration_029), "Depois do
// envio" e "Estilo" (migration_028).
// Estilo vale para /f/:slug e para o embed "Com estilo do Prolu" (iframe);
// o embed cru continua estilizado só pelo CSS do site. Depois do envio vale
// para a página e para os dois modos de embed.

function Segmentos({ valor, opcoes, onChange, disabled, rotulo }) {
  return (
    <div className="fm-seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(o => (
        <button
          key={o.value} type="button" role="radio" aria-checked={valor === o.value}
          className={`fm-seg-opcao${valor === o.value ? ' on' : ''}`}
          onClick={() => onChange(o.value)} disabled={disabled}
        >{o.label}</button>
      ))}
    </div>
  )
}

function Cor({ valor, onChange, disabled, rotulo }) {
  return (
    <label className={`fm-cor${disabled ? ' off' : ''}`}>
      <input type="color" value={valor} onChange={e => onChange(e.target.value)} disabled={disabled} aria-label={rotulo} />
      <span>{valor.toUpperCase()}</span>
    </label>
  )
}

function Linha({ rotulo, dica, children }) {
  return (
    <div className="fm-publico-row">
      <span className="fm-publico-label">{rotulo}</span>
      <div className="fm-estilo-controles">{children}</div>
      {dica && <span className="fm-publico-dica fm-estilo-dica">{dica}</span>}
    </div>
  )
}

const FUNDO = [{ value: 'transparente', label: 'Transparente' }, { value: 'cor', label: 'Cor' }]
const ALTURA = [{ value: 'pequena', label: 'Pequena' }, { value: 'media', label: 'Média' }, { value: 'grande', label: 'Grande' }]
const LARGURA_BORDA = [{ value: 'fina', label: 'Fina' }, { value: 'media', label: 'Média' }, { value: 'grossa', label: 'Grossa' }]
const BOTAO = [{ value: 'total', label: 'Largura total' }, { value: 'esquerda', label: 'À esquerda' }, { value: 'direita', label: 'À direita' }]
const PESO = [{ value: 'normal', label: 'Normal' }, { value: 'negrito', label: 'Negrito' }]

// cantos arredondados: slider + valor em px
function Raio({ valor, max, onChange, disabled, rotulo }) {
  return (
    <div className="fm-raio">
      <input type="range" min={0} max={max} step={1} value={valor} disabled={disabled} aria-label={rotulo} onChange={e => onChange(Number(e.target.value))} />
      <span>{valor}px</span>
    </div>
  )
}

function Grupo({ titulo, children }) {
  return (
    <div className="fm-estilo-grupo">
      <div className="fm-estilo-grupo-titulo">{titulo}</div>
      {children}
    </div>
  )
}

export function PainelEstilo({ form, campos, podeEditar, salvarForm }) {
  const toast = useToast()
  const [estilo, setEstilo] = useState(() => normalizarEstilo(form.estilo))
  const pendente = useRef(null) // { timer, valor }
  const salvarRef = useRef(salvarForm)
  salvarRef.current = salvarForm

  // seletor de cor/slider/texto disparam a cada movimento: grava 600 ms depois da última mudança
  function mudar(patch) {
    const novo = { ...estilo, ...patch }
    setEstilo(novo)
    clearTimeout(pendente.current?.timer)
    pendente.current = {
      valor: novo,
      timer: setTimeout(() => {
        pendente.current = null
        salvarRef.current({ estilo: normalizarEstilo(novo) }).then(ok => { if (!ok) toast('Não foi possível salvar o estilo') })
      }, 600),
    }
  }

  // saiu do editor com mudança pendente: grava na hora
  useEffect(() => () => {
    if (!pendente.current) return
    clearTimeout(pendente.current.timer)
    salvarRef.current({ estilo: normalizarEstilo(pendente.current.valor) })
  }, [])

  const off = !podeEditar
  const visual = estiloParaPagina(estilo)
  const amostra = campos.length ? campos.slice(0, 2) : [{ id: 'a', label: 'Nome', obrigatorio: true }, { id: 'b', label: 'E-mail' }]
  const padrao = JSON.stringify(normalizarEstilo(estilo)) === JSON.stringify(ESTILO_PADRAO)

  return (
    <>
      <div className="fm-painel-topo">
        <p className="fm-section-sub">Vale para o link público e para o modo "Com estilo do Prolu" da incorporação. Os campos ficam sempre um por linha.</p>
        {podeEditar && !padrao && (
          <button type="button" className="fm-link-btn" onClick={() => mudar(ESTILO_PADRAO)}>Restaurar padrão</button>
        )}
      </div>
      <div className="fm-estilo">
        <div className="fm-publico fm-estilo-painel">
          <Grupo titulo="Página">
            <Linha rotulo="Fundo" dica="Transparente: fundo padrão no link público e o fundo do seu site quando incorporado.">
              <Segmentos rotulo="Fundo da página" valor={estilo.pagina_fundo} opcoes={FUNDO} disabled={off} onChange={v => mudar({ pagina_fundo: v })} />
              {estilo.pagina_fundo === 'cor' && <Cor rotulo="Cor do fundo da página" valor={estilo.pagina_cor} disabled={off} onChange={v => mudar({ pagina_cor: v })} />}
            </Linha>
          </Grupo>

          <Grupo titulo="Formulário">
            <Linha rotulo="Fundo">
              <Segmentos rotulo="Fundo do formulário" valor={estilo.card_fundo} opcoes={FUNDO} disabled={off} onChange={v => mudar({ card_fundo: v })} />
              {estilo.card_fundo === 'cor' && <Cor rotulo="Cor do fundo do formulário" valor={estilo.card_cor} disabled={off} onChange={v => mudar({ card_cor: v })} />}
            </Linha>
            <Linha rotulo="Borda">
              <FmSwitch ligado={estilo.borda} disabled={off} rotulo="Borda do formulário" onChange={v => mudar({ borda: v })} />
              {estilo.borda && <Cor rotulo="Cor da borda" valor={estilo.borda_cor} disabled={off} onChange={v => mudar({ borda_cor: v })} />}
            </Linha>
            {estilo.borda && (
              <Linha rotulo="Largura da borda">
                <Segmentos rotulo="Largura da borda" valor={estilo.borda_largura} opcoes={LARGURA_BORDA} disabled={off} onChange={v => mudar({ borda_largura: v })} />
              </Linha>
            )}
            <Linha rotulo="Cantos">
              <Raio rotulo="Cantos arredondados do formulário" valor={estilo.card_raio} max={RAIO_MAX.card_raio} disabled={off} onChange={v => mudar({ card_raio: v })} />
            </Linha>
          </Grupo>

          <Grupo titulo="Campos">
            <Linha rotulo="Altura">
              <Segmentos rotulo="Altura dos campos" valor={estilo.input_altura} opcoes={ALTURA} disabled={off} onChange={v => mudar({ input_altura: v })} />
            </Linha>
            <Linha rotulo="Fundo">
              <Cor rotulo="Cor do fundo dos campos" valor={estilo.input_cor} disabled={off} onChange={v => mudar({ input_cor: v })} />
            </Linha>
            <Linha rotulo="Texto digitado">
              <Cor rotulo="Cor do texto digitado nos campos" valor={estilo.input_texto_cor} disabled={off} onChange={v => mudar({ input_texto_cor: v })} />
            </Linha>
            <Linha rotulo="Contorno">
              <FmSwitch ligado={estilo.input_contorno} disabled={off} rotulo="Contorno dos campos" onChange={v => mudar({ input_contorno: v })} />
              {estilo.input_contorno && <Cor rotulo="Cor do contorno" valor={estilo.input_contorno_cor} disabled={off} onChange={v => mudar({ input_contorno_cor: v })} />}
            </Linha>
            <Linha rotulo="Cantos">
              <Raio rotulo="Cantos arredondados dos campos" valor={estilo.input_raio} max={RAIO_MAX.input_raio} disabled={off} onChange={v => mudar({ input_raio: v })} />
            </Linha>
          </Grupo>

          <Grupo titulo="Botão">
            <Linha rotulo="Texto">
              <input
                className="fm-pos-input" value={estilo.botao_texto} disabled={off} maxLength={BOTAO_TEXTO_MAX}
                placeholder={BOTAO_TEXTO_PADRAO} aria-label="Texto do botão de envio"
                onChange={e => mudar({ botao_texto: e.target.value })}
              />
            </Linha>
            <Linha rotulo="Cor" dica="O texto do botão fica claro ou escuro automaticamente, para manter a leitura.">
              <Cor rotulo="Cor do botão" valor={estilo.botao_cor} disabled={off} onChange={v => mudar({ botao_cor: v })} />
            </Linha>
            <Linha rotulo="Fonte">
              <Segmentos rotulo="Peso da fonte do botão" valor={estilo.botao_peso} opcoes={PESO} disabled={off} onChange={v => mudar({ botao_peso: v })} />
            </Linha>
            <Linha rotulo="Posição">
              <Segmentos rotulo="Posição do botão" valor={estilo.botao} opcoes={BOTAO} disabled={off} onChange={v => mudar({ botao: v })} />
            </Linha>
            <Linha rotulo="Cantos">
              <Raio rotulo="Cantos arredondados do botão" valor={estilo.botao_raio} max={RAIO_MAX.botao_raio} disabled={off} onChange={v => mudar({ botao_raio: v })} />
            </Linha>
          </Grupo>
        </div>

        {/* prévia com as mesmas classes/variáveis da página pública */}
        <div className="fm-previa" aria-hidden="true">
          <div className={`prolu-pagina ${visual.classes}`} style={visual.vars}>
            <div className="prolu-form">
              <div className="prolu-form__titulo">{form.nome}</div>
              <div className="prolu-form__campos">
                {amostra.map((c, i) => (
                  <div className="prolu-form__campo" key={c.id}>
                    <span className="prolu-form__label">
                      {c.label || 'Pergunta'}{c.obrigatorio && <span className="prolu-form__asterisco"> *</span>}
                    </span>
                    <input className="prolu-form__input" readOnly tabIndex={-1} value={i === 0 ? 'Texto digitado' : ''} />
                  </div>
                ))}
              </div>
              <button type="button" className="prolu-form__enviar" tabIndex={-1}>{textoDoBotao(estilo)}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// "seusite.com.br/x" → "https://seusite.com.br/x"; null se não for http(s) válido
function completarUrl(digitada) {
  const url = /^[a-z][a-z0-9+.-]*:/i.test(digitada) ? digitada : `https://${digitada}`
  return URL_REDIRECT_RE.test(url) && url.length <= 2000 ? url : null
}

// Botão opcional na mensagem de agradecimento (migration_029). Sem coluna de
// "ligado": aparece quando texto e URL estão preenchidos; desligar apaga os dois.
function BotaoObrigado({ form, off, salvarForm }) {
  const toast = useToast()
  const [ligado, setLigado] = useState(!!(form.obrigado_botao_texto || form.obrigado_botao_url))
  const [urlInvalida, setUrlInvalida] = useState(false)

  async function alternar(v) {
    setLigado(v)
    if (!v && (form.obrigado_botao_texto || form.obrigado_botao_url)) {
      if (await salvarForm({ obrigado_botao_texto: null, obrigado_botao_url: null })) toast('Botão removido da mensagem')
      else setLigado(true)
    }
  }

  async function salvarUrl(digitada) {
    if (!digitada) { setUrlInvalida(false); salvarForm({ obrigado_botao_url: null }); return }
    const url = completarUrl(digitada)
    if (!url) { setUrlInvalida(true); return }
    setUrlInvalida(false)
    if (await salvarForm({ obrigado_botao_url: url })) toast('Botão salvo')
  }

  const incompleto = ligado && !(form.obrigado_botao_texto && form.obrigado_botao_url)
  return (
    <>
      <Linha rotulo="Botão na mensagem">
        <FmSwitch ligado={ligado} disabled={off} rotulo="Exibir botão na mensagem de agradecimento" onChange={alternar} />
        <span className="fm-status-texto">{ligado ? 'Exibir botão' : 'Sem botão'}</span>
      </Linha>
      {ligado && (
        <>
          <Linha rotulo="Texto do botão">
            <CampoTextoSalvo
              className="fm-pos-input" valor={form.obrigado_botao_texto || ''} disabled={off} maxLength={60}
              placeholder="Ex.: Acessar nosso site" aria-label="Texto do botão da mensagem de agradecimento"
              onSalvar={v => salvarForm({ obrigado_botao_texto: v || null }).then(ok => ok && toast('Botão salvo'))}
            />
          </Linha>
          <Linha rotulo="Link do botão" dica="Abre em uma nova aba.">
            <CampoTextoSalvo
              className={`fm-pos-input${urlInvalida ? ' invalido' : ''}`} valor={form.obrigado_botao_url || ''} disabled={off}
              type="url" inputMode="url" maxLength={2000} placeholder="https://seusite.com.br"
              aria-label="Link do botão da mensagem de agradecimento" aria-invalid={urlInvalida}
              onFocus={() => setUrlInvalida(false)}
              onSalvar={salvarUrl}
            />
            {urlInvalida && <span className="fm-pos-erro">Use um endereço completo, começando com https://</span>}
            {incompleto && !urlInvalida && <span className="fm-publico-aviso">Preencha o texto e o link para o botão aparecer.</span>}
          </Linha>
        </>
      )}
    </>
  )
}

export function PainelPosEnvio({ form, podeEditar, salvarForm }) {
  const toast = useToast()
  // "Redirecionar" escolhido mas ainda sem URL: só na tela — o banco exige a
  // URL junto (constraint formularios_redirect_url_valida)
  const [modo, setModo] = useState(form.pos_envio === 'redirecionar' ? 'redirecionar' : 'mensagem')
  const [urlInvalida, setUrlInvalida] = useState(false)

  async function escolher(m) {
    setModo(m)
    if (m === 'mensagem' && form.pos_envio !== 'mensagem') {
      if (await salvarForm({ pos_envio: 'mensagem' })) toast('Depois do envio: mostrar mensagem')
    } else if (m === 'redirecionar' && form.redirect_url) {
      if (await salvarForm({ pos_envio: 'redirecionar' })) toast('Depois do envio: redirecionar')
    }
  }

  async function salvarUrl(digitada) {
    if (!digitada) {
      setUrlInvalida(false)
      // sem URL não dá para redirecionar: volta para a mensagem
      if (await salvarForm({ redirect_url: null, pos_envio: 'mensagem' })) { setModo('mensagem'); toast('Sem URL — volta a mostrar a mensagem') }
      return
    }
    const url = completarUrl(digitada)
    if (!url) { setUrlInvalida(true); return }
    setUrlInvalida(false)
    if (await salvarForm({ redirect_url: url, pos_envio: 'redirecionar' })) toast('URL de redirecionamento salva')
  }

  const off = !podeEditar
  return (
    <>
      <div className="fm-painel-topo">
        <p className="fm-section-sub">Vale para o link público e para os dois modos de incorporação.</p>
      </div>
      <div className="fm-publico">
        <Linha rotulo="Ao enviar">
          <Segmentos
            rotulo="O que acontece depois do envio" valor={modo} disabled={off} onChange={escolher}
            opcoes={[{ value: 'mensagem', label: 'Mostrar mensagem' }, { value: 'redirecionar', label: 'Redirecionar para uma página' }]}
          />
        </Linha>
        {modo === 'mensagem' ? (
          <>
            <Linha rotulo="Título">
              <CampoTextoSalvo
                className="fm-pos-input" valor={form.sucesso_titulo || ''} disabled={off} maxLength={120}
                placeholder={SUCESSO_TITULO_PADRAO} aria-label="Título da mensagem de sucesso"
                onSalvar={v => salvarForm({ sucesso_titulo: v || null }).then(ok => ok && toast('Mensagem salva'))}
              />
            </Linha>
            <Linha rotulo="Texto" dica="Vazio = texto padrão, com o nome do escritório.">
              <CampoTextoSalvo
                multilinha rows={3} className="fm-pos-input" valor={form.sucesso_texto || ''} disabled={off} maxLength={1000}
                placeholder="A equipe do seu escritório vai entrar em contato em breve." aria-label="Texto da mensagem de sucesso"
                onSalvar={v => salvarForm({ sucesso_texto: v || null }).then(ok => ok && toast('Mensagem salva'))}
              />
            </Linha>
            <BotaoObrigado form={form} off={off} salvarForm={salvarForm} />
          </>
        ) : (
          <Linha
            rotulo="URL"
            dica="Ex.: a página de obrigado do seu site, com o Google Tag ou o Pixel da Meta instalado para registrar a conversão. O Prolu só redireciona; não dispara nenhum tracking."
          >
            <CampoTextoSalvo
              className={`fm-pos-input${urlInvalida ? ' invalido' : ''}`} valor={form.redirect_url || ''} disabled={off}
              type="url" inputMode="url" maxLength={2000} placeholder="https://seusite.com.br/obrigado"
              aria-label="URL para redirecionar depois do envio" aria-invalid={urlInvalida}
              onFocus={() => setUrlInvalida(false)}
              onSalvar={salvarUrl}
            />
            {urlInvalida && <span className="fm-pos-erro">Use um endereço completo, começando com https://</span>}
            {!form.redirect_url && !urlInvalida && <span className="fm-publico-aviso">Enquanto não houver URL, continua mostrando a mensagem.</span>}
          </Linha>
        )}
      </div>
    </>
  )
}

// ── Apresentação (aba Geral; migration_029) ──
// Imagens no bucket público formularios-assets, em <empresa_id>/<formulario_id>/
// (a policy de upload exige esse caminho e master do próprio escritório).
const BUCKET = 'formularios-assets'
const TIPOS_IMAGEM = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

// caminho do arquivo a partir da URL pública (só se for deste bucket)
function caminhoNoBucket(url) {
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const i = (url || '').indexOf(marca)
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split('?')[0]) : null
}

function UploadImagem({ form, coluna, prefixo, maxMb, redonda, rotulo, off, salvarForm }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const url = form[coluna]

  async function apagarArquivo(urlAntiga) {
    const caminho = caminhoNoBucket(urlAntiga)
    if (caminho) await supabase.storage.from(BUCKET).remove([caminho]) // melhor esforço
  }

  async function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ext = TIPOS_IMAGEM[file.type]
    if (!ext) { toast('Use uma imagem JPG, PNG, WEBP ou GIF'); return }
    if (file.size > maxMb * 1024 * 1024) { toast(`Imagem muito grande — máximo ${maxMb} MB`); return }
    setEnviando(true)
    const caminho = `${form.empresa_id}/${form.id}/${prefixo}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
    if (error) {
      setEnviando(false)
      console.error('[formulario] upload', error)
      toast('Não foi possível enviar a imagem')
      return
    }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
    const anterior = url
    const ok = await salvarForm({ [coluna]: publicUrl })
    setEnviando(false)
    if (!ok) { await supabase.storage.from(BUCKET).remove([caminho]); return }
    toast('Imagem salva')
    if (anterior) apagarArquivo(anterior)
  }

  async function remover() {
    const anterior = url
    if (await salvarForm({ [coluna]: null })) { toast('Imagem removida'); apagarArquivo(anterior) }
  }

  return (
    <div className="fm-upload">
      <div className={`fm-upload-previa${redonda ? ' redonda' : ''}`}>
        {url ? <img src={url} alt={rotulo} /> : <span>Sem imagem</span>}
      </div>
      {!off && (
        <div className="fm-upload-acoes">
          <input ref={inputRef} type="file" accept={Object.keys(TIPOS_IMAGEM).join(',')} hidden onChange={escolher} aria-label={rotulo} />
          <button type="button" className="fm-embed-btn" onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? 'Enviando…' : url ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {url && <button type="button" className="fm-link-btn" onClick={remover} disabled={enviando}>Remover</button>}
        </div>
      )}
    </div>
  )
}

export function PainelApresentacao({ form, podeEditar, salvarForm }) {
  const toast = useToast()
  const [videoInvalido, setVideoInvalido] = useState(false)
  const off = !podeEditar
  const videoId = idDoYoutube(form.intro_video_youtube)

  async function salvarVideo(digitado) {
    if (!digitado) { setVideoInvalido(false); salvarForm({ intro_video_youtube: null }); return }
    if (!idDoYoutube(digitado)) { setVideoInvalido(true); return }
    setVideoInvalido(false)
    if (await salvarForm({ intro_video_youtube: digitado })) toast('Vídeo salvo')
  }

  return (
    <>
      <div className="fm-section-title fm-apresentacao-titulo">Apresentação</div>
      <p className="fm-section-sub">O que o visitante vê no topo do formulário: no link público e nos dois modos de incorporação. Tudo opcional.</p>
      <div className="fm-publico">
        <Linha rotulo="Logo" dica="Circular. Sem logo, a página não mostra nenhum. Até 5 MB (JPG, PNG, WEBP ou GIF).">
          <UploadImagem form={form} coluna="logo_url" prefixo="logo" maxMb={5} redonda rotulo="Logo do formulário" off={off} salvarForm={salvarForm} />
        </Linha>
        <Linha rotulo="Capa" dica="Faixa no topo da página. Tamanho sugerido: 1200×400 px. Até 10 MB.">
          <UploadImagem form={form} coluna="capa_url" prefixo="capa" maxMb={10} rotulo="Imagem de capa" off={off} salvarForm={salvarForm} />
        </Linha>
        <Linha rotulo="Título da página" dica="Aparece como destaque abaixo do nome do escritório. Opcional.">
          <CampoTextoSalvo
            className="fm-pos-input" valor={form.titulo_pagina || ''} disabled={off} maxLength={120}
            placeholder="Ex: Solicite seu orçamento" aria-label="Título da página"
            onSalvar={v => salvarForm({ titulo_pagina: v || null }).then(ok => ok && toast('Título salvo'))}
          />
        </Linha>
        <Linha rotulo="Introdução">
          <CampoTextoSalvo
            multilinha rows={5} className="fm-pos-input fm-intro-input" valor={form.intro_texto || ''} disabled={off} maxLength={5000}
            placeholder="Texto que aparece antes dos campos — as quebras de linha são mantidas" aria-label="Texto de introdução"
            onSalvar={v => salvarForm({ intro_texto: v || null }).then(ok => ok && toast('Introdução salva'))}
          />
        </Linha>
        <Linha rotulo="Vídeo do YouTube">
          <CampoTextoSalvo
            className={`fm-pos-input${videoInvalido ? ' invalido' : ''}`} valor={form.intro_video_youtube || ''} disabled={off}
            type="url" inputMode="url" maxLength={300} placeholder="https://www.youtube.com/watch?v=…"
            aria-label="Link do vídeo do YouTube" aria-invalid={videoInvalido}
            onFocus={() => setVideoInvalido(false)}
            onSalvar={salvarVideo}
          />
          {videoInvalido && <span className="fm-pos-erro">Não reconheci o link. Use um link do youtube.com ou youtu.be.</span>}
          {videoId && !videoInvalido && (
            <span className="fm-video-ok">
              <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" /> Vídeo reconhecido
            </span>
          )}
        </Linha>
        {videoId && (
          <Linha rotulo="Posição do vídeo">
            <Segmentos
              rotulo="Posição do vídeo" valor={form.intro_video_posicao === 'antes' ? 'antes' : 'depois'} disabled={off}
              onChange={v => salvarForm({ intro_video_posicao: v })}
              opcoes={[{ value: 'antes', label: 'Antes do texto de introdução' }, { value: 'depois', label: 'Depois do texto de introdução' }]}
            />
          </Linha>
        )}
      </div>
    </>
  )
}
