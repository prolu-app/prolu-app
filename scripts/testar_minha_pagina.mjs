// Testes da Minha Página v2 sem navegador e sem dependência nova:
// carrega os módulos pelo próprio Vite (ssrLoadModule) e desenha o render
// único com react-dom/server (renderToStaticMarkup).
//
//   node scripts/testar_minha_pagina.mjs
//
// Confere: normalização tolerante, capas, subtítulo, ordem manual (sem destaque), espaçamentos, visual dos
// itens, itens ocultos, selo em todos os layouts, nada de plano/limite no
// HTML, só https nas imagens, conversão da página antiga, sugestão de ícone,
// edição que preserva chaves, fontes/tamanhos por elemento, botão com
// preenchimento/contorno/texto e a paridade das listas com as migrations 056/057.
// Com um backup em scripts/_backup_minha_pagina/*.json (pasta fora do git),
// também converte e desenha cada página real do backup.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vite = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
const carregar = p => vite.ssrLoadModule(p)

let falhas = 0
let total = 0
function confere(nome, ok, detalhe) {
  total++
  if (ok) return
  falhas++
  console.log(`FALHOU  ${nome}${detalhe ? `\n        ${String(detalhe).slice(0, 400)}` : ''}`)
}

try {
  const modelo = await carregar('/src/utils/pagina/modelo.js')
  const { converterLegado } = await carregar('/src/utils/pagina/legado.js')
  const { TIPOS_ITEM } = await carregar('/src/utils/pagina/itens.js')
  const { sugerirIcone } = await carregar('/src/components/minhapagina/icones/sugerir.js')
  const { ICONE_IDS } = await carregar('/src/components/minhapagina/icones/icones.js')
  const { LAYOUTS } = await carregar('/src/components/minhapagina/render/layouts/index.js')
  const PaginaRender = (await carregar('/src/components/minhapagina/render/PaginaRender.jsx')).default
  const { normalizarDoc, docGravavel, comCaminho, LISTAS, LIMITES } = modelo
  const { FONTES_V2, FONTE_PADRAO, cssDasFontes, urlDaFonte } = await carregar('/src/utils/pagina/fontes.js')
  const { ESCALA, variaveisDeDesign } = await carregar('/src/utils/pagina/tema.js')

  const html = (bruto, props = {}) => renderToStaticMarkup(React.createElement(PaginaRender, {
    doc: normalizarDoc(bruto), selo: true, escritorio: 'Escritório Exemplo', slug: 'exemplo', ...props,
  }))
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const link = (n, extra = {}) => ({ id: id(n), tipo: 'link', ativo: true, titulo: `Link ${n}`, url: `https://exemplo.com/${n}`, ...extra })
  const IMG = 'https://cdn.exemplo.com/a.jpg'

  // ── normalização tolerante ──
  for (const lixo of [null, undefined, 'texto', 42, [], { v: 2, perfil: 'x', capa: [], aparencia: null, itens: 'x' }]) {
    let erro = null
    try { html(lixo) } catch (e) { erro = e }
    confere(`documento inválido não quebra o render (${JSON.stringify(lixo)})`, !erro, erro?.message)
  }
  const vazio = normalizarDoc({})
  confere('documento vazio = padrões', JSON.stringify(vazio) === JSON.stringify(normalizarDoc(modelo.PADRAO_V2)))
  confere('chave desconhecida some na leitura', !('xyz' in normalizarDoc({ v: 2, xyz: 1 })))
  confere('subtítulo cortado em 40', normalizarDoc({ perfil: { subtitulo: 'x'.repeat(60) } }).perfil.subtitulo.length === LIMITES.subtitulo)

  // ── capas ──
  confere('sem capa: nenhuma imagem de capa', !html({}).includes('pg-capa'))
  confere('banner', html({ capa: { estilo: 'banner', imagem: IMG } }).includes('pg-capa--banner'))
  confere('capa', html({ capa: { estilo: 'capa', imagem: IMG } }).includes('pg-capa--capa'))
  confere('hero', html({ capa: { estilo: 'hero', imagem: IMG } }).includes('pg-capa--hero'))
  confere('foco topo vira object-position', html({ capa: { estilo: 'capa', imagem: IMG, foco: 'topo' } }).includes('object-position:center top'))
  confere('capa sem imagem não desenha capa', !html({ capa: { estilo: 'hero', imagem: null } }).includes('pg-capa'))
  confere('imagem http é descartada', !html({ capa: { estilo: 'capa', imagem: 'http://x.co/a.jpg' } }).includes('pg-capa'))
  // hero: foto, nome, subtítulo e bio DENTRO do bloco da imagem; itens fora, logo abaixo
  const heroDoc = { perfil: { nome: 'Ana', subtitulo: 'Arquitetura', bio: 'Bio', foto: IMG }, capa: { estilo: 'hero', imagem: IMG }, itens: [link(1)] }
  const hHero = html(heroDoc)
  const blocoHero = hHero.slice(hHero.indexOf('pg-capa--hero'), hHero.indexOf('pg-conteudo'))
  confere('hero: foto, nome, subtítulo e bio dentro da imagem',
    ['pg-hero-foto', 'pg-nome', 'pg-subtitulo', 'pg-bio', 'pg-hero-texto'].every(c => blocoHero.includes(c)), blocoHero.slice(0, 300))
  confere('hero: foto antes do nome (nunca sobre ele)', blocoHero.indexOf('pg-hero-foto') < blocoHero.indexOf('pg-nome'))
  confere('hero: itens fora do bloco da imagem', !blocoHero.includes('pg-item') && hHero.indexOf('pg-itens') > hHero.indexOf('pg-conteudo'))
  confere('hero: perfil não se repete fora da imagem', (hHero.match(/class="pg-nome"/g) || []).length === 1)
  const hOculta = html({ ...heroDoc, perfil: { ...heroDoc.perfil, foto_oculta: true } })
  confere('hero: foto ocultável, texto continua na imagem', !hOculta.includes('pg-hero-foto') && hOculta.slice(hOculta.indexOf('pg-capa--hero'), hOculta.indexOf('pg-conteudo')).includes('pg-nome'))
  confere('capa (não hero): perfil fora da imagem', !html({ ...heroDoc, capa: { estilo: 'capa', imagem: IMG } }).includes('pg-hero-texto'))
  confere('banner: foto sobre a capa', html({ perfil: { foto: IMG }, capa: { estilo: 'banner', imagem: IMG } }).includes('pg-foto--sobre-capa'))

  // ── perfil ──
  confere('subtítulo some quando vazio', !html({ perfil: { nome: 'Ana', subtitulo: '  ' } }).includes('pg-subtitulo'))
  const comSub = html({ perfil: { nome: 'Ana', subtitulo: 'Arquitetura', bio: 'Bio' } })
  confere('subtítulo entre o nome e a bio', /pg-nome[^]*pg-subtitulo[^]*pg-bio/.test(comSub))
  confere('nome vazio = nome do escritório', html({}).includes('Escritório Exemplo'))

  // ── itens ──
  const itens = [
    link(1), { id: id(2), tipo: 'secao', ativo: true, titulo: 'Projetos' }, link(3, { estilo: { destaque: true } }),
    link(4, { ativo: false }), link(5, { titulo: ' ' }), link(6, { url: null }),
    { id: id(7), tipo: 'formulario', ativo: true, titulo: 'Form sem slug', formulario_id: id(70) },
    { id: id(8), tipo: 'formulario', ativo: true, titulo: 'Orçamento', formulario_id: id(80), slug_formulario: 'orcamento' },
  ]
  const hItens = html({ itens })
  const ordem = [...hItens.matchAll(/class="pg-item[^"]*"[^>]*>(?:(?!<\/a>).)*?pg-item-titulo">([^<]+)/g)].map(m => m[1])
  confere('ordem é a da lista (destaque antigo ignorado, nada fixado no topo)', ordem[0] === 'Link 1' && ordem[1] === 'Link 3', ordem.join(' | '))
  confere('itens ocultos não aparecem (desativado, sem título, sem URL, formulário sem slug)',
    JSON.stringify(ordem) === JSON.stringify(['Link 1', 'Link 3', 'Orçamento']), ordem.join(' | '))
  confere('título de seção aparece', hItens.includes('<h2 class="pg-secao">Projetos</h2>'))
  confere('seção desativada some', !html({ itens: [{ id: id(2), tipo: 'secao', ativo: false, titulo: 'Oculta' }] }).includes('Oculta'))
  confere('formulário aponta para o slug', hItens.includes('href="/e/exemplo/orcamento"') || hItens.includes('href="/exemplo/orcamento"'))
  const dois = html({ itens: [link(1, { estilo: { destaque: true } }), link(2, { estilo: { destaque: true } })] })
  confere('documento antigo com destaque continua desenhando, sem destaque', !dois.includes('destaque') && (dois.match(/class="pg-item /g) || []).length === 2)
  confere('normalização descarta a chave destaque', normalizarDoc({ itens: [link(1, { estilo: { destaque: true } })] }).itens[0].estilo.destaque === undefined)
  const comDest = { v: 2, futura: 1, itens: [link(1, { estilo: { v: 1, destaque: true, icone: 'link', legado: { a: 1 } } }), { id: id(2), tipo: 'secao', titulo: 'S' }] }
  const limpo = modelo.semDestaque(comDest)
  confere('ao salvar, destaque sai e o resto fica', !('destaque' in limpo.itens[0].estilo) && limpo.itens[0].estilo.icone === 'link' && limpo.itens[0].estilo.legado.a === 1 && limpo.futura === 1 && limpo.itens[1].titulo === 'S')
  confere('ao salvar sem destaque, o documento não muda', modelo.semDestaque(limpo) === limpo)
  confere('itens novos e conversão sem destaque', !JSON.stringify(TIPOS_ITEM.link.criar()).includes('destaque') && !JSON.stringify(converterLegado({}, [{ id: id(1), tipo: 'link', titulo: 'a', url: 'https://a.co', estilo: {} }])).includes('destaque'))

  // ── espaçamentos (PaginaRender.css) ──
  const cssRender = fs.readFileSync(path.join(raiz, 'src/components/minhapagina/render/PaginaRender.css'), 'utf8')
  // corpo da regra CSS cujo seletor é exatamente `sel`
  const regra = sel => {
    const i = cssRender.indexOf(`\n${sel} {`)
    return i < 0 ? '' : cssRender.slice(cssRender.indexOf('{', i) + 1, cssRender.indexOf('}', i))
  }
  confere('entre botões 14px e perfil → 1º botão 36px', /gap:\s*14px/.test(regra('.pg-itens')) && /margin-top:\s*36px/.test(regra('.pg-itens')))
  confere('subtítulo → bio 10px (sem capa, banner, capa)', /margin-top:\s*10px/.test(regra('.pg-subtitulo + .pg-bio')))
  confere('hero: subtítulo → bio continua 6px', /margin-top:\s*6px/.test(regra('.pg-hero-texto .pg-subtitulo + .pg-bio')))
  confere('hero: imagem → 1º botão 28px', /padding-top:\s*28px/.test(regra('.pg-coluna--capa-hero .pg-conteudo')))
  confere('CSS sem regras de destaque', !/destaque/.test(cssRender))

  // ── visual do item ──
  confere('visual nada', html({ itens: [link(1)] }).includes('pg-item pg-item--nada'))
  confere('visual ícone', html({ itens: [link(1, { estilo: { icone: 'instagram' } })] }).includes('pg-item-icone'))
  confere('ícone desconhecido é ignorado', html({ itens: [link(1, { estilo: { icone: 'linkedin' } })] }).includes('pg-item--nada'))
  confere('imagem pequena', html({ itens: [link(1, { imagem_url: IMG, imagem_modo: 'icone' })] }).includes('pg-item-mini'))
  confere('imagem grande', html({ itens: [link(1, { imagem_url: IMG, imagem_modo: 'banner' })] }).includes('pg-item-banner'))
  confere('imagem vence o ícone', !html({ itens: [link(1, { imagem_url: IMG, estilo: { icone: 'link' } })] }).includes('pg-item-icone'))
  confere('descrição curta', html({ itens: [link(1, { descricao: 'Siga a gente' })] }).includes('pg-item-desc">Siga a gente'))
  confere('estilo próprio vira variável só no item', html({ itens: [link(1, { estilo: { botao: { cor: '#ff0000' } } })] }).includes('--pg-botao-fundo:#ff0000'))

  // ── segurança ──
  const perigoso = html({ itens: [link(1, { url: 'javascript:alert(1)' }), link(2, { url: 'https://ok.com', titulo: '<script>x</script>' })],
    perfil: { foto: 'javascript:alert(1)' }, aparencia: { cor_texto: 'red;background:url(x)' } })
  confere('nenhum href javascript:', !/href="javascript:/i.test(perigoso))
  confere('texto escapado', !perigoso.includes('<script>'))
  confere('cor inválida não vira CSS', !perigoso.includes('url(x)'))
  for (const src of [...html({ perfil: { foto: IMG }, capa: { estilo: 'capa', imagem: IMG }, itens: [link(1, { imagem_url: IMG })] }).matchAll(/src="([^"]+)"/g)].map(m => m[1])) {
    confere(`imagem só https ou do próprio app (${src})`, src.startsWith('https://') || src.startsWith('/'))
  }

  // ── selo em todos os layouts; nada de plano no HTML ──
  for (const l of LAYOUTS) {
    confere(`selo aparece no layout ${l.id}`, html({ layout: l.id }, { selo: true }).includes('Feito com Prolu'))
    confere(`sem selo no layout ${l.id}`, !html({ layout: l.id }, { selo: false }).includes('Feito com Prolu'))
  }
  const tudo = html({ perfil: { nome: 'Ana', subtitulo: 'Sub', bio: 'Bio', foto: IMG }, capa: { estilo: 'hero', imagem: IMG }, itens })
  confere('HTML sem menção a plano/limite', !/plano|starter|upgrade|limite/i.test(tudo))
  confere('prévia: links não navegam (tabindex -1)', html({ itens: [link(1)] }, { modo: 'previa' }).includes('tabindex="-1"'))
  confere('prévia: altura da tela vem da moldura', html({}, { modo: 'previa', alturaTela: 700 }).includes('--pg-altura-tela:700px'))

  // ── conversão da página antiga ──
  const antigo = converterLegado(
    { publicada: true, nome_exibicao: 'Isa', bio: 'Oi', banner_url: IMG, fonte: 'Lato', botao_arredondamento: 'full', rodape_prolu: false, cor_texto_bio: '#333333', fundo_pattern_opacity: 0.2 },
    [{ id: id(1), tipo: 'link', titulo: 'Site', url: 'https://a.co', ativo: true, imagem_url: IMG, imagem_modo: null, estilo: { botao_cor: '#ff0000', outra: 1 } },
     { id: id(2), tipo: 'formulario', titulo: 'Orçamento', formulario_id: id(9), ativo: false, estilo: {} }],
  )
  confere('legado: nome, bio e capa banner', antigo.perfil.nome === 'Isa' && antigo.capa.estilo === 'banner' && antigo.capa.imagem === IMG)
  confere('legado: cantos e fonte (Lato → Inter)', antigo.aparencia.botao.cantos === 'full' && antigo.aparencia.fonte === 'Inter' && docGravavel(antigo).aparencia.fonte === 'Inter')
  for (const [antiga, nova] of [['Rubik', 'Work Sans'], ['Lato', 'Inter'], ['Raleway', 'Josefin Sans'], ['Libre Baskerville', 'Lora'], ['Abhaya Libre', 'Lora'], ['Playfair Display', 'Playfair Display']]) {
    confere(`legado: ${antiga} → ${nova}`, docGravavel(converterLegado({ fonte: antiga }, [])).aparencia.fonte === nova)
  }
  confere('legado: página antiga sem fonte = Inter (o padrão de lá)', converterLegado({}, []).aparencia.fonte === 'Inter' && docGravavel(converterLegado({}, [])).aparencia.fonte === 'Inter')
  confere('legado: gravável sem fonte_titulo/fonte_corpo', !('fonte_titulo' in docGravavel(antigo).aparencia) && !('fonte_corpo' in docGravavel(antigo).aparencia))
  confere('legado: selo e cor da bio', antigo.selo === false && antigo.aparencia.cor_texto_suave === '#333333')
  confere('legado: ids e ordem mantidos', antigo.itens.map(i => i.id).join() === [id(1), id(2)].join())
  confere('legado: imagem sem modo = pequena', antigo.itens[0].imagem_modo === 'icone')
  confere('legado: estilo de botão e chave desconhecida preservada', antigo.itens[0].estilo.botao.cor === '#ff0000' && antigo.itens[0].estilo.legado.outra === 1)
  const gravavel = docGravavel(antigo)
  confere('gravável: legado preservado e v=1', gravavel.itens[0].estilo.legado?.outra === 1 && gravavel.itens[0].estilo.v === 1)
  confere('gravável: sem botao null', gravavel.itens.every(it => it.tipo === 'secao' || !('botao' in it.estilo) || it.estilo.botao))
  confere('gravável: sem slug_formulario', !JSON.stringify(gravavel).includes('slug_formulario'))

  // ── itens novos nascem válidos ──
  for (const [tipo, t] of Object.entries(TIPOS_ITEM)) {
    const novo = t.criar({ id: id(5), nome: 'Form' })
    confere(`item novo (${tipo}) passa na normalização`, modelo.UUID_RE.test(novo.id) && normalizarDoc({ itens: [novo] }).itens.length === 1)
  }

  // ── edição preserva o que não conhece ──
  const editado = comCaminho({ v: 2, futura: { a: 1 }, perfil: { nome: 'A', chave_nova: true } }, ['perfil', 'nome'], 'B')
  confere('comCaminho preserva chaves desconhecidas', editado.futura.a === 1 && editado.perfil.chave_nova === true && editado.perfil.nome === 'B')

  // ── ícones ──
  const sugestoes = {
    'https://www.instagram.com/x': 'instagram', 'https://wa.me/5511999999999': 'whatsapp', 'https://youtu.be/abc': 'youtube',
    'https://br.pinterest.com/x': 'pinterest', 'https://www.linkedin.com/in/x': 'maleta', 'https://maps.app.goo.gl/abc': 'google-maps',
    'https://www.google.com/maps/place/x': 'google-maps', 'tel:+5511999999999': 'telefone', 'mailto:a@b.co': 'email',
    'https://site.com/catalogo.pdf': 'documento', 'https://meusite.com.br': 'link', 'https://x.com/a': 'x',
  }
  for (const [url, esperado] of Object.entries(sugestoes)) confere(`ícone sugerido para ${url}`, sugerirIcone(url) === esperado, sugerirIcone(url))
  confere('29 ícones', ICONE_IDS.length === 29, ICONE_IDS.length)

  // ── paridade das listas com as migrations 056 + 057 (vale a definição mais recente) ──
  const sql = ['supabase/migration_056_minha_pagina_v2.sql', 'supabase/migration_057_minha_pagina_fontes_botoes.sql']
    .map(f => fs.readFileSync(path.join(raiz, f), 'utf8')).join('\n')
  const lista = nome => {
    const m = [...sql.matchAll(new RegExp(`${nome} constant text\\[\\] := array\\[([^\\]]+)\\]`, 'g'))].pop()
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null
  }
  const igual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  confere('SQL x JS: fontes', igual(lista('FONTES') || [], LISTAS.fonte), lista('FONTES'))
  confere('SQL x JS: padrões', igual(lista('PADROES') || [], LISTAS.fundo_pattern))
  confere('SQL x JS: texturas e luz', igual(lista('IMAGENS_FUNDO') || [], LISTAS.fundo_imagem))
  confere('SQL x JS: ícones', igual(lista('ICONES') || [], LISTAS.icone))
  confere('SQL x JS: fontes legadas (fonte_titulo/fonte_corpo)', igual(lista('FONTES_LEGADAS') || [], LISTAS.fonte_legada), lista('FONTES_LEGADAS'))
  confere('SQL x JS: elementos', igual(lista('ELEMENTOS') || [], LISTAS.elemento))
  confere('SQL x JS: tamanhos', igual(lista('TAMANHOS') || [], LISTAS.tamanho))
  confere('SQL x JS: contorno 0-3', sql.includes("b->'contorno' in ('0'::jsonb, '1'::jsonb, '2'::jsonb, '3'::jsonb)") && igual(LISTAS.botao_contorno.map(String), ['0', '1', '2', '3']))
  confere('fontes.js x LISTAS', igual(FONTES_V2.map(f => f.id), LISTAS.fonte) && FONTES_V2.length === 12)
  for (const [chave, trecho] of [['layout', "_pv2_opc(d, 'layout', array["], ['capa_estilo', "_pv2_opc(c, 'estilo', array["], ['capa_foco', "_pv2_opc(c, 'foco', array["], ['item_tipo', "_pv2_opc(it, 'tipo', array["]]) {
    const i = sql.indexOf(trecho)
    const valores = i >= 0 ? [...sql.slice(i, sql.indexOf(']', i)).matchAll(/'([^']+)'/g)].map(x => x[1]).slice(1) : []
    confere(`SQL x JS: ${chave}`, igual(valores, LISTAS[chave]), valores)
  }

  // ── fontes e tamanhos ──
  const vars = d => variaveisDeDesign(normalizarDoc(d))
  const vPadrao = vars({})
  confere('ausente = Montserrat em tudo', FONTE_PADRAO === 'Montserrat' && ['--pg-fonte', '--pg-fonte-titulo', '--pg-fonte-subtitulo', '--pg-fonte-descricao', '--pg-fonte-botoes'].every(k => vPadrao[k].startsWith("'PG Montserrat'")))
  confere('ausente = tamanho M (o de antes)', vPadrao['--pg-tam-titulo'] === '20px' && vPadrao['--pg-tam-subtitulo'] === '14px' && vPadrao['--pg-tam-descricao'] === '14px' && vPadrao['--pg-tam-botoes'] === '15px' && vPadrao['--pg-botao-altura'] === '48px' && vPadrao['--pg-botao-py'] === '12px' && vPadrao['--pg-botao-px'] === '20px')
  for (const f of FONTES_V2) {
    const v = vars({ aparencia: { fonte: f.id } })
    confere(`fonte ${f.id} vira família e peso real`, v['--pg-fonte'] === f.familia && v['--pg-peso-titulo'] === (f.pesos.includes(700) ? 700 : 400))
  }
  confere('DM Serif Display: negrito usa 400 (sem peso falso)', vars({ aparencia: { fonte: 'DM Serif Display' } })['--pg-peso-botoes'] === 400)
  const vEl = vars({ aparencia: { fonte: 'Inter', fontes: { titulo: 'Oswald', subtitulo: null, descricao: 'Lora', botoes: 'Poppins' } } })
  confere('fonte por elemento', vEl['--pg-fonte-titulo'].startsWith("'PG Oswald'") && vEl['--pg-fonte-descricao'].startsWith("'PG Lora'") && vEl['--pg-fonte-botoes'].startsWith("'PG Poppins'"))
  confere('"Igual à principal" (null) usa a principal', vEl['--pg-fonte-subtitulo'].startsWith("'PG Inter'"))
  const vDesc = vars({ aparencia: { fonte: 'Comic Sans', fontes: { titulo: 'Papyrus' }, tamanhos: { titulo: 'xg' } } })
  confere('fonte desconhecida ignorada', vDesc['--pg-fonte'].startsWith("'PG Montserrat'") && vDesc['--pg-fonte-titulo'].startsWith("'PG Montserrat'") && vDesc['--pg-tam-titulo'] === '20px')
  const vLeg = vars({ aparencia: { fonte_titulo: 'Playfair Display', fonte_corpo: 'Inter' } })
  confere('rascunho antigo: fonte_corpo = principal, fonte_titulo = título', vLeg['--pg-fonte'].startsWith("'PG Inter'") && vLeg['--pg-fonte-titulo'].startsWith("'PG Playfair Display'"))
  const vLeg2 = vars({ aparencia: { fonte_titulo: 'Libre Baskerville', fonte_corpo: 'Rubik' } })
  confere('rascunho antigo com fonte que saiu da lista vira a mais próxima', vLeg2['--pg-fonte'].startsWith("'PG Work Sans'") && vLeg2['--pg-fonte-titulo'].startsWith("'PG Lora'"))

  // ── self-host: @font-face só das fontes usadas, arquivos no app, nada de terceiros ──
  const css1 = cssDasFontes(['Oswald', 'Oswald', 'Comic Sans'])
  confere('@font-face só das fontes pedidas (e sem repetir)', (css1.match(/@font-face/g) || []).length === 2 && css1.includes("'PG Oswald'") && !css1.includes('Comic'))
  confere('@font-face com font-display: swap e woff2 do próprio app', css1.includes('font-display:swap') && css1.includes("src:url(/fonts/oswald-400.woff2) format('woff2')"))
  confere('DM Serif Display: só o 400', (cssDasFontes(['DM Serif Display']).match(/@font-face/g) || []).length === 1)
  for (const f of FONTES_V2) for (const peso of f.pesos) {
    const arq = path.join(raiz, 'public', urlDaFonte(f.id, peso))
    confere(`arquivo ${urlDaFonte(f.id, peso)} existe`, fs.existsSync(arq) && fs.statSync(arq).size > 4000)
  }
  confere('public/fonts/LICENCAS.txt com as 12 fontes', (() => { const t = fs.readFileSync(path.join(raiz, 'public/fonts/LICENCAS.txt'), 'utf8'); return FONTES_V2.every(f => t.includes(`${f.id} (@fontsource/`)) && t.includes('SIL OPEN FONT LICENSE Version 1.1') })())
  const fontesDoRender = ['src/utils/pagina/fontes.js', 'src/utils/pagina/tema.js', 'src/components/minhapagina/render/PaginaRender.jsx', 'src/components/minhapagina/render/PaginaRender.css', 'src/components/minhapagina/render/partes.jsx', 'src/components/minhapagina/render/layouts/Classico.jsx']
  confere('render e fontes sem serviço de fontes de terceiros', fontesDoRender.every(f => !/fonts.googleapis|fonts.gstatic|use.typekit|fonts.bunny/.test(fs.readFileSync(path.join(raiz, f), 'utf8'))))
  for (const el of LISTAS.elemento) for (const t of LISTAS.tamanho) {
    const v = vars({ aparencia: { tamanhos: { [el]: t } } })
    const esperado = el === 'botoes' ? `${ESCALA.botoes[t].fonte}px` : `${ESCALA[el][t]}px`
    confere(`tamanho ${el} ${t.toUpperCase()}`, v[`--pg-tam-${el}`] === esperado, v[`--pg-tam-${el}`])
  }
  confere('escala crescente e com teto para 360px', LISTAS.elemento.every(el => {
    const xs = LISTAS.tamanho.map(t => (el === 'botoes' ? ESCALA.botoes[t].fonte : ESCALA[el][t]))
    return xs.every((x, i) => i === 0 || x > xs[i - 1]) && Math.max(...xs) <= 28
  }) && ESCALA.botoes.p.altura >= 44)
  confere('botão G/GG ajusta altura e padding', ESCALA.botoes.gg.altura > ESCALA.botoes.g.altura && ESCALA.botoes.g.py > ESCALA.botoes.m.py)
  confere('render usa as variáveis de fonte/tamanho', html({ aparencia: { tamanhos: { titulo: 'gg' } } }).includes('--pg-tam-titulo:28px'))

  // ── botões: preenchimento, contorno e texto independentes ──
  const bVars = d => vars(d)
  const solidoAntigo = bVars({ aparencia: { botao: { estilo: 'solido', cor: '#112233', cor_texto: '#ffffff' } } })
  confere('Sólido de antes: mesmo visual (preenchimento + borda de 2px que não aparece)', solidoAntigo['--pg-botao-fundo'] === '#112233' && solidoAntigo['--pg-botao-borda'] === '2px solid transparent' && solidoAntigo['--pg-botao-texto'] === '#ffffff')
  const contornoAntigo = bVars({ aparencia: { botao: { estilo: 'contorno', cor_contorno: '#445566', espessura_contorno: 3, cor_texto_contorno: '' } } })
  confere('Contorno de antes: mesmo visual', contornoAntigo['--pg-botao-fundo'] === 'transparent' && contornoAntigo['--pg-botao-borda'] === '3px solid #445566' && contornoAntigo['--pg-botao-texto'] === '#445566')
  const ambos = bVars({ aparencia: { botao: { estilo: 'solido', preenchimento: '#ffffff', contorno: 2, cor_contorno: '#ff0000', texto: '#000000' } } })
  confere('preenchimento E contorno de cor diferente', ambos['--pg-botao-fundo'] === '#ffffff' && ambos['--pg-botao-borda'] === '2px solid #ff0000' && ambos['--pg-botao-texto'] === '#000000')
  confere('sem preenchimento e sem contorno', bVars({ aparencia: { botao: { preenchimento: 'nenhum', contorno: 0, texto: '#000000' } } })['--pg-botao-fundo'] === 'transparent')
  confere('sem variáveis de destaque', !Object.keys(ambos).some(k => k.includes('destaque')))
  const hProprio = html({ itens: [link(1, { estilo: { botao: { preenchimento: 'nenhum', contorno: 3, cor_contorno: '#123456', texto: '#123456', cantos: 'full' } } }), link(2)] })
  confere('estilo próprio: preenchimento/contorno/texto/cantos só no item', hProprio.includes('--pg-botao-fundo:transparent') && hProprio.includes('--pg-botao-borda:3px solid #123456') && hProprio.includes('--pg-raio:9999px') && (hProprio.match(/style="--pg-botao/g) || []).length === 1)
  const hLegItem = html({ itens: [link(1, { estilo: { botao: { estilo: 'contorno', cor_contorno: '#abcdef' } } })] })
  confere('estilo próprio antigo (Contorno) deriva o modelo novo', hLegItem.includes('--pg-botao-fundo:transparent') && hLegItem.includes('solid #abcdef'))
  confere('item com só cantos próprios mantém o botão da página', html({ aparencia: { botao: { estilo: 'solido', cor: '#112233' } }, itens: [link(1, { estilo: { botao: { cantos: 'full' } } })] }).includes('--pg-botao-fundo:#112233;'))

  // ── editor: as 3 áreas desenham sem erro (dados fictícios, sem banco) ──
  // ambiente mínimo de navegador para os componentes do editor (prolu.link, tela larga)
  globalThis.window = { location: new URL('https://prolu.link/minha-pagina'), matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }
  const avisoOriginal = console.error
  console.error = (msg, ...resto) => { if (!String(msg).includes('useLayoutEffect')) avisoOriginal(msg, ...resto) }
  const { MemoryRouter } = await carregar('react-router-dom')
  const { ToastProvider } = await carregar('/src/contexts/ToastContext.jsx')
  const AreaConteudo = (await carregar('/src/screens/minhapagina/AreaConteudo.jsx')).default
  const AreaAparencia = (await carregar('/src/screens/minhapagina/AreaAparencia.jsx')).default
  const AreaPublicacao = (await carregar('/src/screens/minhapagina/AreaPublicacao.jsx')).default
  const docEditor = docGravavel({
    v: 2, perfil: { nome: 'Ana', subtitulo: 'Sub', foto: IMG }, capa: { estilo: 'hero', imagem: null },
    itens: [link(1, { estilo: { destaque: true, botao: { cor: '#ff0000' } } }), link(2, { estilo: { icone: 'instagram' } }),
      link(3, { imagem_url: IMG, imagem_modo: 'banner' }), { id: id(4), tipo: 'secao', ativo: true, titulo: 'Seção' },
      { id: id(5), tipo: 'formulario', ativo: true, titulo: 'Form', formulario_id: id(50) }],
  })
  const comum = { doc: docEditor, docNormal: normalizarDoc(docEditor), alterar: () => {}, alterarDoc: () => {}, empresa: { nome: 'Esc', slug: 'esc' }, empresaId: id(99), off: false, toast: () => {} }
  const servidorFicticio = { existe: true, revisao: 3, noAr: false, temPublicado: true, pendente: true, publicado: normalizarDoc(docEditor), legado: { noAr: false, config: {} } }
  for (const [nome, el] of [
    ['Conteúdo', React.createElement(AreaConteudo, { ...comum, formularios: [{ id: id(50), nome: 'Form', slug: 'form', ativo: true }] })],
    ['Aparência', React.createElement(AreaAparencia, comum)],
    ['Publicação', React.createElement(AreaPublicacao, { ...comum, servidor: servidorFicticio, seloFixo: true, onDefinirNoAr: () => {} })],
  ]) {
    let saida = ''
    let erro = null
    try { saida = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ToastProvider, null, el))) } catch (e) { erro = e }
    confere(`editor: área ${nome} desenha`, !erro && saida.length > 0, erro?.stack)
    if (nome === 'Conteúdo') {
      confere('editor: sem destaque (sem "Destacar", sem selo), ordem da lista', !/Destaque|Destacar/.test(saida) && saida.indexOf('value="Link 1"') < saida.indexOf('value="Link 2"'))
      confere('editor: Perfil sem foto e sem capa (só nome, subtítulo, bio)', !saida.includes('Foto de perfil') && !saida.includes('Ajustar em Aparência') && !saida.includes('Formato da foto'))
      confere('editor: ícone compacto (botão Trocar, grade fechada)', saida.includes('mpe-icone-seletor') && saida.includes('>Trocar<') && !saida.includes('mpe-icone-pop'))
      confere('editor: estilo próprio continua no item', saida.includes('Estilo próprio'))
      confere('editor: subtítulo com limite de 40', saida.includes('maxLength="40"') || saida.includes('maxlength="40"'))
    }
    if (nome === 'Aparência') {
      confere('editor: capa hero sem imagem avisa', saida.includes('precisa de uma imagem'))
      confere('editor: dica do Hero', saida.includes('Imagem alta com o nome sobre ela. Ex.: 1440×1440 px. JPG, PNG ou WEBP.'))
      confere('editor: Cabeçalho com foto de perfil e capa', /id="mpe-cabecalho">Cabeçalho[^]*Foto de perfil[^]*Formato da foto de perfil[^]*id="mpe-capa">Capa[^]*Estilo da capa/.test(saida))
      confere('editor: ordem Layout, Cabeçalho, Botões, Fundo, Texto', ['id="mpe-layout"', 'id="mpe-cabecalho"', 'id="mpe-botoes"', 'id="mpe-fundo"', 'id="mpe-texto"'].map(x => saida.indexOf(x)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])))
      confere('editor: Botões sem "Avançado" e sem cor do destaque', (() => { const b = saida.slice(saida.indexOf('id="mpe-botoes"'), saida.indexOf('id="mpe-fundo"')); return !b.includes('Avançado') && !/destaque/i.test(b) && b.includes('Cantos dos botões') && b.includes('Sombra dos botões') })())
      confere('editor: atalhos Sólido e Contorno + controles independentes', ['>Sólido<', '>Contorno<', 'Preenchimento', 'Sem preenchimento', '>Nenhum<'].every(t => saida.includes(t)))
      confere('editor: fonte principal e "Por elemento" recolhido', saida.includes('Fonte principal') && /<details class="mpe-avancado"><summary>Por elemento/.test(saida) && saida.includes('Igual à principal'))
      confere('editor: 12 fontes na lista', (saida.match(/<option value="Space Grotesk">/g) || []).length >= 1 && !saida.includes('<option value="Rubik">'))
      confere('editor: layouts não implementados "Em breve" e desabilitados', (saida.match(/Em breve/g) || []).length === 3 && [...saida.matchAll(/<button[^>]*>/g)].filter(m => m[0].includes('em-breve') && m[0].includes('disabled')).length === 3)
    }
    if (nome === 'Publicação') {
      confere('editor: hiperlink para Configurações → Escritório', saida.includes('href="/configuracoes?tab=escritorio#endereco"'))
      confere('editor: selo travado no Starter', /aria-checked="true"[^>]*disabled=""[^>]*>|disabled=""[^>]*aria-checked="true"/.test(saida) || saida.includes('Ver planos'))
    }
  }

  // ── backup real (opcional, fora do git) ──
  const pastaBackup = path.join(raiz, 'scripts/_backup_minha_pagina')
  const backups = fs.existsSync(pastaBackup) ? fs.readdirSync(pastaBackup).filter(f => f.endsWith('.json')) : []
  for (const arq of backups) {
    let dados
    try { dados = JSON.parse(fs.readFileSync(path.join(pastaBackup, arq), 'utf8')) } catch { confere(`backup ${arq} legível`, false); continue }
    // formato do SQL Editor: [{ backup: '<texto JSON>' }] (jsonb_pretty devolve texto)
    let corpo = Array.isArray(dados) ? dados[0]?.backup : dados.backup ?? dados
    if (typeof corpo === 'string') corpo = JSON.parse(corpo)
    const lista = Array.isArray(corpo?.paginas) ? corpo.paginas : []
    confere(`backup ${arq}: tem páginas`, lista.length > 0)
    for (const p of lista) {
      const doc = docGravavel(converterLegado(p.pagina_config, p.links || []))
      let erro = null
      try { html(doc, { escritorio: p.escritorio, slug: p.slug }) } catch (e) { erro = e }
      confere(`backup ${p.slug}: converte e desenha`, !erro, erro?.message)
      confere(`backup ${p.slug}: todos os links convertidos`, doc.itens.length === (p.links || []).length, `${doc.itens.length} de ${(p.links || []).length}`)
    }
    console.log(`backup ${arq}: ${lista.length} página(s) conferida(s)`)
  }
} catch (e) {
  total++
  falhas++
  console.log('ERRO no teste:', e)
} finally {
  await vite.close()
}

console.log(`\n${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ''}`)
process.exit(falhas ? 1 : 0)
