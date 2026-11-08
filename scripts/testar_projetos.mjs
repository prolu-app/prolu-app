// Testes da lógica pura da Gestão de Projetos (src/utils/projetos.js), sem
// navegador e sem dependência nova:
//
//   node scripts/testar_projetos.mjs
//
// Confere: "Atrasado" calculado no fuso de São Paulo, % concluído e
// atrasados, montagem da árvore (ordem, níveis, órfãos), subárvore para
// excluir, aviso de prazo do pai, reordenação, matriz de permissão por papel
// (espelho da migration_063), filtro/busca da lista e leitura de valor e tags.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = await import(pathToFileURL(path.join(raiz, 'src/utils/projetos.js')).href)

let falhas = 0
let total = 0
function confere(nome, ok, detalhe) {
  total++
  if (ok) return
  falhas++
  console.log(`FALHOU  ${nome}${detalhe !== undefined ? `\n        ${JSON.stringify(detalhe).slice(0, 400)}` : ''}`)
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── hoje em São Paulo ──
// 02:30 UTC de 10/03 ainda é 09/03 em São Paulo (UTC-3)
confere('hojeSP vira o dia no fuso de São Paulo', p.hojeSP(new Date('2026-03-10T02:30:00Z')) === '2026-03-09', p.hojeSP(new Date('2026-03-10T02:30:00Z')))
confere('hojeSP de dia', p.hojeSP(new Date('2026-03-10T15:00:00Z')) === '2026-03-10')
confere('fmtData', p.fmtData('2026-03-09') === '09/03/2026' && p.fmtData(null) === '')

// ── atrasado ──
const hoje = '2026-03-10'
confere('prazo ontem, aberto = atrasado', p.itemAtrasado({ prazo: '2026-03-09', status: 'a_fazer' }, hoje))
confere('prazo ontem, fazendo = atrasado', p.itemAtrasado({ prazo: '2026-03-09', status: 'fazendo' }, hoje))
confere('prazo hoje não é atrasado', !p.itemAtrasado({ prazo: hoje, status: 'a_fazer' }, hoje))
confere('concluído nunca é atrasado', !p.itemAtrasado({ prazo: '2020-01-01', status: 'concluido' }, hoje))
confere('sem prazo nunca é atrasado', !p.itemAtrasado({ prazo: null, status: 'a_fazer' }, hoje))

// ── % concluído ──
const itensResumo = [
  { status: 'concluido', prazo: '2026-01-01' },
  { status: 'concluido' },
  { status: 'fazendo', prazo: '2026-03-01' },
  { status: 'a_fazer', prazo: '2026-12-01' },
  { status: 'a_fazer', prazo: '2026-02-01' },
  { status: 'a_fazer' },
]
const resumo = p.resumoItens(itensResumo, hoje)
confere('resumo: 2 de 6 = 33%', resumo.total === 6 && resumo.concluidos === 2 && resumo.pct === 33, resumo)
confere('resumo: 2 atrasados', resumo.atrasados === 2, resumo)
confere('resumo vazio = 0%', igual(p.resumoItens([], hoje), { total: 0, concluidos: 0, pct: 0, atrasados: 0 }))
confere('tudo concluído = 100%', p.resumoItens([{ status: 'concluido' }, { status: 'concluido' }], hoje).pct === 100)

// ── árvore ──
const planos = [
  { id: 'e2', parent_id: null, nivel: 1, ordem: 1, nome: 'Etapa 2' },
  { id: 'e1', parent_id: null, nivel: 1, ordem: 0, nome: 'Etapa 1' },
  { id: 't12', parent_id: 'e1', nivel: 2, ordem: 1, nome: 'Tarefa 1.2' },
  { id: 't11', parent_id: 'e1', nivel: 2, ordem: 0, nome: 'Tarefa 1.1' },
  { id: 's111', parent_id: 't11', nivel: 3, ordem: 0, nome: 'Sub 1.1.1' },
  { id: 'orfa', parent_id: 'nao-existe', nivel: 2, ordem: 0, nome: 'Órfã' },
]
const arvore = p.montarArvore(planos)
confere('árvore: etapas na ordem', igual(arvore.map(n => n.id), ['e1', 'e2']))
confere('árvore: tarefas na ordem', igual(arvore[0].filhos.map(n => n.id), ['t11', 't12']))
confere('árvore: subtarefa no lugar', igual(arvore[0].filhos[0].filhos.map(n => n.id), ['s111']))
confere('árvore: órfã fica de fora', !JSON.stringify(arvore).includes('orfa'))
confere('árvore: não altera a lista original', !('filhos' in planos[0]))
const empate = p.montarArvore([
  { id: 'b', parent_id: null, ordem: 0, created_at: '2026-01-02' },
  { id: 'a', parent_id: null, ordem: 0, created_at: '2026-01-01' },
])
confere('árvore: empate de ordem desempata pela criação', igual(empate.map(n => n.id), ['a', 'b']))
confere('subárvore da etapa inclui tarefas e subtarefas', igual([...p.idsDaSubarvore(planos, 'e1')].sort(), ['e1', 's111', 't11', 't12']))
confere('subárvore da subtarefa é só ela', igual([...p.idsDaSubarvore(planos, 's111')], ['s111']))

// ── aviso de prazo do pai ──
confere('filho termina depois do pai', p.passaDoPrazo({ prazo: '2026-04-02' }, '2026-04-01'))
confere('filho começa depois do prazo do pai', p.passaDoPrazo({ data_inicio: '2026-04-05' }, '2026-04-01'))
confere('filho dentro do prazo', !p.passaDoPrazo({ data_inicio: '2026-03-01', prazo: '2026-04-01' }, '2026-04-01'))
confere('pai sem prazo não avisa', !p.passaDoPrazo({ prazo: '2030-01-01' }, null))

// ── ordem ──
const irmaos = [{ id: 'a', ordem: 0 }, { id: 'b', ordem: 1 }, { id: 'c', ordem: 2 }]
confere('próxima ordem', p.proximaOrdem(irmaos) === 3 && p.proximaOrdem([]) === 0)
confere('mover b para cima', igual(p.moverItem(irmaos, 'b', -1), [{ id: 'b', ordem: 0 }, { id: 'a', ordem: 1 }]))
confere('mover b para baixo', igual(p.moverItem(irmaos, 'b', 1), [{ id: 'c', ordem: 1 }, { id: 'b', ordem: 2 }]))
confere('primeiro não sobe', igual(p.moverItem(irmaos, 'a', -1), []))
confere('último não desce', igual(p.moverItem(irmaos, 'c', 1), []))
confere('ordens repetidas viram sequência', igual(
  p.moverItem([{ id: 'x', ordem: 0 }, { id: 'y', ordem: 0 }, { id: 'z', ordem: 0 }], 'z', -1),
  [{ id: 'z', ordem: 1 }, { id: 'y', ordem: 2 }],
), p.moverItem([{ id: 'x', ordem: 0 }, { id: 'y', ordem: 0 }, { id: 'z', ordem: 0 }], 'z', -1))

// ── matriz de permissão (espelho da migration_063, regra revisada) ──
const CHAVES = ['verArquivados', 'verFinanceiro', 'criarProjeto', 'editarProjeto', 'excluirProjeto',
  'editarNomeOficial', 'arquivarProjeto', 'editarFinanceiro',
  'criarEtapa', 'renomearEtapa', 'excluirEtapa', 'reordenarEtapa', 'editarHorasEtapa', 'editarEtapa',
  'criarItem', 'editarItem', 'excluirItem', 'reordenarItem']
const ITENS = ['criarEtapa', 'renomearEtapa', 'excluirEtapa', 'reordenarEtapa', 'editarHorasEtapa', 'editarEtapa',
  'criarItem', 'editarItem', 'excluirItem', 'reordenarItem']
const com = (chaves) => Object.fromEntries(CHAVES.map(k => [k, chaves.includes(k)]))
// compara sem depender da ordem das chaves
const mesma = (a, b) => igual(Object.keys(a).sort().map(k => [k, a[k]]), Object.keys(b).sort().map(k => [k, b[k]]))
const tudo = com(CHAVES)
const nada = com([])
const comumAtivo = com(ITENS)
const gestorAtivo = com([...ITENS, 'criarProjeto', 'editarProjeto', 'excluirProjeto'])

confere('master pode tudo', mesma(p.permissoesProjeto({ papel: 'master' }), tudo), p.permissoesProjeto({ papel: 'master' }))
confere('prolu_admin no próprio escritório = master', mesma(p.permissoesProjeto({ papel: 'prolu_admin' }), tudo))
confere('master também mexe em arquivado', mesma(p.permissoesProjeto({ papel: 'master', arquivado: true }), tudo))
confere('gestor: cria/edita/exclui projeto e todos os itens; sem nome oficial, arquivar e financeiro',
  mesma(p.permissoesProjeto({ papel: 'gestor' }), gestorAtivo), p.permissoesProjeto({ papel: 'gestor' }))
confere('comum: não grava projeto; cria/renomeia/reordena/exclui etapas, tarefas e subtarefas',
  mesma(p.permissoesProjeto({ papel: 'comum' }), comumAtivo), p.permissoesProjeto({ papel: 'comum' }))
confere('gestor cria projeto, comum não',
  p.permissoesProjeto({ papel: 'gestor' }).criarProjeto && !p.permissoesProjeto({ papel: 'comum' }).criarProjeto)
for (const papel of ['gestor', 'comum']) {
  confere(`${papel}: nunca vê financeiro nem arquivados`,
    !p.permissoesProjeto({ papel }).verFinanceiro && !p.permissoesProjeto({ papel }).verArquivados)
  // criarProjeto não depende do projeto aberto: o gestor segue criando outros
  confere(`${papel}: nada em arquivado`,
    mesma(p.permissoesProjeto({ papel, arquivado: true }), papel === 'gestor' ? com(['criarProjeto']) : nada))
}
confere('vitrine: master só lê (vê arquivados e financeiro)',
  mesma(p.permissoesProjeto({ papel: 'master', somenteLeitura: true }), com(['verArquivados', 'verFinanceiro'])))
confere('vitrine: gestor não cria projeto', !p.permissoesProjeto({ papel: 'gestor', somenteLeitura: true }).criarProjeto)
confere('prolu_admin em outro escritório só lê',
  mesma(p.permissoesProjeto({ papel: 'prolu_admin', outroEscritorio: true }), com(['verArquivados', 'verFinanceiro'])))
confere('papel desconhecido não faz nada', mesma(p.permissoesProjeto({ papel: 'x' }), nada))
confere('sem argumentos não faz nada', mesma(p.permissoesProjeto(), nada))

const permComum = p.permissoesProjeto({ papel: 'comum' })
const itemTudo = { renomear: true, editarCampos: true, editarHoras: true, excluir: true, reordenar: true, criarFilho: true }
confere('comum na etapa: renomeia, edita, reordena, exclui e cria tarefa',
  igual(p.permissoesItem(permComum, 1), itemTudo), p.permissoesItem(permComum, 1))
confere('comum na tarefa: tudo', igual(p.permissoesItem(permComum, 2), itemTudo))
confere('comum em arquivado: nada no item',
  !Object.values(p.permissoesItem(p.permissoesProjeto({ papel: 'comum', arquivado: true }), 1)).some(Boolean))
confere('subtarefa não tem filhos', p.permissoesItem(p.permissoesProjeto({ papel: 'master' }), 3).criarFilho === false)

// ── lista ──
const projetos = [
  { id: 1, nome: 'Casa Açaí', situacao: 'ativo', clientes: { nome: 'Joana' }, tags: ['reforma'] },
  { id: 2, nome: 'Loja', situacao: 'pausado', cliente_nome: 'Pedro', cidade: 'Londrina', tags: [] },
  { id: 3, nome: 'Antigo', situacao: 'arquivado', tags: [] },
  { id: 4, nome: 'Feito', nome_oficial: 'PRJ-004', situacao: 'concluido', tags: [] },
]
const ids = (lista) => lista.map(x => x.id)
confere('padrão esconde arquivados', igual(ids(p.filtrarProjetos(projetos)), [1, 2, 4]))
confere('todos', igual(ids(p.filtrarProjetos(projetos, { situacao: 'todos' })), [1, 2, 3, 4]))
confere('só arquivados', igual(ids(p.filtrarProjetos(projetos, { situacao: 'arquivado' })), [3]))
confere('busca sem acento no nome', igual(ids(p.filtrarProjetos(projetos, { busca: 'acai' })), [1]))
confere('busca no cliente cadastrado', igual(ids(p.filtrarProjetos(projetos, { busca: 'joana' })), [1]))
confere('busca no cliente digitado e na cidade', igual(ids(p.filtrarProjetos(projetos, { busca: 'londri' })), [2]))
confere('busca no nome oficial', igual(ids(p.filtrarProjetos(projetos, { busca: 'prj-004' })), [4]))
confere('busca nas tags', igual(ids(p.filtrarProjetos(projetos, { busca: 'REFORMA' })), [1]))
confere('rotuloCliente prefere o cadastrado', p.rotuloCliente({ clientes: { nome: 'A' }, cliente_nome: 'B' }) === 'A' && p.rotuloCliente({ cliente_nome: 'B' }) === 'B')

// ── valor e tags ──
confere('valor BR com milhar e centavos', p.parseValorBR('R$ 12.500,50') === 12500.5)
confere('valor com ponto decimal', p.parseValorBR('1234.5') === 1234.5)
confere('valor vazio = null', p.parseValorBR('  ') === null)
confere('valor inválido = NaN', Number.isNaN(p.parseValorBR('12a')))
confere('tags limpas e sem repetição', igual(p.parseTags(' casa, reforma,, casa '), ['casa', 'reforma']))

console.log(falhas ? `\n${falhas} de ${total} testes FALHARAM` : `OK — ${total} testes passaram`)
process.exit(falhas ? 1 : 0)
