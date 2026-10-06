// Vercel Routing Middleware — Open Graph para quem não executa JavaScript
// (WhatsApp, iMessage, Facebook, Telegram, Slack…). A SPA coloca as mesmas
// tags no cliente; aqui o robô recebe o index.html já com elas, montado pelo
// servidor.
//
// Endereços cobertos:
//   prolu.link/<escritório>              → Minha Página
//   prolu.link/<escritório>/<formulário> → formulário
//   <qualquer domínio>/e/<escritório>[/<formulário>] → os mesmos (endereço antigo)
// No app (app.prolu.com.br), caminho sem /e/ é tela do app: segue direto.
//
// Só para robôs de pré-visualização: o visitante normal segue direto para a
// SPA, sem esperar a consulta. Dados pelas mesmas portas públicas da SPA:
// formulário pela Edge Function formulario-publico (acao "carregar", sem
// efeito colateral; aplica formulário ativo e os liga/desliga de exibição) e
// Minha Página pela função pagina_publica (só responde se publicada).
// Qualquer falha → segue normalmente (sem tags), nunca quebra o acesso.

export const config = {
  // só caminhos com cara de slug (sem ponto): /embed.js, /assets/*.js,
  // /textures/*.webp etc. nem chegam aqui
  matcher: [
    '/:escritorio([a-z0-9-]+)',
    '/:escritorio([a-z0-9-]+)/:formulario([a-z0-9-]+)',
    '/e/:escritorio([a-z0-9-]+)/:formulario([a-z0-9-]+)',
  ],
}

const ROBO = /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|skypeuripreview|pinterest|redditbot|embedly|applebot|googlebot|bingbot|bot\b|crawler|spider/i
const DOMINIO_CURTO = /^(www\.)?prolu\.link$/i
const DESCRICAO_MAX = 160
const IMG_RE = /^https:\/\/[^\s"'()\\]+$/i

const escapar = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// HTML do editor rico ou texto simples → texto puro, até 160 + "..."
function textoCurto(valor) {
  if (typeof valor !== 'string') return ''
  const texto = valor
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|li|h1|h2)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
  return texto.length > DESCRICAO_MAX ? texto.slice(0, DESCRICAO_MAX).trimEnd() + '...' : texto
}
const imagemSegura = v => (typeof v === 'string' && IMG_RE.test(v) ? v : null)

// [escritório, formulário?] do caminho, ou null se não for página pública
function slugsDoCaminho(url) {
  let partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (partes[0] === 'e') partes = partes.slice(1) // endereço antigo, em qualquer domínio
  else if (!DOMINIO_CURTO.test(url.hostname)) return null // no app, sem /e/ é tela do app
  return partes.length === 1 || partes.length === 2 ? partes : null
}

async function dadosDoFormulario(base, anonKey, escritorio, formulario) {
  const res = await fetch(`${base}/functions/v1/formulario-publico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ acao: 'carregar', slug_escritorio: escritorio, slug_formulario: formulario }),
    signal: AbortSignal.timeout(3000),
  })
  const form = res.ok ? (await res.json())?.formulario : null
  if (!form) return null
  const imagem = imagemSegura(form.apresentacao?.capa) // a função só devolve https
  return {
    titulo: form.titulo || form.escritorio || 'Formulário',
    tituloAba: [...new Set([form.titulo, form.escritorio].filter(Boolean))].join(' · ') || 'Formulário',
    descricao: textoCurto(form.apresentacao?.intro),
    imagem,
    cartao: 'summary_large_image',
  }
}

async function dadosDaPagina(base, anonKey, escritorio) {
  const res = await fetch(`${base}/rest/v1/rpc/pagina_publica`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ p_slug: escritorio }),
    signal: AbortSignal.timeout(3000),
  })
  const dados = res.ok ? await res.json() : null // null: não existe ou não publicada
  if (!dados || typeof dados !== 'object') return null
  const cfg = dados.config && typeof dados.config === 'object' ? dados.config : {}
  const nome = (typeof cfg.nome_exibicao === 'string' && cfg.nome_exibicao.trim()) || dados.escritorio || 'Prolu'
  const banner = imagemSegura(cfg.banner_url)
  return {
    titulo: nome,
    tituloAba: nome,
    descricao: textoCurto(cfg.bio),
    imagem: banner || imagemSegura(cfg.foto_perfil),
    // banner é largo (card grande); a foto de perfil é quadrada (card pequeno)
    cartao: banner ? 'summary_large_image' : 'summary',
  }
}

export default async function middleware(request) {
  try {
    if (!ROBO.test(request.headers.get('user-agent') || '')) return

    const url = new URL(request.url)
    const slugs = slugsDoCaminho(url)
    if (!slugs) return

    const env = (typeof process !== 'undefined' && process.env) || {}
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) return
    const base = supabaseUrl.replace(/\/+$/, '')

    const [escritorio, formulario] = slugs
    const [meta, resHtml] = await Promise.all([
      formulario ? dadosDoFormulario(base, anonKey, escritorio, formulario) : dadosDaPagina(base, anonKey, escritorio),
      fetch(new URL('/index.html', url), { signal: AbortSignal.timeout(3000) }),
    ])
    if (!meta || !resHtml.ok) return
    const html = await resHtml.text()
    if (!html.includes('</head>')) return

    const tags = [
      ['property', 'og:type', 'website'],
      ['property', 'og:url', `${url.origin}${url.pathname}`],
      ['property', 'og:title', meta.titulo],
      ['property', 'og:description', meta.descricao],
      ['property', 'og:image', meta.imagem],
      ['name', 'twitter:card', meta.cartao],
      ['name', 'twitter:title', meta.titulo],
      ['name', 'twitter:description', meta.descricao],
      ['name', 'twitter:image', meta.imagem],
    ]
      .filter(([, , valor]) => valor) // sem descrição/imagem, a tag fica de fora
      .map(([attr, chave, valor]) => `<meta ${attr}="${chave}" content="${escapar(valor)}" />`)
      .join('\n  ')

    const pagina = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapar(meta.tituloAba)}</title>`)
      .replace('</head>', `  ${tags}\n</head>`)
    return new Response(pagina, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  } catch {
    return // erro de rede, tempo esgotado, JSON inválido…: segue para a SPA
  }
}
