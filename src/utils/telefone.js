// Telefone no CRM (coluna fixa "Telefone", tipo 'phone' — migration_035).
// Sem biblioteca: o CRM carrega em toda sessão, e o formato aqui é o mesmo
// que o formulário público grava (react-phone-number-input → E.164).
//
//   guardado:  +5511998765432      (E.164 — igual ao que vem do formulário)
//   exibido:   (11) 99876-5432     (nacional, para números do Brasil)
//   digitando: máscara brasileira; começando com "+" fica internacional livre
// Valores antigos que não são E.164 (digitados à mão) são mostrados como estão.

const so = s => String(s ?? '').replace(/\D/g, '')

// máscara progressiva de um número brasileiro (DDD + 8 ou 9 dígitos)
function mascaraBR(d) {
  d = d.slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  const ddd = d.slice(0, 2), n = d.slice(2)
  if (n.length <= 4) return `(${ddd}) ${n}`
  const corte = n.length === 9 ? 5 : 4 // celular (9 dígitos) ou fixo (8)
  return `(${ddd}) ${n.slice(0, corte)}-${n.slice(corte)}`
}

export function formatarTelefone(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const d = so(s)
  if (s.startsWith('+55') && (d.length === 12 || d.length === 13)) return mascaraBR(d.slice(2))
  if (s.startsWith('+')) return `+${d}`
  return s
}

// texto do campo enquanto a pessoa digita
export function mascaraTelefone(texto) {
  const s = String(texto ?? '')
  if (s.trim().startsWith('+')) return '+' + so(s).slice(0, 15)
  return mascaraBR(so(s))
}

// texto do campo → valor guardado (E.164 quando dá para entender o número)
export function telefoneParaSalvar(texto) {
  const s = String(texto ?? '').trim()
  if (!s) return null
  const d = so(s)
  if (s.startsWith('+')) return d.length >= 8 ? `+${d}` : s
  if (d.length === 10 || d.length === 11) return `+55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `+${d}`
  return s // não dá para afirmar o formato: guarda como digitado, sem perder nada
}

