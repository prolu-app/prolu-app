// Edge Function: invite-user
// Envia o convite por e-mail via Supabase Auth (inviteUserByEmail) e só
// então registra a linha em `convites` — a aba Equipe usa essa linha pra
// listar convites pendentes, e /aceitar-convite pra saber qual role e
// empresa aplicar quando a pessoa confirma o cadastro.
//
// Roda com a service role key, então ignora RLS: por isso a checagem de
// permissão (quem pode convidar com qual role) é feita aqui dentro, e não
// só no front-end. Quem convida sai do JWT do header Authorization
// (supabase.functions.invoke já envia o da sessão) — o `convidado_por` do
// corpo é ignorado, senão bastaria saber o id de um master para convidar
// em nome dele.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mesma regra de src/contexts/AuthContext.jsx (roleValido): só Master (e
// Prolu admin) convida Master; Gestor convida Gestor ou Colaborador;
// Colaborador não convida. Papel fora da lista é recusado.
const PAPEIS_CONVIDAVEIS = {
  prolu_admin: ['master', 'gestor', 'comum'],
  master: ['master', 'gestor', 'comum'],
  gestor: ['gestor', 'comum'],
}

function roleValido(roleCriador, roleConvite) {
  return (PAPEIS_CONVIDAVEIS[roleCriador] || []).includes(roleConvite)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400)
  }

  // `convidado_por` ainda chega do front atual, mas não é usado
  const { email, nome, role, empresa_id } = body

  if (!email || !role || !empresa_id) {
    return jsonResponse({ error: 'Dados incompletos para o convite.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )

  // Quem está chamando: valida o JWT no Supabase Auth. A anon key (sem
  // usuário) ou um token expirado/forjado não passam daqui.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const { data: authData, error: authErr } = token
    ? await supabase.auth.getUser(token)
    : { data: null, error: true }
  if (authErr || !authData?.user) {
    return jsonResponse({ error: 'Faça login para convidar.' }, 401)
  }

  // Confirma quem está convidando e se pode atribuir esse papel dentro
  // dessa empresa — a service role ignora RLS, então essa é a única
  // barreira real contra um gestor convidando alguém como master (ou
  // convidando para uma empresa que não é a dele).
  const { data: criador, error: criadorErr } = await supabase
    .from('usuarios')
    .select('id, role, empresa_id')
    .eq('auth_id', authData.user.id)
    .maybeSingle()

  if (criadorErr || !criador || criador.empresa_id !== empresa_id) {
    return jsonResponse({ error: 'Não autorizado a convidar para esse escritório.' }, 403)
  }

  if (!roleValido(criador.role, role)) {
    return jsonResponse({ error: 'Você não pode convidar com essa permissão.' }, 403)
  }

  // Plano (migration_045): convidar pessoas é do Business para cima, e só com
  // a conta ativa. empresa_libera() é a matriz do banco (espelho de
  // src/utils/planos.js) — erro na checagem também bloqueia.
  const { data: libera, error: planoErr } = await supabase
    .rpc('empresa_libera', { p_empresa_id: empresa_id, p_recurso: 'equipe_convites' })
  if (planoErr || libera !== true) {
    if (planoErr) console.error('[invite-user] empresa_libera', planoErr)
    return jsonResponse({ error: 'Convidar pessoas não está disponível no plano atual.', codigo: 'plano_bloqueado' }, 403)
  }

  // Cria o usuário em auth.users já confirmado e dispara o e-mail com o
  // link mágico de convite. Os metadados viajam com o link e são lidos de
  // novo em /aceitar-convite (via a linha em `convites`, fonte da verdade).
  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${Deno.env.get('SITE_URL')}/aceitar-convite`,
    data: { nome, role, empresa_id, convidado_por: criador.id },
  })

  if (inviteErr) {
    return jsonResponse({ error: inviteErr.message }, 400)
  }

  // upsert (não insert): reenviar um convite já pendente pra esse
  // e-mail/empresa cai no mesmo unique (empresa_id, email) — aqui a gente
  // quer atualizar a linha existente, não falhar com 23505.
  const { error: convError } = await supabase.from('convites').upsert({
    email,
    nome,
    role,
    empresa_id,
    convidado_por: criador.id,
    status: 'pendente',
  }, { onConflict: 'empresa_id,email' })

  if (convError) {
    return jsonResponse({ error: convError.message }, 400)
  }

  return jsonResponse({ ok: true }, 200)
})
