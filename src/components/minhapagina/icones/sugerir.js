// Ícone sugerido pelo endereço do link (a pessoa pode trocar). null = sem sugestão.

const POR_DOMINIO = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, 'pinterest'],
  [/(^|\.)behance\.net$/, 'behance'],
  [/(^|\.)spotify\.com$/, 'spotify'],
  [/(^|\.)(t\.me|telegram\.me|telegram\.org)$/, 'telegram'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)linkedin\.com$/, 'maleta'], // LinkedIn não está mais nas bibliotecas
  [/(^|\.)(calendly\.com|cal\.com)$/, 'calendario'],
  [/(^|\.)(drive|docs)\.google\.com$/, 'documento'],
]

export function sugerirIcone(url) {
  if (typeof url !== 'string' || !url) return null
  if (/^tel:/i.test(url)) return 'telefone'
  if (/^mailto:/i.test(url)) return 'email'
  let u
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (/^maps\.google\./.test(host) || host === 'maps.app.goo.gl' || (host === 'goo.gl' && u.pathname.startsWith('/maps')) || (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps'))) return 'google-maps'
  for (const [re, id] of POR_DOMINIO) if (re.test(host)) return id
  if (/\.pdf$/i.test(u.pathname)) return 'documento'
  return 'link'
}
