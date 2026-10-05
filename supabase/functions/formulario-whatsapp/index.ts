// Edge Function: formulario-whatsapp (migration_038)
// Avisa o escritório por WhatsApp a cada novo preenchimento de formulário.
// Um número único da Prolu envia para todos os escritórios, sempre pelo
// template aprovado "novo_lead_formulario" (categoria Utilidade, 7 parâmetros
// no corpo). Chamada SÓ pela formulario-publico, em segundo plano, depois de
// gravar o envio:
//   { formulario_id, crm_linha_id, respostas: [{ label, valor, tipo, campo_id }] }
// Falha aqui nunca afeta o lead (já está gravado) — fica registrada em
// whatsapp_notif_log.
//
// Publicada com --no-verify-jwt: a própria função exige a service role key no
// Authorization (comparação em tempo constante) — sem isso qualquer um
// dispararia mensagens.
//
// Secrets (supabase secrets set …). Só o token é segredo de verdade; os demais
// têm o valor abaixo como padrão:
//   WHATSAPP_TOKEN            obrigatório (token permanente do app na Meta)
//   WHATSAPP_PHONE_NUMBER_ID  1376822895512393
//   WHATSAPP_API_VERSION      v26.0
//   WHATSAPP_TEMPLATE_NAME    novo_lead_formulario
//   WHATSAPP_TEMPLATE_LANG    pt_BR

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mesmaChave(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  let dif = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return dif === 0
}

// Parâmetro de template da Meta: sem quebra de linha/tab e sem mais de 4
// espaços seguidos (senão a API recusa), até `max` caracteres, nunca vazio.
function param(texto: unknown, max: number) {
  const s = String(texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {5,}/g, ' ').trim()
  const cortado = s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
  return cortado || '-'
}

// destino: E.164 sem "+" (Brasil: 0 inicial vira 55; 10/11 dígitos ganham 55)
function numeroDestino(valor: unknown): string | null {
  let d = String(valor ?? '').replace(/\D/g, '')
  if (d.startsWith('0')) d = '55' + d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d.length === 12 || d.length === 13 ? d : null
}

// telefone do lead para o link wa.me (E.164 → só dígitos; antigo sem DDI → 55)
function numeroLead(valor: string): string | null {
  const d = valor.replace(/\D/g, '')
  if (valor.trim().startsWith('+')) return d.length >= 8 && d.length <= 15 ? d : null
  if (d.length === 10 || d.length === 11) return '55' + d
  return d.length >= 12 && d.length <= 15 ? d : null
}

type Resposta = { label: string; valor: string; tipo: string; campo_id: string }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!chave || !mesmaChave(req.headers.get('Authorization') || '', `Bearer ${chave}`)) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Corpo inválido.' }, 400) }
  const formularioId = typeof body.formulario_id === 'string' ? body.formulario_id : ''
  if (!UUID_RE.test(formularioId)) return json({ error: 'formulario_id inválido.' }, 400)
  const crmLinhaId = typeof body.crm_linha_id === 'string' && UUID_RE.test(body.crm_linha_id) ? body.crm_linha_id : null
  const respostas: Resposta[] = (Array.isArray(body.respostas) ? body.respostas : [])
    .slice(0, 100)
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      label: String(r.label ?? 'Pergunta'), valor: String(r.valor ?? ''),
      tipo: String(r.tipo ?? 'text'), campo_id: String(r.campo_id ?? ''),
    }))

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chave)
  const { data: form } = await supabase
    .from('formularios')
    .select('id, empresa_id, nome, notif_ativa, notif_whatsapp_ativa, notif_whatsapp_campos, empresas(whatsapp_numero, whatsapp_optin)')
    .eq('id', formularioId)
    .maybeSingle()
  if (!form) return json({ error: 'Formulário não encontrado.' }, 404)

  const registrar = async (status: 'enviado' | 'erro' | 'ignorado', extra: { whatsapp_message_id?: string; erro?: string } = {}) => {
    const { error } = await supabase.from('whatsapp_notif_log').insert({
      empresa_id: form.empresa_id, formulario_id: form.id, crm_linha_id: crmLinhaId, status, ...extra,
    })
    if (error) console.error('[formulario-whatsapp] log', error)
  }
  const ignorar = async (motivo: string) => {
    await registrar('ignorado', { erro: motivo })
    return json({ ok: true, enviado: false, motivo, crm_linha_id: crmLinhaId }, 200)
  }

  const empresa = (form.empresas || {}) as { whatsapp_numero?: string | null; whatsapp_optin?: boolean }
  // o interruptor geral "Ativar notificações" da aba também precisa estar ligado
  if (!form.notif_ativa) return ignorar('notificações desligadas no formulário')
  if (!form.notif_whatsapp_ativa) return ignorar('WhatsApp desligado no formulário')
  if (!empresa.whatsapp_optin) return ignorar('escritório sem opt-in de WhatsApp')
  if (!empresa.whatsapp_numero) return ignorar('escritório sem número de WhatsApp')
  const destino = numeroDestino(empresa.whatsapp_numero)
  if (!destino) return ignorar(`número do escritório inválido: ${empresa.whatsapp_numero}`)

  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!token) {
    console.error('[formulario-whatsapp] WHATSAPP_TOKEN não configurado')
    await registrar('erro', { erro: 'WHATSAPP_TOKEN não configurado' })
    return json({ ok: true, enviado: false, crm_linha_id: crmLinhaId }, 200)
  }

  // campos da mensagem: os escolhidos no editor (na ordem salva); sem escolha,
  // os 5 primeiros do formulário. Sem resposta → "-".
  let ids: string[] = (form.notif_whatsapp_campos || []).slice(0, 5)
  if (!ids.length) {
    const { data: campos } = await supabase.from('formulario_campos').select('id').eq('formulario_id', form.id).order('ordem').limit(5)
    ids = (campos || []).map(c => c.id)
  }
  // negrito do WhatsApp (*…*): asterisco dentro do texto quebraria a marcação.
  // Sem "\n" nos parâmetros — a Meta recusa o envio (#132018).
  const semAsterisco = (s: unknown) => String(s ?? '').replace(/\*/g, '')
  const porCampo = new Map(respostas.map(r => [r.campo_id, r]))
  const linhas = [0, 1, 2, 3, 4].map(i => {
    const r = ids[i] ? porCampo.get(ids[i]) : undefined
    if (!r || !r.valor.trim()) return '-'
    // *pergunta:* resposta — corta só a resposta, para não perder o fecho do negrito
    const pergunta = `*${param(semAsterisco(r.label), 80)}:* `
    return pergunta + param(r.valor, 200 - pergunta.length)
  })
  const telefone = respostas.find(r => r.tipo === 'phone' && r.valor.trim())
  const lead = telefone ? numeroLead(telefone.valor) : null
  const parametros = [`*${param(semAsterisco(form.nome), 58)}*`, ...linhas, lead ? `https://wa.me/${lead}` : '-']

  const versao = Deno.env.get('WHATSAPP_API_VERSION') || 'v26.0'
  const numeroId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '1376822895512393'
  let resp: Response
  try {
    resp = await fetch(`https://graph.facebook.com/${versao}/${numeroId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'novo_lead_formulario',
          language: { code: Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'pt_BR' },
          components: [{ type: 'body', parameters: parametros.map(text => ({ type: 'text', text })) }],
        },
      }),
    })
  } catch (e) {
    await registrar('erro', { erro: `falha de rede: ${String(e).slice(0, 500)}` })
    return json({ ok: true, enviado: false, crm_linha_id: crmLinhaId }, 200)
  }

  const texto = await resp.text()
  if (!resp.ok) {
    console.error('[formulario-whatsapp] Meta', resp.status, texto)
    await registrar('erro', { erro: `HTTP ${resp.status}: ${texto.slice(0, 1000)}` })
    return json({ ok: true, enviado: false, crm_linha_id: crmLinhaId }, 200)
  }
  let messageId: string | undefined
  try { messageId = JSON.parse(texto)?.messages?.[0]?.id } catch { /* corpo inesperado: segue sem id */ }
  await registrar('enviado', { whatsapp_message_id: messageId })
  return json({ ok: true, enviado: true, crm_linha_id: crmLinhaId }, 200)
})
