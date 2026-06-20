import { createClient } from '@supabase/supabase-js'

// As variáveis vêm do .env (ver .env.example).
// IMPORTANTE: usar a Legacy anon key (começa com "eyJ"), não a Publishable key nova.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Aviso claro em desenvolvimento se faltar configuração.
  console.warn(
    '[Prolu App] Supabase não configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env'
  )
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Flag útil para telas decidirem entre dados reais e dados de demonstração.
export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey)
