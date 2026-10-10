import { useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../services/supabaseClient.js'

// PDFs da Base de Conhecimento ficam no bucket privado kb-pdfs (migration_050).
// pdf_url / arquivo_url guardam a URL "pública" só como identificador do
// arquivo; para abrir, o app pede uma URL assinada (vale 1 hora). O banco só
// assina arquivo de aula que a pessoa consegue ver (curso liberado).

const VALIDADE_S = 60 * 60

export function caminhoKbPdf(url) {
  if (!url || !url.includes('/kb-pdfs/')) return null
  return decodeURIComponent(url.split('/kb-pdfs/')[1].split('?')[0])
}

// { [url original]: url assinada } — URLs fora do bucket (ou modo
// demonstração / prévia blob:) voltam como estão
export function useUrlsAssinadas(urls) {
  const chave = (urls || []).filter(Boolean).join('|')
  const [mapa, setMapa] = useState({})

  useEffect(() => {
    let vivo = true
    const lista = chave ? chave.split('|') : []
    const doBucket = lista.filter(u => caminhoKbPdf(u))
    const diretos = Object.fromEntries(lista.filter(u => !caminhoKbPdf(u)).map(u => [u, u]))
    if (!supabaseReady || doBucket.length === 0) { setMapa(diretos); return }
    setMapa(diretos)
    supabase.storage.from('kb-pdfs')
      .createSignedUrls(doBucket.map(caminhoKbPdf), VALIDADE_S)
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) { console.error('[kb] url assinada', error); return }
        const assinadas = {}
        doBucket.forEach((u, i) => { if (data?.[i]?.signedUrl) assinadas[u] = data[i].signedUrl })
        setMapa({ ...diretos, ...assinadas })
      })
    return () => { vivo = false }
  }, [chave])

  return mapa
}
