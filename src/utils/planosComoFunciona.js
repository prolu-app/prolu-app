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
// crm, formulario, alvo, indicadores, grafico, seta, sparkle, engrenagem, livro.
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
        { icone: 'formulario', titulo: 'Pedidos de orçamento', texto: 'Posicionamento e conteúdo preparados para atrair **bons pedidos de orçamento**, e não qualquer pedido.' },
        { icone: 'pessoas', titulo: 'Atendimento e proposta', texto: 'Um processo **centrado no cliente** e coerente do primeiro contato à proposta, para **elevar a percepção de valor**.' },
        { icone: 'seta', titulo: 'Crescimento constante', texto: 'Bons fechamentos, precificação e condições de pagamento, juntos, garantem **mais previsibilidade de caixa**.' },
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
    passos: {
      itens: [
        { icone: 'calendario', titulo: 'Acompanhamento individual', texto: 'Um encontro por mês, de 2 horas, só com o seu escritório, com **direcionamento claro de ações** e WhatsApp aberto para dúvidas e decisões.' },
        { icone: 'formulario', titulo: 'Ajuste comercial', texto: 'O ponto de partida: atendimento, reunião e proposta coerentes, e conteúdo voltado ao **cliente ideal** para atrair os pedidos de orçamento certos.' },
        { icone: 'pessoas', titulo: 'Equipe e produtividade', texto: 'Depois, a equipe: **organização interna, capacitação e produtividade** para o escritório entregar mais.' },
        { icone: 'seta', titulo: 'Negócio saudável', texto: 'Um escritório que cresce **por estratégia e por conta própria**, e não pelo esforço do dono.' },
      ],
    },
    cartoes: {
      titulo: 'O que acompanhamos',
      itens: [
        { icone: 'indicadores', titulo: 'Indicadores de crescimento', texto: 'Pedidos, fechamentos, valor fechado e ticket médio, mês a mês.' },
        { icone: 'grafico', titulo: 'Produtividade da equipe', texto: 'Como a equipe produz e onde dá para produzir melhor.' },
        { icone: 'engrenagem', titulo: 'Organização interna', texto: 'Processos, rotinas e responsabilidades definidos.' },
        { icone: 'sparkle', titulo: 'Construção de marca', texto: 'Posicionamento, conteúdo para o cliente ideal e orientação para o tráfego pago.' },
        { icone: 'livro', titulo: 'Capacitação da equipe', texto: 'Equipe preparada para atender, propor e produzir no padrão do escritório.' },
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
