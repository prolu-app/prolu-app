// Compressão da capa do formulário no navegador, antes do upload. A capa
// também é a imagem do card do link (og:image, middleware.js), e o WhatsApp
// descarta prévias pesadas: o alvo é JPEG até ~300 KB e 1600 px de largura
// (a faixa aparece com até ~1200 px; sobra margem para telas de alta densidade).
// GIF segue como veio (pode ser animado). Transparência vira fundo branco.

const LARGURA_MAX = 1600
const ALVO_BYTES = 300 * 1024
const QUALIDADES = [0.85, 0.75, 0.65]

async function carregar(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

const paraBlob = (canvas, qualidade) => new Promise(ok => canvas.toBlob(ok, 'image/jpeg', qualidade))

// Foto de perfil da Minha Página: aparece com ~96px — até 512px no lado maior.
// PNG/WEBP continuam no formato (logo com fundo transparente); JPEG segue JPEG.
const FOTO_MAX = 512
export async function comprimirFoto(file) {
  if (file.type === 'image/gif') return file
  const img = await carregar(file)
  const escala = Math.min(1, FOTO_MAX / Math.max(img.width, img.height))
  if (escala === 1 && file.size <= ALVO_BYTES) { img.close?.(); return file }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * escala)
  canvas.height = Math.round(img.height * escala)
  const tipo = file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png'
  const ctx = canvas.getContext('2d')
  if (tipo === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close?.()
  const blob = await new Promise(ok => canvas.toBlob(ok, tipo, 0.85))
  if (!blob || blob.size >= file.size) return file
  const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[tipo]
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: tipo })
}

export async function comprimirCapa(file) {
  if (file.type === 'image/gif') return file
  // já leve e em JPEG: não recomprime (cada passada perde qualidade)
  if (file.type === 'image/jpeg' && file.size <= ALVO_BYTES) return file
  const img = await carregar(file)
  const larguraOriginal = img.width
  const alturaOriginal = img.height
  let largura = Math.min(LARGURA_MAX, larguraOriginal)
  let melhor = null
  // reduz a qualidade e, se ainda passar do alvo, a largura (até 4 rodadas)
  rodadas: for (let rodada = 0; rodada < 4; rodada++, largura *= 0.8) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(largura)
    canvas.height = Math.round(alturaOriginal * (largura / larguraOriginal))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of QUALIDADES) {
      const blob = await paraBlob(canvas, q)
      if (blob && (!melhor || blob.size < melhor.size)) melhor = blob
      if (blob && blob.size <= ALVO_BYTES) break rodadas
    }
  }
  img.close?.()
  // falhou ou não ganhou nada: manda o original
  if (!melhor || melhor.size >= file.size) return file
  const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([melhor], nome, { type: 'image/jpeg' })
}
