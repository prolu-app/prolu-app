// Peças comuns do editor da Minha Página: envio de imagem ao bucket
// pagina-assets, campo de upload e a prévia 9:16.
// Fase 1 não apaga imagem nenhuma do bucket: a mesma imagem pode estar no
// rascunho, no publicado e na página antiga ao mesmo tempo.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import { useToast } from '../../contexts/ToastContext.jsx'

const BUCKET = 'pagina-assets'
export const TIPOS_IMAGEM = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const MAX_BYTES = 10 * 1024 * 1024

// valida, comprime e envia para <empresa>/<prefixo>-<data>.<ext>; devolve a URL
// pública (ou null, já avisando). semGif: capa e hero (pesariam demais no carregamento).
export async function enviarImagem(file, { empresaId, prefixo, comprimir, toast, semGif = false }) {
  if (!TIPOS_IMAGEM[file.type] || (semGif && file.type === 'image/gif')) {
    toast(semGif ? 'Use uma imagem JPG, PNG ou WEBP' : 'Use uma imagem JPG, PNG, WEBP ou GIF')
    return null
  }
  if (file.size > MAX_BYTES) { toast('Imagem muito grande — máximo 10 MB'); return null }
  const pronto = await comprimir(file).catch(() => file)
  const caminho = `${empresaId}/${prefixo}-${Date.now()}.${TIPOS_IMAGEM[pronto.type]}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, pronto, { contentType: pronto.type, cacheControl: '31536000', upsert: false })
  if (error) { console.error('[minha-pagina] upload', error); toast('Não foi possível enviar a imagem'); return null }
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
}

export function UploadImagem({ url, rotulo, empresaId, prefixo, comprimir, semGif, redonda, larga, off, onMudar, removivel = true }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [enviando, setEnviando] = useState(false)

  async function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviando(true)
    const publica = await enviarImagem(file, { empresaId, prefixo, comprimir, toast, semGif })
    setEnviando(false)
    if (publica) onMudar(publica)
  }

  const aceitos = Object.keys(TIPOS_IMAGEM).filter(t => !(semGif && t === 'image/gif')).join(',')
  return (
    <div className="fm-upload">
      <div className={`fm-upload-previa${redonda ? ' redonda' : ''}${larga ? ' mpe-upload-larga' : ''}`}>
        {url ? <img src={url} alt={rotulo} /> : <span>Sem imagem</span>}
      </div>
      {!off && (
        <div className="fm-upload-acoes">
          <input ref={inputRef} type="file" accept={aceitos} hidden onChange={escolher} aria-label={rotulo} />
          <button type="button" className="fm-embed-btn" onClick={() => inputRef.current?.click()} disabled={enviando}>
            {enviando ? 'Enviando…' : url ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {url && removivel && <button type="button" className="fm-link-btn" onClick={() => onMudar(null)} disabled={enviando}>Remover</button>}
        </div>
      )}
    </div>
  )
}

// Prévia fiel ao celular: a página é desenhada com 390px de largura e reduzida
// com transform: scale até caber na moldura 9:16. children(alturaTela) recebe a
// altura da tela interna em px (o Hero usa ~55% dela).
const LARGURA_BASE = 390

export function PreviaCelular({ children }) {
  const molduraRef = useRef(null)
  const [medida, setMedida] = useState({ escala: 1, altura: 0 })

  useEffect(() => {
    const el = molduraRef.current
    if (!el) return
    const medir = () => {
      const escala = el.clientWidth / LARGURA_BASE
      if (escala > 0) setMedida({ escala, altura: el.clientHeight / escala })
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="mp-previa-moldura" ref={molduraRef}>
      <div
        className="mp-previa-tela"
        style={{ width: LARGURA_BASE, height: medida.altura || undefined, transform: `scale(${medida.escala})`, transformOrigin: 'top left' }}
      >
        {children(Math.round(medida.altura) || 844)}
      </div>
    </div>
  )
}
