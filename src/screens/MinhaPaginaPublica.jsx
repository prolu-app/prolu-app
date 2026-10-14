// Minha Página pública: prolu.link/<slug do escritório> (ou /e/<slug>) — sem login,
// fora do AppLayout. Lê tudo pela função pagina_publica, que só responde se a
// página estiver no ar; empresas, paginas e pagina_links seguem fechados por
// RLS para visitantes.
// Resposta v2 (migration_056, publicada pelo editor novo) → render único
// (PaginaRender). Sem publicação v2 → a página antiga, pelo render antigo
// (PaginaView), até a 1ª publicação no editor novo.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { normalizarPagina } from '../utils/paginaConfig.js'
import { normalizarDoc } from '../utils/pagina/modelo.js'
import PaginaView from '../components/minhapagina/PaginaView.jsx'
import PaginaRender from '../components/minhapagina/render/PaginaRender.jsx'
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
      if (data.v === 2) {
        const doc = normalizarDoc(data.pagina)
        setDados({ ...data, doc })
        document.title = doc.perfil.nome.trim() || data.escritorio || 'Prolu'
      } else {
        const config = normalizarPagina(data.config)
        setDados({ ...data, config, links: Array.isArray(data.links) ? data.links : [] })
        document.title = config.nome_exibicao.trim() || data.escritorio || 'Prolu'
      }
      setEstado('pronto')
    })
    return () => { vivo = false }
  }, [slugEscritorio])

  if (estado === 'carregando') return <div className="mp-estado" aria-busy="true" />
  if (estado === 'indisponivel') return <div className="mp-estado"><p>Esta página não está disponível.</p></div>
  // selo decidido no servidor (pagina_publica, migrations 054/056)
  if (dados.doc) return <PaginaRender doc={dados.doc} selo={dados.selo !== false} escritorio={dados.escritorio} slug={dados.slug} />
  const selo = typeof dados.selo === 'boolean' ? dados.selo : dados.config.rodape_prolu
  return <PaginaView config={dados.config} links={dados.links} slugEscritorio={dados.slug} escritorio={dados.escritorio} selo={selo} />
}
