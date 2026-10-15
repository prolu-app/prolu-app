// Área "Publicação" do editor da Minha Página v2: status (no ar / fora do
// ar), link público, QR code, como o link aparece no WhatsApp e o selo.
// O endereço (slug) se troca em Configurações → Escritório (confirmação
// digitada lá); aqui só o hiperlink no texto.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FmSwitch } from '../Formularios.jsx'
import { Linha } from '../FormularioAparencia.jsx'
import { IconCopy } from '../../components/Icons.jsx'
import { planoMinimo, rotuloPlano } from '../../utils/planos.js'
import { urlPaginaPublica } from '../../utils/paginaConfig.js'

const DESCRICAO_MAX = 160 // mesma regra do middleware de OG

const textoCurto = t => {
  const s = (t || '').replace(/\s+/g, ' ').trim()
  return s.length > DESCRICAO_MAX ? s.slice(0, DESCRICAO_MAX).trimEnd() + '...' : s
}

// o que o robô do WhatsApp recebe (middleware.js lê a projeção 'config' da
// pagina_publica): o PUBLICADO, não o rascunho
function dadosDoCartao(servidor, escritorio) {
  if (servidor.temPublicado && servidor.publicado) {
    const p = servidor.publicado
    // a capa só é desenhada (e só vai para o OG) no Clássico
    const capa = p.layout === 'classico' && p.capa.estilo !== 'nenhuma' ? p.capa.imagem : null
    return { titulo: p.perfil.nome.trim() || escritorio, descricao: textoCurto(p.perfil.bio), imagem: capa || p.perfil.foto, grande: !!capa }
  }
  const c = servidor.legado.config || {}
  const banner = typeof c.banner_url === 'string' ? c.banner_url : null
  return { titulo: (c.nome_exibicao || '').trim() || escritorio, descricao: textoCurto(c.bio), imagem: banner || c.foto_perfil || null, grande: !!banner }
}

function PreviaWhatsApp({ dados, url }) {
  return (
    <div className={`mpe-wa${dados.grande ? ' grande' : ''}`} aria-label="Prévia do link no WhatsApp">
      {dados.imagem && <img className="mpe-wa-img" src={dados.imagem} alt="" />}
      <div className="mpe-wa-texto">
        <strong>{dados.titulo}</strong>
        {dados.descricao && <span>{dados.descricao}</span>}
        <small>{url.replace(/^https?:\/\//, '').split('/')[0]}</small>
      </div>
    </div>
  )
}

// QR code em SVG (qrcode-generator, carregado só aqui); baixa em SVG ou PNG
function QrCodigo({ url, nomeArquivo }) {
  const [matriz, setMatriz] = useState(null)
  useEffect(() => {
    let vivo = true
    import('qrcode-generator').then(m => {
      const qr = (m.default || m)(0, 'M')
      qr.addData(url)
      qr.make()
      const n = qr.getModuleCount()
      const linhas = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x)))
      if (vivo) setMatriz(linhas)
    }).catch(e => console.error('[minha-pagina] qr', e))
    return () => { vivo = false }
  }, [url])

  if (!matriz) return <div className="mpe-qr mpe-qr--carregando" aria-busy="true" />
  const n = matriz.length
  const margem = 4
  const lado = n + margem * 2
  const d = matriz.flatMap((linha, y) => linha.map((escuro, x) => (escuro ? `M${x + margem} ${y + margem}h1v1h-1z` : ''))).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="${lado}" height="${lado}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`

  function baixar(tipo) {
    const blobSvg = new Blob([svg], { type: 'image/svg+xml' })
    const salvar = (blob, ext) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${nomeArquivo}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }
    if (tipo === 'svg') { salvar(blobSvg, 'svg'); return }
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1024
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, 1024, 1024)
      URL.revokeObjectURL(img.src)
      canvas.toBlob(b => b && salvar(b, 'png'), 'image/png')
    }
    img.src = URL.createObjectURL(blobSvg)
  }

  return (
    <div className="mpe-qr-bloco">
      <svg className="mpe-qr" viewBox={`0 0 ${lado} ${lado}`} shapeRendering="crispEdges" role="img" aria-label={`QR code de ${url}`}>
        <rect width={lado} height={lado} fill="#ffffff" />
        <path d={d} fill="#000000" />
      </svg>
      <div className="mpe-qr-acoes">
        <button type="button" className="fm-embed-btn" onClick={() => baixar('png')}>Baixar PNG</button>
        <button type="button" className="fm-embed-btn" onClick={() => baixar('svg')}>Baixar SVG</button>
      </div>
    </div>
  )
}

export default function AreaPublicacao({ docNormal, alterar, empresa, servidor, off, seloFixo, onDefinirNoAr, toast }) {
  const url = urlPaginaPublica(empresa.slug)
  const noAr = servidor.temPublicado ? servidor.noAr : servidor.legado.noAr
  const cartao = dadosDoCartao(servidor, empresa.nome)

  return (
    <>
      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-status">
        <h2 className="mpe-titulo" id="mpe-status">Status</h2>
        <Linha
          rotulo="No ar"
          dica={servidor.temPublicado
            ? (noAr ? 'Qualquer pessoa com o link vê a página publicada.' : 'Fora do ar: o link mostra "página não disponível". Publicar não muda isso.')
            : (noAr ? 'A página atual continua no ar até a primeira publicação neste editor.' : 'A primeira publicação coloca a página no ar.')}
        >
          <FmSwitch ligado={noAr} disabled={off || !servidor.temPublicado} rotulo="Página no ar" onChange={onDefinirNoAr} />
          <span className="fm-status-texto">{noAr ? 'No ar' : 'Fora do ar'}</span>
        </Linha>
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-link">
        <h2 className="mpe-titulo" id="mpe-link">Link da página</h2>
        <div className="mp-link-publico">
          <input className="fm-pos-input" readOnly value={url} aria-label="Link público da página" onFocus={e => e.target.select()} />
          <button type="button" className="fm-embed-btn" onClick={() => navigator.clipboard?.writeText(url).then(() => toast('Link copiado'), () => toast('Não foi possível copiar'))}>
            <IconCopy /> Copiar
          </button>
          <a className="fm-embed-btn mpe-abrir" href={url} target="_blank" rel="noopener noreferrer">Abrir</a>
        </div>
        <p className="mpe-nota">
          O endereço é o mesmo do escritório. Para mudar, vá em <Link to="/configuracoes?tab=escritorio#endereco">Configurações → Escritório</Link>.
          Trocar o endereço derruba o link antigo.
        </p>
      </section>

      <section className="mpe-bloco" aria-labelledby="mpe-qr">
        <h2 className="mpe-titulo" id="mpe-qr">QR code</h2>
        <QrCodigo url={url} nomeArquivo={`qr-${empresa.slug}`} />
      </section>

      <section className="mpe-bloco" aria-labelledby="mpe-wa">
        <h2 className="mpe-titulo" id="mpe-wa">No WhatsApp</h2>
        <PreviaWhatsApp dados={cartao} url={url} />
        <p className="mpe-nota">
          Mostra o que está publicado{servidor.temPublicado ? '' : ' (a página atual)'}. Links já enviados podem continuar com a prévia antiga por alguns dias — é o WhatsApp que guarda.
          {!noAr && ' Fora do ar, o link não mostra prévia.'}
        </p>
      </section>

      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-selo">
        <h2 className="mpe-titulo" id="mpe-selo">Rodapé</h2>
        <Linha rotulo="Selo" dica={seloFixo && (
          <>Remover o selo "Feito com Prolu" é recurso dos planos pagos, a partir do {rotuloPlano(planoMinimo('selo_removivel'))}. <Link to={`/planos?plano=${planoMinimo('selo_removivel')}`}>Ver planos</Link></>
        )}>
          <FmSwitch ligado={seloFixo || docNormal.selo} disabled={off || seloFixo} rotulo='Mostrar "Feito com Prolu"' onChange={v => alterar(['selo'], v)} />
          <span className="fm-status-texto">Mostrar "Feito com Prolu"</span>
        </Linha>
      </section>
    </>
  )
}
