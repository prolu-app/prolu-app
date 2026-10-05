// Vercel Routing Middleware — Open Graph para quem não executa JavaScript
// (WhatsApp, iMessage, Facebook, Telegram, Slack…). A SPA coloca as mesmas
// tags no cliente (FormularioPublico.jsx); aqui o robô recebe o index.html já
// com elas, montado pelo servidor.
//
// Só para robôs de pré-visualização: o visitante normal segue direto para a
// SPA, sem esperar a consulta. Os dados vêm da Edge Function
// formulario-publico (acao "carregar", sem efeito colateral) — a tabela
// formularios é fechada por RLS para a anon key, e a função já aplica
// formulário ativo e os liga/desliga de título, capa e introdução.
// Qualquer falha → segue normalmente (sem tags), nunca quebra o acesso.

export const config = { matcher: '/e/:escritorio/:formulario' }

const ROBO = /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|skypeuripreview|pinterest|redditbot|embedly|applebot|googlebot|bingbot|bot\b|crawler|spider/i
const DESCRICAO_MAX = 160

const escapar = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// introdução (HTML do editor rico ou texto antigo) → texto puro, até 160 + "..."
function descricaoDaIntro(intro) {
  if (typeof intro !== 'string') return ''
  const texto = intro
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|li|h1|h2)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
  return texto.length > DESCRICAO_MAX ? texto.slice(0, DESCRICAO_MAX).trimEnd() + '...' : texto
}

export default async function middleware(request) {
  try {
    if (!ROBO.test(request.headers.get('user-agent') || '')) return

    const env = (typeof process !== 'undefined' && process.env) || {}
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) return

    const url = new URL(request.url)
    const [, , escritorio, formulario] = url.pathname.split('/')
    const slugs = { slug_escritorio: decodeURIComponent(escritorio), slug_formulario: decodeURIComponent(formulario) }

    const [resDados, resHtml] = await Promise.all([
      fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/formulario-publico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ acao: 'carregar', ...slugs }),
        signal: AbortSignal.timeout(3000),
      }),
      fetch(new URL('/index.html', url), { signal: AbortSignal.timeout(3000) }),
    ])
    if (!resDados.ok || !resHtml.ok) return
    const form = (await resDados.json())?.formulario
    const html = await resHtml.text()
    if (!form || !html.includes('</head>')) return

    const titulo = form.titulo || form.escritorio || 'Formulário'
    const descricao = descricaoDaIntro(form.apresentacao?.intro)
    const imagem = form.apresentacao?.capa // a função só devolve https
    const tags = [
      ['property', 'og:type', 'website'],
      ['property', 'og:url', `${url.origin}${url.pathname}`],
      ['property', 'og:title', titulo],
      ['property', 'og:description', descricao],
      ['property', 'og:image', imagem],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', titulo],
      ['name', 'twitter:description', descricao],
      ['name', 'twitter:image', imagem],
    ]
      .filter(([, , valor]) => valor) // sem introdução/capa, a tag fica de fora
      .map(([attr, chave, valor]) => `<meta ${attr}="${chave}" content="${escapar(valor)}" />`)
      .join('\n  ')

    const pagina = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapar([...new Set([form.titulo, form.escritorio].filter(Boolean))].join(' · ') || 'Formulário')}</title>`)
      .replace('</head>', `  ${tags}\n</head>`)
    return new Response(pagina, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  } catch {
    return // erro de rede, tempo esgotado, JSON inválido…: segue para a SPA
  }
}
