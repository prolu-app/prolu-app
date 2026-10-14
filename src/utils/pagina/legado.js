// Página antiga (empresas.pagina_config + pagina_links, migrations 041/042)
// → documento v2. Só monta o primeiro rascunho no editor novo: não grava nem
// apaga nada do formato antigo. Os links mantêm o id (estável entre rascunho
// e publicado). Do estilo antigo de cada link, as chaves de botão viram
// estilo.botao; qualquer outra chave vai para estilo.legado (preservada,
// ignorada no desenho e fora da resposta pública).

import { VERSAO } from './modelo.js'
import { fonteDaLista } from './fontes.js'

const BOTAO_ANTIGO = {
  botao_estilo: 'estilo', botao_cor: 'cor', botao_cor_texto: 'cor_texto', botao_cor_contorno: 'cor_contorno',
  botao_cor_texto_contorno: 'cor_texto_contorno', botao_espessura_contorno: 'espessura_contorno',
  botao_arredondamento: 'cantos', botao_sombra: 'sombra',
}

const def = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

function estiloDoLink(estilo) {
  const e = estilo && typeof estilo === 'object' ? estilo : {}
  const botao = {}
  const legado = {}
  for (const [k, v] of Object.entries(e)) {
    if (BOTAO_ANTIGO[k]) botao[BOTAO_ANTIGO[k]] = v
    else legado[k] = v
  }
  return def({
    v: 1,
    botao: Object.keys(botao).length ? botao : undefined,
    legado: Object.keys(legado).length ? legado : undefined,
  })
}

// config: pagina_config cru (chaves ausentes ficam ausentes: o padrão v2 vale)
// links: linhas de pagina_links já na ordem (ordem, created_at)
export function converterLegado(config, links = []) {
  const c = config && typeof config === 'object' ? config : {}
  const botao = def(Object.fromEntries(Object.entries(BOTAO_ANTIGO).map(([antiga, nova]) => [nova, c[antiga]])))
  const fundo = def({
    tipo: c.fundo_tipo, cor: c.fundo_cor, pattern: c.fundo_pattern, pattern_cor: c.fundo_pattern_cor,
    pattern_opacidade: c.fundo_pattern_opacity, imagem: c.fundo_imagem, imagem_opacidade: c.fundo_imagem_opacity,
  })
  return def({
    v: VERSAO,
    layout: 'classico',
    perfil: def({ nome: c.nome_exibicao, bio: c.bio, foto: c.foto_perfil || null, foto_formato: c.foto_perfil_formato }),
    capa: c.banner_url ? { estilo: 'banner', imagem: c.banner_url, foco: 'centro' } : { estilo: 'nenhuma', imagem: null, foco: 'centro' },
    aparencia: def({
      // ausente na página antiga = Inter (padrão de lá); as que saíram da lista
      // viram a mais próxima (Rubik → Work Sans, Lato → Inter…)
      fonte: fonteDaLista(c.fonte || 'Inter') || undefined,
      cor_texto: c.cor_texto, cor_texto_suave: c.cor_texto_bio,
      fundo: Object.keys(fundo).length ? fundo : undefined,
      botao: Object.keys(botao).length ? botao : undefined,
    }),
    selo: typeof c.rodape_prolu === 'boolean' ? c.rodape_prolu : undefined,
    itens: links.map(l => (l.tipo === 'formulario'
      ? { id: l.id, tipo: 'formulario', ativo: l.ativo !== false, titulo: l.titulo || '', descricao: '', url: null,
          formulario_id: l.formulario_id || null, imagem_url: l.imagem_url || null, imagem_modo: l.imagem_url ? (l.imagem_modo || 'icone') : null,
          estilo: estiloDoLink(l.estilo) }
      : { id: l.id, tipo: 'link', ativo: l.ativo !== false, titulo: l.titulo || '', descricao: '', url: l.url || null,
          formulario_id: null, imagem_url: l.imagem_url || null, imagem_modo: l.imagem_url ? (l.imagem_modo || 'icone') : null,
          estilo: estiloDoLink(l.estilo) })),
  })
}
