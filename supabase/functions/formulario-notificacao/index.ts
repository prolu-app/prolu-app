// Edge Function: formulario-notificacao (Fase 4, migration_034)
// Avisa o escritório por e-mail a cada novo preenchimento de formulário.
// Chamada SÓ pela formulario-publico, em segundo plano, depois de gravar o
// envio:  { formulario_id, respostas: [{ label, valor, tipo }], crm_linha_id }
//
// Publicada com --no-verify-jwt (o gateway não confere o token), então a
// própria função exige a service role key no Authorization — sem isso
// qualquer um poderia disparar e-mails para os escritórios.
//
// Envio pelo Resend. Secrets (supabase secrets set …):
//   RESEND_API_KEY   obrigatório
//   NOTIF_EMAIL_FROM opcional — padrão "Prolu <notificacoes@mail.prolu.com.br>"
//                    (o domínio precisa estar verificado no Resend — o verificado é
//                    mail.prolu.com.br; prolu.com.br NÃO está, e o Resend recusa)
//   APP_URL          opcional — padrão https://app.prolu.com.br
// WhatsApp: ainda não envia (só a interface no editor, "Em breve").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// comparação em tempo constante (não vaza, pelo tempo de resposta, quanto da chave bateu)
function mesmaChave(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  let dif = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return dif === 0
}

// respostas são texto digitado por visitantes: escapadas antes de entrar no HTML
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// número para o link do WhatsApp (wa.me/<dígitos com DDI>): E.164 → só dígitos;
// telefones antigos digitados sem DDI (10 ou 11 dígitos) → assume Brasil (55)
function numeroWhatsApp(valor: string): string | null {
  const d = valor.replace(/\D/g, '')
  if (valor.trim().startsWith('+')) return d.length >= 8 && d.length <= 15 ? d : null
  if (d.length === 10 || d.length === 11) return '55' + d
  return d.length >= 12 && d.length <= 15 ? d : null
}

// telefone legível no e-mail: +55 11 99876-5432 (sem depender de biblioteca)
function telefoneLegivel(valor: string) {
  const d = valor.replace(/\D/g, '')
  if (valor.startsWith('+55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4), n = d.slice(4)
    return `(${ddd}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`
  }
  return valor
}

type Resposta = { label: string; valor: string; tipo: string }

function montarEmail(p: { formulario: string; escritorio: string | null; respostas: Resposta[]; whatsapp: string | null; crmUrl: string }) {
  const verde = '#CBE921', tinta = '#121210', cinza = '#5f5f58', fundo = '#f3f2ed'
  const linhas = p.respostas.map(r => `
        <tr><td style="padding:14px 0;border-bottom:1px solid #ecebe5;">
          <div style="font-size:13px;font-weight:700;color:${tinta};margin:0 0 4px;">${esc(r.label)}</div>
          <div style="font-size:15px;line-height:1.5;color:${tinta};white-space:pre-wrap;">${esc(r.tipo === 'phone' ? telefoneLegivel(r.valor) : r.valor)}</div>
        </td></tr>`).join('')
  const whats = p.whatsapp ? `
        <tr><td style="padding:18px 0 0;font-size:14px;line-height:1.5;color:${tinta};">
          Entre em contato com o cliente pelo WhatsApp:
          <a href="https://wa.me/${p.whatsapp}" style="color:${tinta};font-weight:700;">https://wa.me/${p.whatsapp}</a>
        </td></tr>` : ''
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:${fundo};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${fundo};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background:${verde};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cinza};">Novo preenchimento</div>
          <div style="font-size:22px;font-weight:700;color:${tinta};margin:6px 0 2px;">${esc(p.formulario)}</div>
          ${p.escritorio ? `<div style="font-size:14px;color:${cinza};">${esc(p.escritorio)}</div>` : ''}
        </td></tr>
        <tr><td style="padding:4px 28px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}${whats}</table>
        </td></tr>
        <tr><td style="padding:22px 28px 30px;">
          <a href="${p.crmUrl}" style="display:inline-block;background:${verde};color:${tinta};text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:999px;">Ver no CRM</a>
        </td></tr>
      </table>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${cinza};margin-top:14px;">Enviado pelo Prolu App</div>
    </td></tr>
  </table></body></html>`
  const texto = [
    `Novo preenchimento — ${p.formulario}${p.escritorio ? ` (${p.escritorio})` : ''}`, '',
    ...p.respostas.map(r => `${r.label}:\n${r.tipo === 'phone' ? telefoneLegivel(r.valor) : r.valor}\n`),
    ...(p.whatsapp ? [`Entre em contato com o cliente pelo WhatsApp: https://wa.me/${p.whatsapp}`, ''] : []),
    `Ver no CRM: ${p.crmUrl}`,
  ].join('\n')
  return { html, texto }
}

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
  const respostas: Resposta[] = (Array.isArray(body.respostas) ? body.respostas : [])
    .slice(0, 100)
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      label: String(r.label ?? 'Pergunta').slice(0, 300),
      valor: String(r.valor ?? '').slice(0, 5000),
      tipo: String(r.tipo ?? 'text'),
    }))
    .filter(r => r.valor.trim())

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chave)
  const { data: form, error } = await supabase
    .from('formularios')
    .select('nome, notif_ativa, notif_email_ativa, notif_email_destinatarios, empresas(nome)')
    .eq('id', formularioId)
    .maybeSingle()
  if (error || !form) return json({ error: 'Formulário não encontrado.' }, 404)

  const destinatarios = (form.notif_email_destinatarios || [])
    .map((e: string) => String(e).trim().toLowerCase())
    .filter((e: string) => EMAIL_RE.test(e))
    .slice(0, 10)
  if (!form.notif_ativa || !form.notif_email_ativa || !destinatarios.length) {
    return json({ ok: true, enviado: false, motivo: 'notificação por e-mail desligada ou sem destinatários' }, 200)
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[formulario-notificacao] RESEND_API_KEY não configurada')
    return json({ error: 'E-mail não configurado.' }, 500)
  }

  const telefone = respostas.find(r => r.tipo === 'phone')
  const emailVisitante = respostas.find(r => r.tipo === 'email' && EMAIL_RE.test(r.valor.trim()))
  const appUrl = (Deno.env.get('APP_URL') || 'https://app.prolu.com.br').replace(/\/+$/, '')
  const { html, texto } = montarEmail({
    formulario: form.nome,
    escritorio: (form.empresas as { nome?: string } | null)?.nome || null,
    respostas,
    whatsapp: telefone ? numeroWhatsApp(telefone.valor) : null,
    crmUrl: `${appUrl}/crm`,
  })

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('NOTIF_EMAIL_FROM') || 'Prolu <notificacoes@mail.prolu.com.br>',
      to: destinatarios,
      subject: `Novo preenchimento — ${form.nome}`.replace(/[\r\n]+/g, ' '),
      html,
      text: texto,
      // responder ao e-mail já fala com o visitante, quando ele informou um e-mail
      ...(emailVisitante ? { reply_to: emailVisitante.valor.trim() } : {}),
    }),
  })
  if (!resp.ok) {
    console.error('[formulario-notificacao] Resend', resp.status, await resp.text())
    return json({ error: 'Falha ao enviar o e-mail.' }, 502)
  }
  return json({ ok: true, enviado: true, crm_linha_id: body.crm_linha_id ?? null }, 200)
})
