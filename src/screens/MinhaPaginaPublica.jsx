// Minha Página pública: app.prolu.com.br/<slug do escritório> — sem login,
// fora do AppLayout. Lê tudo pela função pagina_publica (migration_041), que
// só responde se a página estiver publicada; empresas e pagina_links seguem
// fechados por RLS para visitantes.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { normalizarPagina } from '../utils/paginaConfig.js'
import PaginaView from '../components/minhapagina/PaginaView.jsx'
import '../components/minhapagina/PaginaView.css'

export default function MinhaPaginaPublica() {
  const { slugEscritorio = '' } = useParams()
  const [estado, setEstado] = useState('carregando') // carregando | pronto | indisponivel
  const [dados, setDados] = useState(null)

  useEffect(() => {
    let vivo = true
    setEstado('carregando')
    if (!supabaseReady) { setEstado('indisponivel'); return }
    supabase.rpc('pagina_publica', { p_slug: slugEscritorio }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data) { setEstado('indisponivel'); return }
      const config = normalizarPagina(data.config)
      setDados({ ...data, config, links: Array.isArray(data.links) ? data.links : [] })
      setEstado('pronto')
      document.title = config.nome_exibicao.trim() || data.escritorio || 'Prolu'
    })
    return () => { vivo = false }
  }, [slugEscritorio])

  if (estado === 'carregando') return <div className="mp-estado" aria-busy="true" />
  if (estado === 'indisponivel') return <div className="mp-estado"><p>Esta página não está disponível.</p></div>
  return <PaginaView config={dados.config} links={dados.links} slugEscritorio={dados.slug} escritorio={dados.escritorio} />
}
