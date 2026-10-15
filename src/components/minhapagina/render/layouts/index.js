// Layouts da Minha Página v2 — só estrutura; o visual vem das variáveis de
// design. Livres em todos os planos (não entram na matriz de planos).
// Layout novo: um componente que recebe { doc, nome, itens, hrefDe,
// previa, selo } + uma entrada aqui + o id na lista do SQL (migration_056)
// e em LISTAS.layout (utils/pagina/modelo.js). Opções próprias de um layout
// ficam em doc.layout_opcoes (migration_059). Capa só no Clássico.

import Classico from './Classico.jsx'
import Editorial from './Editorial.jsx'
import Quadrados from './Quadrados.jsx'
import Cartoes from './Cartoes.jsx'

export const LAYOUTS = [
  { id: 'classico', rotulo: 'Clássico', disponivel: true, Componente: Classico },
  { id: 'editorial', rotulo: 'Editorial', disponivel: true, Componente: Editorial },
  { id: 'quadrados', rotulo: 'Quadrados', disponivel: true, Componente: Quadrados },
  { id: 'cartoes', rotulo: 'Cartões', disponivel: true, Componente: Cartoes },
]

// layout ainda não implementado (ou desconhecido) desenha como Clássico
export const layoutDe = id => LAYOUTS.find(l => l.id === id && l.disponivel) || LAYOUTS[0]
