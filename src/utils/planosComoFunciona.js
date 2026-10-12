// Textos dos modais "Ver como funciona" de /planos (Mentoria e Consultoria).
// ÚNICO lugar destes textos: para mudar, edite só este arquivo.
//
// Formato de cada serviço:
//   titulo      — título do modal
//   resumo      — parágrafo de abertura
//   secoes      — [{ titulo, itens: [texto, …] }], na ordem em que aparecem
//   paginaUrl   — "Ver página completa" (abre em nova aba)
//
// Não coloque aqui preço, datas de turma, fidelidade nem prazos de inscrição
// (ficam desatualizados): o preço já aparece no card do plano.

export const COMO_FUNCIONA = {
  mentoria: {
    titulo: 'Como funciona a Mentoria',
    resumo: 'Mentoria em grupo para arquitetos, com foco no comercial do escritório. Método, acompanhamento e entrada constante de projetos com financeiro saudável.',
    secoes: [
      {
        titulo: 'Como funciona',
        itens: [
          '12 meses de acompanhamento contínuo.',
          'Cada mês trata de um gargalo específico: prospecção, precificação, apresentação de proposta ou gestão financeira.',
          '1 encontro em grupo ao vivo por mês, de 2 horas, com diagnóstico do escritório.',
          'Grupo no WhatsApp para dúvidas e revisões durante o mês.',
        ],
      },
      {
        titulo: 'O que está incluído',
        itens: [
          'Encontros mensais ao vivo e gravações enquanto a mentoria estiver ativa.',
          'Grupo no WhatsApp.',
          'Curso Posicionamento e Vendas.',
          'Prolu Precificação, ferramenta de precificação.',
          'Agente Prolu, uma IA para dúvidas do dia a dia comercial.',
          'Prolu App, com CRM e dashboard para gestão comercial.',
        ],
      },
      {
        titulo: 'Para quem é',
        itens: [
          'Arquitetos que recebem poucos pedidos de orçamento bons ou conduzem reuniões sem processo definido.',
          'Escritórios com financeiro instável e pouca previsibilidade.',
          'Quem sabe que seu trabalho vale mais, mas tem receio de perder clientes ao cobrar mais.',
        ],
      },
    ],
    paginaUrl: 'https://prolu.com.br/mentoria',
  },

  consultoria: {
    titulo: 'Como funciona a Consultoria',
    resumo: 'Acompanhamento mensal para escritórios que já entregam bons projetos e querem crescer com mais constância, projetos melhores e posicionamento mais forte, com foco em organização comercial e estratégica e em análise dos números.',
    secoes: [
      {
        titulo: 'Como funciona',
        itens: [
          '1 encontro individual por mês, de 2 horas, com direcionamento claro de ações.',
          'WhatsApp aberto para dúvidas e decisões durante o mês.',
          'Ajustes feitos mês a mês com base nos números do escritório.',
        ],
      },
      {
        titulo: 'O que acompanhamos',
        itens: [
          'Organização estratégica e comercial: método de atendimento, reunião e proposta; conteúdo voltado ao cliente ideal para atrair pedidos de orçamento.',
          'Gestão comercial e análises: pedidos recebidos, fechamentos, valor total fechado, ticket médio, posicionamento percebido e tipo de projeto e cliente atraídos.',
          'Orientação para o escritório fazer o tráfego pago por conta própria.',
        ],
      },
      {
        titulo: 'Para quem é',
        itens: [
          'Escritórios com qualidade técnica e potencial, elogiados por clientes e fornecedores, que ainda crescem abaixo do que poderiam.',
        ],
      },
    ],
    paginaUrl: 'https://prolu.com.br/agencia',
  },
}
