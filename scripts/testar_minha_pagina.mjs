// Testes da Minha Página v2 sem navegador e sem dependência nova:
// carrega os módulos pelo próprio Vite (ssrLoadModule) e desenha o render
// único com react-dom/server (renderToStaticMarkup).
//
//   node scripts/testar_minha_pagina.mjs
//
// Confere: normalização tolerante, capas, subtítulo, destaque, visual dos
// itens, itens ocultos, selo em todos os layouts, nada de plano/limite no
// HTML, só https nas imagens, conversão da página antiga, sugestão de ícone,
// edição que preserva chaves e a paridade das listas com a migration_056.
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
  const comFoto = { perfil: { foto: IMG }, capa: { estilo: 'hero', imagem: IMG } }
  confere('hero: foto pequena abaixo', html(comFoto).includes('pg-foto--hero'))
  confere('hero: foto ocultável', !html(comFoto ? { ...comFoto, perfil: { foto: IMG, foto_oculta: true } } : {}).includes('pg-foto'))
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
  confere('destaque sempre no topo', ordem[0] === 'Link 3', ordem.join(' | '))
  confere('itens ocultos não aparecem (desativado, sem título, sem URL, formulário sem slug)',
    JSON.stringify(ordem) === JSON.stringify(['Link 3', 'Link 1', 'Orçamento']), ordem.join(' | '))
  confere('título de seção aparece', hItens.includes('<h2 class="pg-secao">Projetos</h2>'))
  confere('seção desativada some', !html({ itens: [{ id: id(2), tipo: 'secao', ativo: false, titulo: 'Oculta' }] }).includes('Oculta'))
  confere('formulário aponta para o slug', hItens.includes('href="/e/exemplo/orcamento"') || hItens.includes('href="/exemplo/orcamento"'))
  const dois = html({ itens: [link(1, { estilo: { destaque: true } }), link(2, { estilo: { destaque: true } })] })
  confere('dois destaques: só um é desenhado como destaque', (dois.match(/pg-item--destaque/g) || []).length === 1)

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
  confere('legado: cantos e fonte', antigo.aparencia.botao.cantos === 'full' && antigo.aparencia.fonte_titulo === 'Lato')
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

  // ── paridade das listas com a migration_056 ──
  const sql = fs.readFileSync(path.join(raiz, 'supabase/migration_056_minha_pagina_v2.sql'), 'utf8')
  const lista = nome => {
    const m = sql.match(new RegExp(`${nome} constant text\\[\\] := array\\[([^\\]]+)\\]`))
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null
  }
  const igual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  confere('SQL x JS: fontes', igual(lista('FONTES') || [], LISTAS.fonte), lista('FONTES'))
  confere('SQL x JS: padrões', igual(lista('PADROES') || [], LISTAS.fundo_pattern))
  confere('SQL x JS: texturas e luz', igual(lista('IMAGENS_FUNDO') || [], LISTAS.fundo_imagem))
  confere('SQL x JS: ícones', igual(lista('ICONES') || [], LISTAS.icone))
  for (const [chave, trecho] of [['layout', "_pv2_opc(d, 'layout', array["], ['capa_estilo', "_pv2_opc(c, 'estilo', array["], ['capa_foco', "_pv2_opc(c, 'foco', array["], ['item_tipo', "_pv2_opc(it, 'tipo', array["]]) {
    const i = sql.indexOf(trecho)
    const valores = i >= 0 ? [...sql.slice(i, sql.indexOf(']', i)).matchAll(/'([^']+)'/g)].map(x => x[1]).slice(1) : []
    confere(`SQL x JS: ${chave}`, igual(valores, LISTAS[chave]), valores)
  }

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
    ['Conteúdo', React.createElement(AreaConteudo, { ...comum, formularios: [{ id: id(50), nome: 'Form', slug: 'form', ativo: true }], irParaCapa: () => {} })],
    ['Aparência', React.createElement(AreaAparencia, comum)],
    ['Publicação', React.createElement(AreaPublicacao, { ...comum, servidor: servidorFicticio, seloFixo: true, onDefinirNoAr: () => {} })],
  ]) {
    let saida = ''
    let erro = null
    try { saida = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ToastProvider, null, el))) } catch (e) { erro = e }
    confere(`editor: área ${nome} desenha`, !erro && saida.length > 0, erro?.stack)
    if (nome === 'Conteúdo') {
      confere('editor: destaque primeiro na lista, com selo', /Destaque<\/span>[^]*?value="Link 1"/.test(saida) && saida.indexOf('value="Link 1"') < saida.indexOf('value="Link 2"'))
      confere('editor: subtítulo com limite de 40', saida.includes('maxLength="40"') || saida.includes('maxlength="40"'))
    }
    if (nome === 'Aparência') {
      confere('editor: capa hero sem imagem avisa', saida.includes('precisa de uma imagem'))
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
