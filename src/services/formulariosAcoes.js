import { supabase } from './supabaseClient.js'
import { comSufixo } from '../utils/slug.js'

// Excluir e duplicar formulário — usados pela listagem (/formularios) e pelo
// editor. RLS: a policy "master escreve no proprio escritorio" de formularios
// e formulario_campos (migration_025) é `for all`, então já cobre delete e
// insert — só master/prolu_admin do escritório dono.
//
// Ao excluir: formulario_campos sai junto (on delete cascade); registros do
// CRM e fichas que vieram do formulário ficam (formulario_id vira null,
// migration_026). Logo/capa no bucket são apagados antes (ver abaixo).

const BUCKET = 'formularios-assets'

// arquivos do formulário no bucket: <empresa_id>/<formulario_id>/...
async function arquivosDoFormulario(form) {
  const pasta = `${form.empresa_id}/${form.id}`
  const { data } = await supabase.storage.from(BUCKET).list(pasta, { limit: 100 })
  return (data || []).filter(a => a.id).map(a => `${pasta}/${a.name}`)
}

export async function excluirFormulario(form) {
  // logo/capa ANTES do formulário: a policy do bucket (migration_029) só deixa
  // mexer na pasta de um formulário que ainda existe. Falha aqui não impede a
  // exclusão (no máximo sobra arquivo órfão).
  try {
    const caminhos = await arquivosDoFormulario(form)
    if (caminhos.length) await supabase.storage.from(BUCKET).remove(caminhos)
  } catch (e) { console.warn('[formularios] apagar arquivos', e) }

  // .select(): com RLS bloqueando, o delete não dá erro, só não apaga nada
  const { data, error } = await supabase.from('formularios').delete().eq('id', form.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Sem permissão para excluir este formulário')
}

const SEM_COPIAR = ['id', 'created_at', 'updated_at']
const semColunas = (obj, colunas) => Object.fromEntries(Object.entries(obj).filter(([k]) => !colunas.includes(k)))

// Cópia: mesmo conteúdo, configurações e campos (respostas não — elas estão no
// CRM). Nome "(cópia)", endereço <slug>-copia (sufixo se já existir) e começa
// inativa, para não ficar no ar sem querer. Logo/capa são copiados para a
// pasta da cópia: se apontassem para os mesmos arquivos, trocar a imagem num
// formulário apagaria a do outro.
export async function duplicarFormulario(origemId) {
  const [{ data: f, error: e1 }, { data: campos, error: e2 }] = await Promise.all([
    supabase.from('formularios').select('*').eq('id', origemId).single(),
    supabase.from('formulario_campos').select('*').eq('formulario_id', origemId).order('ordem'),
  ])
  if (e1 || e2 || !f) throw e1 || e2 || new Error('Formulário não encontrado')

  const base = `${f.slug.slice(0, 54)}-copia`
  const dados = {
    ...semColunas(f, [...SEM_COPIAR, 'slug', 'logo_url', 'capa_url']),
    nome: `${f.nome} (cópia)`,
    ativo: false,
  }
  let novo = null
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data, error } = await supabase.from('formularios')
      .insert({ ...dados, slug: tentativa ? comSufixo(base) : base })
      .select('*').single()
    if (!error) { novo = data; break }
    if (error.code !== '23505') throw error // 23505 = endereço já usado: tenta com sufixo
  }
  if (!novo) throw new Error('Não foi possível gerar um endereço para a cópia')

  if (campos?.length) {
    const { error } = await supabase.from('formulario_campos')
      .insert(campos.map(c => ({ ...semColunas(c, SEM_COPIAR), formulario_id: novo.id })))
    if (error) {
      // sem os campos a cópia ficaria pela metade: desfaz
      await supabase.from('formularios').delete().eq('id', novo.id)
      throw error
    }
  }

  // imagens: melhor esforço — se a cópia de um arquivo falhar, a cópia do
  // formulário fica sem aquela imagem (dá para enviar de novo no editor)
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const imagens = {}
  for (const coluna of ['logo_url', 'capa_url']) {
    const url = f[coluna]
    const i = (url || '').indexOf(marca)
    if (i < 0) { if (url) imagens[coluna] = url; continue } // fora do bucket: só referencia
    const origem = decodeURIComponent(url.slice(i + marca.length).split('?')[0])
    const destino = `${novo.empresa_id}/${novo.id}/${origem.split('/').pop()}`
    const { error } = await supabase.storage.from(BUCKET).copy(origem, destino)
    if (error) { console.warn('[formularios] copiar imagem', error); continue }
    imagens[coluna] = supabase.storage.from(BUCKET).getPublicUrl(destino).data.publicUrl
  }
  if (Object.keys(imagens).length) {
    const { error } = await supabase.from('formularios').update(imagens).eq('id', novo.id)
    if (!error) Object.assign(novo, imagens)
  }

  return { ...novo, qtdCampos: campos?.length || 0 }
}
