import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../services/supabaseClient.js'

const AuthContext = createContext(null)

/**
 * Usuário de demonstração usado enquanto o Supabase não está conectado.
 * Quando as chaves estiverem no .env, o login real assume.
 */
const DEMO_USER = {
  id: 'demo-andre',
  email: 'andresouzavr@gmail.com',
  nome: 'André Souza',
  empresa: 'Estúdio Exemplo',
  role: 'master', // master = acesso total (cria/edita conteúdo); comum = acesso limitado
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseReady) {
      // Modo demonstração: entra direto como André (master).
      setUser(DEMO_USER)
      setLoading(false)
      return
    }

    // Sessão real do Supabase.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) hydrateUser(data.session.user)
      else setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) hydrateUser(session.user)
      else { setUser(null); setLoading(false) }
    })

    return () => sub?.subscription?.unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega dados do perfil (tabela usuarios) sobre o auth user do Supabase.
  async function hydrateUser(authUser) {
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('id, nome, role, empresa_id, empresas(nome)')
        .eq('auth_id', authUser.id)
        .single()

      setUser({
        id: data?.id || authUser.id,
        email: authUser.email,
        nome: data?.nome || authUser.email,
        empresa: data?.empresas?.nome || '',
        empresaId: data?.empresa_id || null,
        role: data?.role || 'comum',
      })
    } catch {
      setUser({
        id: authUser.id,
        email: authUser.email,
        nome: authUser.email,
        empresa: '',
        role: 'comum',
      })
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    if (!supabaseReady) { setUser(DEMO_USER); return { error: null } }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    if (supabaseReady) await supabase.auth.signOut()
    setUser(null)
  }

  const isMaster = user?.role === 'master'

  return (
    <AuthContext.Provider value={{ user, loading, isMaster, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}
