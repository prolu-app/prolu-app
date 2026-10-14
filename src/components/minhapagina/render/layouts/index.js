// Layouts da Minha Página v2 — só estrutura; o visual vem das variáveis de
// design. Livres em todos os planos (não entram na matriz de planos).
// Layout novo: um componente que recebe { doc, nome, itens, hrefDe,
// previa, selo } + uma entrada aqui + o id na lista do SQL (migration_056)
// e em LISTAS.layout (utils/pagina/modelo.js).

import Classico from './Classico.jsx'

export const LAYOUTS = [
  { id: 'classico', rotulo: 'Clássico', disponivel: true, Componente: Classico },
  { id: 'editorial', rotulo: 'Editorial', disponivel: false },
  { id: 'quadrados', rotulo: 'Quadrados', disponivel: false },
  { id: 'cartoes', rotulo: 'Cartões', disponivel: false },
]

// layout ainda não implementado (ou desconhecido) desenha como Clássico
export const layoutDe = id => LAYOUTS.find(l => l.id === id && l.disponivel) || LAYOUTS[0]
