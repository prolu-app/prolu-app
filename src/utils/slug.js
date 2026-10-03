// Slugs de URL: formulário (formularios.slug, migration_026) e escritório
// (empresas.slug, migration_036) — mesmo formato: minúsculas, números e
// hífens simples, 3 a 60 caracteres. O do formulário é único dentro do
// escritório; o do escritório, no sistema todo.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(texto) {
  const s = (texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)
    .replace(/^-+|-+$/g, '')
  if (!s) return 'formulario'
  return s.length < 3 ? `${s}-form` : s
}

export function slugValido(s) {
  return SLUG_RE.test(s) && s.length >= 3 && s.length <= 60
}

// sufixo curto para desempatar quando o endereço já existe (unique global)
export function comSufixo(base) {
  return `${base.slice(0, 54)}-${Math.random().toString(36).slice(2, 6)}`
}

// link público: /e/<slug do escritório>/<slug do formulário>
export function urlPublica(slugEscritorio, slugFormulario) {
  return `${window.location.origin}/e/${slugEscritorio}/${slugFormulario}`
}
