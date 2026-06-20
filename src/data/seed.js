/* Dados de demonstração. Espelham o formato das tabelas do Supabase.
   Quando o banco estiver conectado, cada tela troca esses seeds por queries. */

/* ── INÍCIO ── */
export const QUOTES = [
  { text: 'Você não precisa de mais leads. Precisa saber para quem está falando — o resto se resolve.', author: 'Agente Prolu' },
  { text: 'Posicionamento não é nicho. É ponto de vista. E ponto de vista se constrói com repetição.', author: 'Agente Prolu' },
  { text: 'O escritório que você quer ter começa na conversa que você está evitando ter hoje.', author: 'Agente Prolu' },
  { text: 'Cobrar caro não é sobre o cliente. É sobre você acreditar no que entrega.', author: 'Agente Prolu' },
  { text: 'A sorte favorece a mente preparada.', author: 'Louis Pasteur' },
  { text: 'Faça o que puder, com o que tiver, onde estiver.', author: 'Theodore Roosevelt' },
  { text: 'O sucesso é a soma de pequenos esforços repetidos dia após dia.', author: 'Robert Collier' },
  { text: 'A disciplina é a ponte entre metas e realizações.', author: 'Jim Rohn' },
  { text: 'Quem tem um porquê para viver pode suportar quase qualquer como.', author: 'Friedrich Nietzsche' },
  { text: 'Comece onde você está. Use o que você tem. Faça o que você pode.', author: 'Arthur Ashe' },
  { text: 'A excelência não é um ato, mas um hábito.', author: 'Aristóteles' },
]

export const ANNOUNCEMENTS = [
  { id: 'a1', color: 'green', text: 'Aula nova no ar: Como lidar com objeções de preço.', linkText: 'Assistir agora', link: '/base-conhecimento' },
  { id: 'a2', color: 'orange', text: 'Você ainda não preencheu o diagnóstico deste trimestre.', linkText: 'Preencher', link: 'https://prolu.com.br/diagnostico', external: true },
]

/* ── BASE DE CONHECIMENTO ── */
export const FOLDERS = [
  {
    id: 'f1', title: 'Curso de Vendas e Posicionamento', sub: '3 módulos · do diagnóstico ao fechamento', cover: 'green',
    modules: [
      {
        id: 'm1', title: 'Fundamentos da Gestão Comercial',
        lessons: [
          { id: 'l1', title: 'Por que arquitetos travam na venda', desc: 'O padrão de pensamento que impede a maioria dos escritórios de crescer de forma consistente.', done: true, pdfs: [] },
          { id: 'l2', title: 'As 5 fases do método Prolu', desc: 'Diagnóstico, Posicionamento, Processo Comercial, Precificação e Gestão. Como elas se conectam.', done: true, pdfs: ['Mapa das 5 fases.pdf'] },
          { id: 'l3', title: 'Posicionamento e ponto de vista', desc: 'Por que nicho não é posicionamento, e como construir um ponto de vista que atrai o cliente certo sem precisar convencer ninguém.', done: false, pdfs: [] },
        ],
      },
      {
        id: 'm2', title: 'Processo Comercial',
        lessons: [
          { id: 'l4', title: 'A primeira conversa com o cliente', desc: 'Como conduzir o primeiro contato sem parecer vendedor.', done: true, pdfs: ['Roteiro de primeira reunião.pdf'] },
          { id: 'l5', title: 'Como apresentar uma proposta', desc: 'Estrutura de apresentação que reduz objeção de preço.', done: true, pdfs: [] },
          { id: 'l6', title: 'Lidando com objeções de preço', desc: 'As 4 objeções mais comuns e como responder cada uma.', done: false, pdfs: ['Script de objeções.pdf'] },
          { id: 'l7', title: 'Fechamento sem pressão', desc: 'Técnicas de fechamento que respeitam o tempo do cliente.', done: false, pdfs: [] },
        ],
      },
      {
        id: 'm3', title: 'Precificação',
        lessons: [
          { id: 'l8', title: 'Por que cobrar por hora', desc: 'A lógica por trás da precificação por hora vs. % do projeto.', done: true, pdfs: [] },
          { id: 'l9', title: 'Como calcular seu valor/hora', desc: 'Passo a passo do cálculo considerando custos fixos e produtividade.', done: false, pdfs: ['Planilha de cálculo.pdf'] },
          { id: 'l10', title: 'Estimando horas por etapa', desc: 'Como não errar na estimativa de horas de cada fase do projeto.', done: false, pdfs: [] },
        ],
      },
    ],
  },
  {
    id: 'f2', title: 'Conteúdos Extras', sub: 'Lives, bônus e atualizações', cover: 'orange',
    modules: [
      {
        id: 'm4', title: 'Lives e bônus',
        lessons: [
          { id: 'l11', title: 'Live: Como usar o Agente Prolu no dia a dia', desc: 'Gravação da live de maio mostrando casos reais de uso do Agente Prolu.', done: false, pdfs: [] },
          { id: 'l12', title: 'Bônus: Modelo de proposta no Canva', desc: 'Template pronto para você adaptar com a identidade do seu escritório.', done: false, pdfs: ['Modelo de proposta.pdf'] },
          { id: 'l13', title: 'Atualização: Nova versão do CRM', desc: 'O que mudou no CRM e como aproveitar os novos filtros.', done: false, pdfs: [] },
        ],
      },
    ],
  },
]

/* ── CRM ── */
export const CRM_COLUMNS = [
  { id: 'c_data', name: 'Data', type: 'date', width: 120 },
  { id: 'c_cliente', name: 'Cliente', type: 'text', width: 180 },
  { id: 'c_tipo', name: 'Tipo de projeto', type: 'text', width: 150 },
  { id: 'c_origem', name: 'Origem', type: 'select', width: 130, options: [
    { value: 'Indicação', color: 'green' },
    { value: 'Instagram', color: 'violet' },
    { value: 'Google', color: 'blue' },
    { value: 'Site', color: 'orange' },
  ] },
  { id: 'c_valor', name: 'Valor proposta', type: 'money', width: 140 },
  { id: 'c_status', name: 'Status', type: 'select', width: 150, options: [
    { value: 'Conversa', color: 'blue' },
    { value: 'Proposta', color: 'orange' },
    { value: 'Fechado', color: 'green' },
    { value: 'Sem resposta', color: 'violet' },
    { value: 'Perdido', color: 'gray' },
  ] },
]

export const CRM_ROWS = [
  { id: 'r1', c_data: '2026-06-02', c_cliente: 'Mariana e Felipe', c_tipo: 'Apartamento', c_origem: 'Indicação', c_valor: 18000, c_status: 'Proposta' },
  { id: 'r2', c_data: '2026-06-05', c_cliente: 'Dra. Camila Rocha', c_tipo: 'Consultório', c_origem: 'Instagram', c_valor: 24000, c_status: 'Conversa' },
  { id: 'r3', c_data: '2026-05-28', c_cliente: 'Roberto Lima', c_tipo: 'Casa', c_origem: 'Indicação', c_valor: 32000, c_status: 'Fechado' },
  { id: 'r4', c_data: '2026-06-10', c_cliente: 'Júlia Mendes', c_tipo: 'Apartamento', c_origem: 'Google', c_valor: 15000, c_status: 'Sem resposta' },
  { id: 'r5', c_data: '2026-05-20', c_cliente: 'Fernando e Paula', c_tipo: 'Reforma', c_origem: 'Instagram', c_valor: 12000, c_status: 'Perdido' },
  { id: 'r6', c_data: '2026-06-14', c_cliente: 'Studio Aurora', c_tipo: 'Comercial', c_origem: 'Site', c_valor: 45000, c_status: 'Proposta' },
]

/* ── PLANO PRÁTICO ── */
export const PLANO_TAGS = [
  { id: 't1', name: 'Estrutura comercial', color: '#3a6ea5' },
  { id: 't2', name: 'Posicionamento', color: '#8050a0' },
  { id: 't3', name: 'Metas e indicadores', color: '#4CAF82' },
]

export const PLANO_ACOES = [
  { id: 'a1', text: 'Começar a usar o CRM para registrar todo pedido de orçamento', tag: 't1', status: 'done' },
  { id: 'a2', text: 'Criar rotina de atualizar o CRM uma vez por semana', tag: 't1', status: 'done' },
  { id: 'a3', text: 'Definir o Processo de Atendimento, do primeiro contato à proposta', tag: 't1', status: 'prog' },
  { id: 'a4', text: 'Elaborar apresentação para usar na primeira reunião com o cliente', tag: 't1', status: 'pend' },
  { id: 'a5', text: 'Definir o Perfil de Cliente Ideal do escritório', tag: 't2', status: 'done' },
  { id: 'a6', text: 'Produzir conteúdos focados no Cliente Ideal definido', tag: 't2', status: 'pend' },
  { id: 'a7', text: 'Criar formulário de qualificação para o Instagram', tag: 't2', status: 'pend' },
  { id: 'a8', text: 'Definir metas de faturamento e número de projetos fechados', tag: 't3', status: 'done' },
  { id: 'a9', text: 'Revisar indicadores de desempenho a cada trimestre', tag: 't3', status: 'pend' },
  { id: 'a10', text: 'Estudar precificação por horas e definir valor da hora', tag: 't3', status: 'done' },
  { id: 'a11', text: 'Elaborar proposta usando o Modelo Prolu', tag: 't1', status: 'pend' },
]

/* ── CLIENTE IDEAL ── */
export const ICP_PROFILES = [
  {
    id: 'p1', name: 'Casal jovem — primeiro apê', color: '#3a6ea5',
    ageMin: 27, ageMax: 35,
    demografico: 'Casal sem filhos, entre 27 e 35 anos. Recém-casados ou noivos, primeira vez morando juntos. Apartamento comprado na planta ou recém-entregue. Renda familiar entre R$ 15k e R$ 30k/mês.',
    psicografico: 'Valorizam estética e qualidade. Buscam um apê que reflita a personalidade do casal. Pesquisam muito antes de contratar — seguem arquitetos no Instagram há meses antes de entrar em contato. Decidem juntos mas um costuma liderar.',
    gatilhos: 'Chaves do apartamento entregues. Casamento marcado — precisam que o apê esteja pronto até a cerimônia. É a primeira vez morando juntos e querem fazer certo desde o começo.',
    dores: 'Medo de estourar o orçamento — têm muitos gastos com o casamento. Obra atrasar e atrapalhar a lua de mel. Não conseguir comunicar o que querem e o resultado decepcionar.',
    desejos: 'Um apê que pareça deles — personalidade e estilo próprio. Que impressione amigos e família na primeira visita. Funcional, bem resolvido, sem obra de novo por muito tempo.',
    canais: ['Instagram', 'Indicação', 'Pinterest'],
    ondeEncontrar: 'Chegam principalmente via Instagram e indicação de amigos que já foram clientes. Às vezes via construtoras parceiras.',
    pagamento: ['Parcelado'],
    orcamento: 'Ticket médio entre R$ 14k e R$ 22k. Preferem parcelar — têm muitos gastos com o casamento.',
    gap: 'A concorrência peca no acompanhamento e na comunicação — o cliente fica no escuro sobre andamento da obra e orçamento. Oportunidade: atenção constante, relatórios claros, presença nos momentos que importam. O RT próximo e acessível é o grande diferencial.',
  },
  {
    id: 'p2', name: 'Profissional liberal', color: '#8050a0',
    ageMin: 35, ageMax: 50,
    demografico: 'Médicos, dentistas, advogados que vão montar ou reformar consultório/escritório próprio.',
    psicografico: 'Decisão rápida quando confiam. Valorizam profissionalismo e prazo. Tempo é escasso.',
    gatilhos: 'Abertura de consultório próprio, mudança de endereço, expansão da clínica.',
    dores: 'Não ter tempo de acompanhar a obra. Medo de obra parar o atendimento e perder faturamento.',
    desejos: 'Um espaço que transmita autoridade e cuidado para os pacientes/clientes.',
    canais: ['Indicação', 'Google'],
    ondeEncontrar: 'Indicação de colegas de profissão e busca no Google por arquitetos especializados.',
    pagamento: ['À vista c/ desconto', 'Parcelado'],
    orcamento: 'Ticket de R$ 25k a R$ 60k. Aceitam pagar mais por agilidade e tranquilidade.',
    gap: 'Concorrentes não entendem a rotina de um consultório. Diferencial: planejar a obra para minimizar dias parados.',
  },
]

/* ── INDICADORES ── */
export const INDICADORES = [
  { id: 1, name: 'Faturamento', unit: 'R$', meta: 130000, quarters: [28000, 46000, 74000, null], group: 'Financeiro' },
  { id: 2, name: 'Ticket médio', unit: 'R$', meta: 20000, quarters: [16000, 18500, 17600, null], group: 'Financeiro' },
  { id: 3, name: 'Projetos fechados', unit: '#', meta: 8, quarters: [2, 3, 5, null], group: 'Comercial' },
  { id: 4, name: 'Pedidos de orçamento', unit: '#', meta: 25, quarters: [6, 14, 23, null], group: 'Comercial' },
  { id: 5, name: 'Taxa de conversão', unit: '%', meta: 30, quarters: [33, 21, 22, null], group: 'Comercial' },
]
