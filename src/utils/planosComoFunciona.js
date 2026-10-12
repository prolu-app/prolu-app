// Textos dos modais "Ver como funciona" de /planos (Mentoria e Consultoria).
// ÚNICO lugar destes textos: para mudar, edite só este arquivo.
// Fonte: prolu.com.br/mentoria e prolu.com.br/agencia.
//
// Formato de cada serviço (blocos na ordem em que aparecem):
//   titulo       — título do modal
//   resumo       — 1 ou 2 frases curtas, logo abaixo do título
//   destaques    — [{ valor, rotulo }]: 3 ou 4 cartões com um número/fato grande
//                  (opcional: sem destaques, a faixa some)
//   passos       — { titulo, itens: [{ titulo, texto, icone? }] }: "Como funciona".
//                  Sem titulo, a seção vem sem cabeçalho. Com icone, cada item é
//                  um tópico com ícone em outline verde (título em cima, texto
//                  embaixo); sem icone, passos numerados.
//   cartoes      — { titulo, itens: [{ icone, titulo, texto }] }: "O que está
//                  incluído" (Mentoria) / "O que acompanhamos" (Consultoria)
//   paraQuem     — [texto]: "Para quem é", um item por linha
//   paginaUrl    — "Ver página completa" (abre em nova aba)
//
// Em qualquer texto, **assim** fica em negrito.
// Ícones disponíveis (Icons.jsx): calendario, pessoas, play, dinheiro, agente,
// crm, alvo, indicadores, grafico, seta, sparkle.
//
// Não coloque aqui preço, datas de turma, fidelidade nem prazos de inscrição
// (ficam desatualizados): o preço já aparece no card do plano.

export const COMO_FUNCIONA = {
  mentoria: {
    titulo: 'Como funciona a Mentoria',
    resumo: 'Mentoria em grupo para arquitetos, com foco no **comercial do escritório**. Método, acompanhamento e entrada constante de projetos com financeiro saudável.',
    passos: {
      itens: [
        { icone: 'calendario', titulo: 'Acompanhamento mensal', texto: 'Encontros em grupo ao vivo, uma vez por mês, com **orientações individualizadas** para o seu escritório.' },
        { icone: 'pessoas', titulo: 'Prospecção', texto: 'Mais pedidos de orçamento bons e **entrada constante de projetos**.' },
        { icone: 'dinheiro', titulo: 'Precificação e proposta', texto: 'Cobrar o que o seu trabalho vale e **apresentar a proposta** com processo definido.' },
        { icone: 'indicadores', titulo: 'Gestão financeira', texto: 'Um **financeiro saudável**, com mais previsibilidade.' },
      ],
    },
    cartoes: {
      titulo: 'O que está incluído',
      itens: [
        { icone: 'calendario', titulo: 'Encontros mensais ao vivo', texto: 'E as gravações, enquanto a mentoria estiver ativa.' },
        { icone: 'pessoas', titulo: 'Grupo no WhatsApp', texto: 'Dúvidas e revisões durante o mês.' },
        { icone: 'play', titulo: 'Curso Posicionamento e Vendas', texto: 'Incluído na mentoria.' },
        { icone: 'dinheiro', titulo: 'Prolu Precificação', texto: 'Ferramenta de precificação.' },
        { icone: 'agente', titulo: 'Agente Prolu', texto: 'Uma IA para dúvidas do dia a dia comercial.' },
        { icone: 'grafico', titulo: 'Prolu App', texto: 'CRM e dashboard para a gestão comercial.' },
      ],
    },
    paraQuem: [
      'Arquitetos que recebem **poucos pedidos de orçamento bons** ou conduzem reuniões sem processo definido.',
      'Escritórios com **financeiro instável** e pouca previsibilidade.',
      'Quem sabe que seu trabalho **vale mais**, mas tem receio de perder clientes ao cobrar mais.',
    ],
    paginaUrl: 'https://prolu.com.br/mentoria',
  },

  consultoria: {
    titulo: 'Como funciona a Consultoria',
    resumo: 'Acompanhamento mensal para escritórios que já entregam bons projetos e querem crescer com **mais constância, projetos melhores e posicionamento mais forte**.',
    destaques: [
      { valor: '1 encontro/mês', rotulo: 'individual, de 2 horas' },
      { valor: 'WhatsApp', rotulo: 'dúvidas e decisões durante o mês' },
      { valor: 'Mensal', rotulo: 'ajustes com base nos números' },
    ],
    passos: {
      titulo: 'Como funciona',
      itens: [
        { titulo: 'Encontro individual', texto: 'uma vez por mês, de 2 horas, com direcionamento claro de ações.' },
        { titulo: 'Organização estratégica e comercial', texto: 'do atendimento à proposta.' },
        { titulo: 'Análise dos números', texto: 'do escritório.' },
        { titulo: 'Ajustes mês a mês,', texto: 'com WhatsApp aberto para dúvidas e decisões.' },
      ],
    },
    cartoes: {
      titulo: 'O que acompanhamos',
      itens: [
        { icone: 'alvo', titulo: 'Organização estratégica e comercial', texto: 'Método de atendimento, reunião e proposta; conteúdo voltado ao cliente ideal para atrair pedidos de orçamento.' },
        { icone: 'indicadores', titulo: 'Gestão comercial e análises', texto: 'Pedidos, fechamentos, valor total fechado, ticket médio, posicionamento percebido e tipo de projeto e cliente atraídos.' },
        { icone: 'seta', titulo: 'Tráfego pago', texto: 'Orientação para o escritório fazer o tráfego pago por conta própria.' },
      ],
    },
    paraQuem: [
      'Escritórios com **qualidade técnica e potencial**.',
      '**Elogiados** por clientes e fornecedores.',
      'Que ainda **crescem abaixo** do que poderiam.',
    ],
    paginaUrl: 'https://prolu.com.br/agencia',
  },
}
