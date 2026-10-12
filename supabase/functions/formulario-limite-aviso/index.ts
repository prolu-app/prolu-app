// Edge Function: formulario-limite-aviso (migration_054)
// Avisa por e-mail os usuários master do escritório que os formulários
// pararam de receber respostas este mês (limite de envios do plano).
// Chamada SÓ pela formulario-publico, em segundo plano, no envio bloqueado:
//   { empresa_id, mes: 'YYYY-MM-01' }
// Uma vez por escritório por mês: form_marcar_aviso_limite marca
// formulario_envios_mes.aviso_limite_em de forma atômica — só quem marcou
// envia. Se o Resend falhar, a marcação é desfeita para tentar no próximo
// bloqueio.
//
// Publicada com --no-verify-jwt: a própria função exige a service role key
// no Authorization (sem isso qualquer um dispararia e-mails).
// Secrets: RESEND_API_KEY (obrigatório), NOTIF_EMAIL_FROM e APP_URL
// (opcionais, mesmos de formulario-notificacao).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MES_RE = /^\d{4}-\d{2}-01$/

// comparação em tempo constante (mesma de formulario-notificacao)
function mesmaChave(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  let dif = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return dif === 0
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function montarEmail(p: { escritorio: string | null; limite: number | null; mesNome: string; planosUrl: string; formulariosUrl: string }) {
  const verde = '#CBE921', tinta = '#121210', cinza = '#5f5f58', fundo = '#f3f2ed'
  const qtd = p.limite ? `os ${p.limite} envios` : 'os envios'
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:${fundo};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${fundo};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background:${verde};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cinza};">Formulários</div>
          <div style="font-size:22px;font-weight:700;color:${tinta};margin:6px 0 2px;">Seus formulários pausaram as respostas em ${esc(p.mesNome)}</div>
          ${p.escritorio ? `<div style="font-size:14px;color:${cinza};">${esc(p.escritorio)}</div>` : ''}
        </td></tr>
        <tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.6;color:${tinta};">
          <p style="margin:0 0 12px;">O escritório usou ${qtd} de formulário incluídos no plano neste mês. Os pedidos que já chegaram estão guardados no CRM, e nada foi apagado.</p>
          <p style="margin:0 0 12px;">Até o fim do mês, os formulários mostram aos visitantes que não estão recebendo respostas no momento. No dia 1º, a contagem recomeça e eles voltam a receber automaticamente.</p>
          <p style="margin:0;">Para voltar a receber agora, sem limite, é só mudar de plano.</p>
        </td></tr>
        <tr><td style="padding:22px 28px 8px;">
          <a href="${p.planosUrl}" style="display:inline-block;background:${verde};color:${tinta};text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:999px;">Ver planos</a>
        </td></tr>
        <tr><td style="padding:6px 28px 30px;font-size:13px;color:${cinza};">
          Acompanhe os envios do mês em <a href="${p.formulariosUrl}" style="color:${tinta};">Formulários</a>.
        </td></tr>
      </table>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${cinza};margin-top:14px;">Enviado pelo Prolu App</div>
    </td></tr>
  </table></body></html>`
  const texto = [
    `Seus formulários pausaram as respostas em ${p.mesNome}${p.escritorio ? ` (${p.escritorio})` : ''}`, '',
    `O escritório usou ${qtd} de formulário incluídos no plano neste mês. Os pedidos que já chegaram estão guardados no CRM, e nada foi apagado.`, '',
    'Até o fim do mês, os formulários mostram aos visitantes que não estão recebendo respostas no momento. No dia 1º, a contagem recomeça e eles voltam a receber automaticamente.', '',
    `Para voltar a receber agora, sem limite, é só mudar de plano: ${p.planosUrl}`, '',
    `Envios do mês: ${p.formulariosUrl}`,
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
  const empresaId = typeof body.empresa_id === 'string' ? body.empresa_id : ''
  const mes = typeof body.mes === 'string' ? body.mes : ''
  if (!UUID_RE.test(empresaId) || !MES_RE.test(mes)) return json({ error: 'Parâmetros inválidos.' }, 400)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[formulario-limite-aviso] RESEND_API_KEY não configurada')
    return json({ error: 'E-mail não configurado.' }, 500)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chave)

  // marcação atômica: só segue quem marcou agora (uma vez por mês)
  const { data: marcou, error: marcaErr } = await supabase.rpc('form_marcar_aviso_limite', { p_empresa_id: empresaId, p_mes: mes })
  if (marcaErr) {
    console.error('[formulario-limite-aviso] marcar', marcaErr)
    return json({ error: 'Falha ao registrar o aviso.' }, 500)
  }
  if (marcou !== true) return json({ ok: true, enviado: false, motivo: 'aviso já enviado neste mês' }, 200)

  const desmarcar = () => supabase.rpc('form_marcar_aviso_limite', { p_empresa_id: empresaId, p_mes: mes, p_desmarcar: true })

  const [{ data: empresa }, { data: masters }, { data: situacao }] = await Promise.all([
    supabase.from('empresas').select('nome').eq('id', empresaId).maybeSingle(),
    supabase.from('usuarios').select('email').eq('empresa_id', empresaId).eq('role', 'master'),
    supabase.rpc('form_situacao_envios', { p_empresa_id: empresaId }),
  ])
  const destinatarios = [...new Set((masters || [])
    .map((u: { email?: string | null }) => String(u.email || '').trim().toLowerCase())
    .filter((e: string) => EMAIL_RE.test(e)))].slice(0, 10)
  if (!destinatarios.length) {
    await desmarcar()
    return json({ ok: true, enviado: false, motivo: 'escritório sem usuário master com e-mail' }, 200)
  }

  const appUrl = (Deno.env.get('APP_URL') || 'https://app.prolu.com.br').replace(/\/+$/, '')
  const [ano, mm] = mes.split('-').map(Number)
  const { html, texto } = montarEmail({
    escritorio: empresa?.nome || null,
    limite: typeof situacao?.limite === 'number' ? situacao.limite : null,
    mesNome: `${MESES[mm - 1]} de ${ano}`,
    planosUrl: `${appUrl}/planos`,
    formulariosUrl: `${appUrl}/formularios`,
  })

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('NOTIF_EMAIL_FROM') || 'Prolu <notificacoes@mail.prolu.com.br>',
      to: destinatarios,
      subject: 'Seus formulários pausaram as respostas este mês',
      html,
      text: texto,
    }),
  })
  if (!resp.ok) {
    console.error('[formulario-limite-aviso] Resend', resp.status, await resp.text())
    await desmarcar()
    return json({ error: 'Falha ao enviar o e-mail.' }, 502)
  }
  return json({ ok: true, enviado: true }, 200)
})
