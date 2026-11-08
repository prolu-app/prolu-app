// Gestão de Projetos — lógica pura (sem React nem Supabase), testada em
// scripts/testar_projetos.mjs. As regras de acesso valem no servidor
// (supabase/migration_063_gestao_projetos_base.sql); aqui só decidem o que a
// tela mostra.

export const SITUACOES = {
  ativo: { rotulo: 'Ativo', cor: 'green' },
  pausado: { rotulo: 'Pausado', cor: 'orange' },
  concluido: { rotulo: 'Concluído', cor: 'blue' },
  arquivado: { rotulo: 'Arquivado', cor: 'gray' },
}

export const STATUS_ITEM = {
  a_fazer: { rotulo: 'A fazer', cor: 'gray' },
  fazendo: { rotulo: 'Fazendo', cor: 'blue' },
  concluido: { rotulo: 'Concluído', cor: 'green' },
}

export const NIVEL_ROTULO = { 1: 'Etapa', 2: 'Tarefa', 3: 'Subtarefa' }
export const NIVEL_MAX = 3

// Hoje no fuso do escritório (o banco usa America/Sao_Paulo), como 'AAAA-MM-DD'
export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

// 'AAAA-MM-DD' → 'DD/MM/AAAA'
export function fmtData(iso) {
  if (!iso) return ''
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : ''
}

// "Atrasado" nunca é gravado: prazo antes de hoje e item não concluído
export function itemAtrasado(item, hoje = hojeSP()) {
  return !!item?.prazo && item.status !== 'concluido' && item.prazo < hoje
}

// Total, concluídos, % concluído (inteiro) e atrasados — todos os níveis contam
export function resumoItens(itens, hoje = hojeSP()) {
  const lista = itens || []
  const total = lista.length
  const concluidos = lista.filter(i => i.status === 'concluido').length
  return {
    total,
    concluidos,
    pct: total ? Math.round((concluidos / total) * 100) : 0,
    atrasados: lista.filter(i => itemAtrasado(i, hoje)).length,
  }
}

function porOrdem(a, b) {
  return (a.ordem ?? 0) - (b.ordem ?? 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id))
}

// Lista plana → árvore Etapas > Tarefas > Subtarefas, cada nível por `ordem`.
// Item cujo pai não está na lista fica de fora (não acontece com dado íntegro).
export function montarArvore(itens) {
  const nos = new Map((itens || []).map(i => [i.id, { ...i, filhos: [] }]))
  const raizes = []
  for (const no of nos.values()) {
    if (!no.parent_id) raizes.push(no)
    else nos.get(no.parent_id)?.filhos.push(no)
  }
  const ordenar = (lista) => { lista.sort(porOrdem); lista.forEach(n => ordenar(n.filhos)); return lista }
  return ordenar(raizes)
}

// Ids do item e de todos os descendentes (para tirar da tela ao excluir)
export function idsDaSubarvore(itens, id) {
  const ids = new Set([id])
  let cresceu = true
  while (cresceu) {
    cresceu = false
    for (const i of itens || []) {
      if (i.parent_id && ids.has(i.parent_id) && !ids.has(i.id)) { ids.add(i.id); cresceu = true }
    }
  }
  return ids
}

// Aviso visual: alguma data do filho cai depois do prazo do pai. Só avisa;
// status e datas do pai são manuais e independentes.
export function passaDoPrazo(item, prazoPai) {
  if (!prazoPai) return false
  return (!!item?.prazo && item.prazo > prazoPai) || (!!item?.data_inicio && item.data_inicio > prazoPai)
}

// Próxima posição no fim da lista de irmãos
export function proximaOrdem(irmaos) {
  return (irmaos || []).reduce((max, i) => Math.max(max, i.ordem ?? 0), -1) + 1
}

// Mover um item uma posição para cima (-1) ou para baixo (+1) entre os irmãos.
// Devolve as linhas que mudam de ordem ([{ id, ordem }]); vazio = não move.
export function moverItem(irmaos, id, direcao) {
  const lista = [...(irmaos || [])].sort(porOrdem)
  const i = lista.findIndex(x => x.id === id)
  const j = i + direcao
  if (i < 0 || j < 0 || j >= lista.length) return []
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  return lista
    .map((x, ordem) => ({ id: x.id, ordem, antes: x.ordem }))
    .filter(x => x.ordem !== x.antes)
    .map(({ id: idItem, ordem }) => ({ id: idItem, ordem }))
}

// Matriz de permissão por papel (espelho do servidor, só para a tela).
//   papel: usuarios.role; arquivado: projeto com situacao 'arquivado';
//   somenteLeitura: vitrine do plano; outroEscritorio: prolu_admin dentro de
//   outro escritório (lê, não grava).
//   master: tudo. gestor: cria/edita/exclui projeto, menos nome oficial,
//   arquivar e financeiro. comum: não grava projeto. Etapas, tarefas e
//   subtarefas: todos os papéis (fora de projeto arquivado, só do master).
export function permissoesProjeto({ papel, arquivado = false, somenteLeitura = false, outroEscritorio = false } = {}) {
  const master = papel === 'master' || papel === 'prolu_admin'
  const gestor = papel === 'gestor'
  const equipe = master || gestor || papel === 'comum'
  const grava = !somenteLeitura && !outroEscritorio
  const projeto = grava && (master || (gestor && !arquivado))
  const itens = grava && equipe && (master || !arquivado)
  return {
    verArquivados: master,
    verFinanceiro: master,
    criarProjeto: grava && (master || gestor),
    editarProjeto: projeto,
    excluirProjeto: projeto,
    editarNomeOficial: grava && master,
    arquivarProjeto: grava && master,
    editarFinanceiro: grava && master,
    // etapa (nível 1)
    criarEtapa: itens,
    renomearEtapa: itens,
    excluirEtapa: itens,
    reordenarEtapa: itens,
    editarHorasEtapa: itens,
    editarEtapa: itens, // status, datas e responsável
    // tarefa e subtarefa (níveis 2 e 3)
    criarItem: itens,
    editarItem: itens,
    excluirItem: itens,
    reordenarItem: itens,
  }
}

// O que o papel pode fazer com um item específico
export function permissoesItem(perm, nivel) {
  const etapa = nivel === 1
  return {
    renomear: etapa ? perm.renomearEtapa : perm.editarItem,
    editarCampos: etapa ? perm.editarEtapa : perm.editarItem,
    editarHoras: etapa ? perm.editarHorasEtapa : perm.editarItem,
    excluir: etapa ? perm.excluirEtapa : perm.excluirItem,
    reordenar: etapa ? perm.reordenarEtapa : perm.reordenarItem,
    criarFilho: nivel < NIVEL_MAX && perm.criarItem,
  }
}

export function rotuloCliente(projeto) {
  return projeto?.clientes?.nome || projeto?.cliente_nome || ''
}

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// filtro: 'abertos' (tudo menos arquivado), 'todos' ou uma situação
export function filtrarProjetos(projetos, { situacao = 'abertos', busca = '' } = {}) {
  const termo = semAcento(busca).trim()
  return (projetos || []).filter(p => {
    if (situacao === 'abertos' ? p.situacao === 'arquivado' : situacao !== 'todos' && p.situacao !== situacao) return false
    if (!termo) return true
    const texto = [p.nome, p.nome_oficial, rotuloCliente(p), p.cidade, ...(p.tags || [])].map(semAcento).join(' ')
    return texto.includes(termo)
  })
}

// "1.234,56" / "1234.56" / "R$ 1.234" → número; vazio → null; inválido → NaN
export function parseValorBR(texto) {
  const s = String(texto ?? '').replace(/[R$\s]/g, '')
  if (!s) return null
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

export function fmtValorBR(n) {
  if (n == null || n === '') return ''
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "casa, reforma,  casa" → ['casa', 'reforma'] (o banco também normaliza)
export function parseTags(texto) {
  const vistos = new Set()
  return String(texto || '').split(',').map(t => t.trim()).filter(t => t && !vistos.has(t) && vistos.add(t))
}
