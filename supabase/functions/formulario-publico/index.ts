// Edge Function: formulario-publico
// Única porta de entrada da página pública /f/:slug (sem login). Duas ações:
//   { acao: 'carregar', slug }                     → formulário ativo + campos
//   { acao: 'enviar', slug, respostas, _site }     → valida e grava no CRM
//
// Roda com a service role key (ignora RLS) — por isso NÃO existe nenhuma
// policy anon nas tabelas: toda a validação acontece aqui antes de gravar
// (formulário ativo, campos conhecidos, obrigatoriedade, tipo, opções).
//
// Envio gera, para a empresa dona do formulário:
//   crm_linhas  → colunas mapeadas + data de entrada (hoje) + status inicial
//                 + Origem padrão do formulário, e formulario_id (origem)
//   clientes    → contato criado/vinculado quando há campo mapeado p/ Cliente
//   crm_fichas  → campos extras (sem coluna no CRM), só visíveis no drawer
// Tabelas/colunas: migrations 025, 026, 028 (estilo + após o envio), 029
// (apresentação: logo, capa, introdução, vídeo; botão no agradecimento) e 030
// (titulo_pagina), 032 (o que exibir no topo) e 034 (notificações: chama a
// formulario-notificacao em segundo plano depois de gravar o envio).
//
// Também atende o embed (public/embed.js): o modo "cru" chama esta função
// direto do site do escritório (CORS liberado, sem apikey — verify_jwt off).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const LIMITE = { text: 300, textarea: 5000, email: 254, phone: 30, number: 30, select: 300 } as Record<string, number>
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Campo = {
  id: string; label: string; tipo: string; obrigatorio: boolean; ordem: number
  opcoes: { value: string }[]; crm_coluna_id: string | null
}
type Coluna = { id: string; nome: string; tipo: string; slug: string | null; opcoes: string[] }

// crm_colunas.opcoes: colunas fixas = objeto { slug, items: [{value}] };
// colunas criadas pelo usuário = array [{value}] (mesma leitura de CRM.jsx)
function lerColuna(c: { id: string; nome: string; tipo: string; opcoes: unknown }): Coluna {
  const obj = c.opcoes && !Array.isArray(c.opcoes) ? c.opcoes as Record<string, unknown> : null
  const itens = obj ? (obj.items as { value: string }[] | undefined) || [] : (Array.isArray(c.opcoes) ? c.opcoes as { value: string }[] : [])
  return { id: c.id, nome: c.nome, tipo: c.tipo, slug: obj ? (obj.slug as string) || null : null, opcoes: itens.map(o => o.value) }
}

// Opções que valem para o campo: se mapeado para uma seleção do CRM, as da
// coluna (decisão da Fase 2); senão, as do próprio campo.
function opcoesDoCampo(campo: Campo, colunas: Map<string, Coluna>): string[] {
  const col = campo.crm_coluna_id ? colunas.get(campo.crm_coluna_id) : null
  if (col && col.tipo === 'select') return col.opcoes
  return (campo.opcoes || []).map(o => o.value)
}

function hojeSaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// O que a página/embed faz após um envio aceito (migration_028): redirecionar
// para a URL do escritório (ex.: página de obrigado com Google Tag / Pixel —
// o Prolu não dispara tracking) ou mostrar a mensagem, com textos opcionais.
function aposEnvio(form: Record<string, unknown>) {
  const url = typeof form.redirect_url === 'string' ? form.redirect_url.trim() : ''
  if (form.pos_envio === 'redirecionar' && /^https?:\/\/[^\s]+$/i.test(url)) return { redirecionar: url }
  // botão opcional na mensagem (migration_029): só com texto e URL http(s)
  const btnUrl = textoOuNull(form.obrigado_botao_url)
  const botao = textoOuNull(form.obrigado_botao_texto) && btnUrl && /^https?:\/\/[^\s]+$/i.test(btnUrl)
    ? { texto: textoOuNull(form.obrigado_botao_texto), url: btnUrl } : null
  return { sucesso: { titulo: textoOuNull(form.sucesso_titulo), texto: textoOuNull(form.sucesso_texto), botao } }
}

function textoOuNull(v: unknown) {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// ID de 11 caracteres de um link do YouTube (watch, youtu.be, embed, shorts,
// live) — mesma regra de src/utils/formularioEstilo.js
function idDoYoutube(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const m = url.trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i)
  return m ? m[1] : null
}

// Liga/desliga de exibição (migration_032): ausente (antes da migration) = exibe
const exibe = (form: Record<string, unknown>, coluna: string) => form[coluna] !== false

// Elementos de apresentação (migration_029) — imagens só https; o que estiver
// desligado em "O que exibir na página" (032) já sai nulo daqui
function apresentacao(form: Record<string, unknown>) {
  const img = (v: unknown) => { const s = textoOuNull(v); return s && /^https:\/\/[^\s]+$/i.test(s) ? s : null }
  return {
    logo: exibe(form, 'exibir_logo') ? img(form.logo_url) : null,
    capa: exibe(form, 'exibir_capa') ? img(form.capa_url) : null,
    intro: exibe(form, 'exibir_introducao') ? textoOuNull(form.intro_texto) : null,
    video_id: idDoYoutube(form.intro_video_youtube),
    video_posicao: form.intro_video_posicao === 'antes' ? 'antes' : 'depois',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) {
    return jsonResponse({ error: 'Formulário não encontrado.' }, 404)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: form } = await supabase
    .from('formularios')
    // '*' (e não lista de colunas): a função continua de pé mesmo durante uma
    // migration que crie/remova colunas de configuração (ex.: 028)
    .select('*, empresas(nome)')
    .eq('slug', slug)
    .maybeSingle()
  // formulário inativo responde igual a inexistente: não revela que existe
  if (!form || !form.ativo) return jsonResponse({ error: 'Este formulário não está disponível.' }, 404)

  const [{ data: camposRaw }, { data: colunasRaw }] = await Promise.all([
    supabase.from('formulario_campos')
      .select('id, label, tipo, obrigatorio, ordem, opcoes, crm_coluna_id')
      .eq('formulario_id', form.id).order('ordem'),
    supabase.from('crm_colunas').select('id, nome, tipo, opcoes').eq('empresa_id', form.empresa_id),
  ])
  const campos = (camposRaw || []) as Campo[]
  const colunas = new Map((colunasRaw || []).map(c => [c.id, lerColuna(c)]))

  // ── carregar ──
  if (body.acao === 'carregar') {
    const escritorio = (form.empresas as { nome?: string } | null)?.nome || null
    return jsonResponse({
      formulario: {
        // nome e descrição são internos (editor). No topo o visitante vê o nome
        // do escritório e, abaixo, o título da página (030) — cada um pode ser desligado (032)
        titulo: exibe(form, 'exibir_titulo') ? textoOuNull(form.titulo_pagina) : null, // sem reserva
        escritorio, // também usado no texto padrão do agradecimento e no alt do logo
        mostrar_escritorio: exibe(form, 'exibir_nome_escritorio'), // migration_032
        // só a página /f/:slug (e o iframe) aplica; o embed cru ignora (CSS do site)
        estilo: form.estilo || null,
        apresentacao: apresentacao(form),
      },
      campos: campos.map(c => ({
        id: c.id, label: c.label, tipo: c.tipo, obrigatorio: c.obrigatorio,
        opcoes: c.tipo === 'select' ? opcoesDoCampo(c, colunas) : [],
      })),
    }, 200)
  }

  if (body.acao !== 'enviar') return jsonResponse({ error: 'Ação inválida.' }, 400)

  // Honeypot: campo invisível na página; robô que preenche recebe "ok" e nada é gravado
  if (typeof body._site === 'string' && body._site.trim() !== '') return jsonResponse({ ok: true, ...aposEnvio(form) }, 200)

  const respostas = (body.respostas && typeof body.respostas === 'object') ? body.respostas as Record<string, unknown> : {}

  // ── validação campo a campo (ids desconhecidos são ignorados) ──
  const erros: Record<string, string> = {}
  const valores: Record<string, string> = {}
  for (const c of campos) {
    const bruto = respostas[c.id]
    const v = typeof bruto === 'string' ? bruto.trim() : (typeof bruto === 'number' ? String(bruto) : '')
    if (!v) {
      if (c.obrigatorio) erros[c.id] = 'Campo obrigatório.'
      continue
    }
    if (v.length > (LIMITE[c.tipo] ?? 300)) { erros[c.id] = 'Resposta muito longa.'; continue }
    if (c.tipo === 'email' && !EMAIL_RE.test(v)) { erros[c.id] = 'E-mail inválido.'; continue }
    if (c.tipo === 'phone') {
      const digitos = v.replace(/\D/g, '')
      if (digitos.length < 8 || digitos.length > 15) { erros[c.id] = 'Telefone inválido.'; continue }
    }
    if (c.tipo === 'number' && !Number.isFinite(Number(v.replace(',', '.')))) { erros[c.id] = 'Informe um número.'; continue }
    if (c.tipo === 'select' && !opcoesDoCampo(c, colunas).includes(v)) { erros[c.id] = 'Opção inválida.'; continue }
    valores[c.id] = v
  }
  if (Object.keys(erros).length) return jsonResponse({ error: 'Verifique os campos destacados.', erros }, 422)

  // ── monta o registro do CRM ──
  const porSlug = (s: string) => [...colunas.values()].find(c => c.slug === s)
  const linha: Record<string, unknown> = {}
  const extras: { campo_id: string; label: string; tipo: string; valor: string }[] = []
  let nomeCliente: string | null = null

  for (const c of campos) {
    const v = valores[c.id]
    if (v === undefined) continue
    const col = c.crm_coluna_id ? colunas.get(c.crm_coluna_id) : null
    if (!col) {
      extras.push({ campo_id: c.id, label: c.label || 'Pergunta', tipo: c.tipo, valor: v })
      continue
    }
    if (col.tipo === 'number' || col.tipo === 'money') linha[col.id] = Number(v.replace(',', '.'))
    else linha[col.id] = v
    if (col.tipo === 'client') nomeCliente = v
  }

  // padrões de um pedido novo (só se nenhum campo mapeado já preencheu)
  const colEntrada = porSlug('data_entrada')
  if (colEntrada && linha[colEntrada.id] === undefined) linha[colEntrada.id] = hojeSaoPaulo()
  const colStatus = porSlug('status')
  if (colStatus && linha[colStatus.id] === undefined && colStatus.opcoes.length) {
    linha[colStatus.id] = colStatus.opcoes.includes('Pedido de orçamento') ? 'Pedido de orçamento' : colStatus.opcoes[0]
  }
  const colOrigem = porSlug('origem')
  if (colOrigem && linha[colOrigem.id] === undefined && form.origem_crm) linha[colOrigem.id] = form.origem_crm

  const { data: nova, error: linhaErr } = await supabase
    .from('crm_linhas')
    .insert({ empresa_id: form.empresa_id, valores: linha, formulario_id: form.id })
    .select('id').single()
  if (linhaErr || !nova) {
    console.error('[formulario-publico] crm_linhas', linhaErr)
    return jsonResponse({ error: 'Não foi possível enviar agora. Tente novamente.' }, 500)
  }

  if (extras.length) {
    const { error: fichaErr } = await supabase.from('crm_fichas').insert({
      linha_id: nova.id, empresa_id: form.empresa_id, formulario_id: form.id,
      formulario_nome: form.nome, respostas: extras,
    })
    if (fichaErr) {
      // sem a ficha o pedido ficaria incompleto: desfaz o registro
      console.error('[formulario-publico] crm_fichas', fichaErr)
      await supabase.from('crm_linhas').delete().eq('id', nova.id)
      return jsonResponse({ error: 'Não foi possível enviar agora. Tente novamente.' }, 500)
    }
  }

  // ── contato (Cliente): vincula ao existente com o mesmo nome ou cria ──
  // Por último, depois do registro e da ficha gravados — se algo antes
  // falhasse, não sobra contato órfão.
  if (nomeCliente) {
    const { data: existentes } = await supabase
      .from('clientes').select('id').eq('empresa_id', form.empresa_id)
      // ilike sem curinga = igualdade sem diferenciar maiúsculas; escapa % _ \ do nome
      .ilike('nome', nomeCliente.replace(/[%_\\]/g, (m) => '\\' + m)).limit(1)
    if (!existentes?.length) {
      const primeiro = (tipo: string) => campos.find(c => c.tipo === tipo && valores[c.id] !== undefined)
      const email = primeiro('email'); const tel = primeiro('phone')
      const { error: cliErr } = await supabase.from('clientes').insert({
        empresa_id: form.empresa_id, nome: nomeCliente,
        email: email ? valores[email.id] : null, telefone: tel ? valores[tel.id] : null,
      })
      if (cliErr) console.error('[formulario-publico] contato', cliErr) // não impede o registro no CRM
    }
  }

  // ── notificação (Fase 4): em segundo plano, sem atrasar a resposta ao visitante ──
  // Só chama se o formulário tem e-mail ligado (a formulario-notificacao confere
  // de novo). waitUntil mantém o fetch vivo depois da resposta — sem ele o
  // runtime pode encerrar a função e cortar a chamada no meio.
  if (form.notif_ativa === true && form.notif_email_ativa === true) {
    const respostasNotif = campos
      .filter(c => valores[c.id] !== undefined)
      .map(c => ({ label: c.label || 'Pergunta', valor: valores[c.id], tipo: c.tipo }))
    const tarefa = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/formulario-notificacao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ formulario_id: form.id, respostas: respostasNotif, crm_linha_id: nova.id }),
    })
      .then(async r => { if (!r.ok) console.error('[formulario-publico] notificação', r.status, await r.text()) })
      .catch(e => console.error('[formulario-publico] notificação', e))
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime
    if (runtime?.waitUntil) runtime.waitUntil(tarefa)
  }

  return jsonResponse({ ok: true, ...aposEnvio(form) }, 200)
})
