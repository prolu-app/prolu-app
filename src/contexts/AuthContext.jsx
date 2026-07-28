import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../services/supabaseClient.js'

const AuthContext = createContext(null)

/**
 * Usuário de demonstração usado enquanto o Supabase não está configurado
 * (ex: rodando local sem .env). Em produção com as chaves certas, nunca entra aqui.
 */
const DEMO_USER = {
  id: 'demo-andre',
  email: 'andresouzavr@gmail.com',
  nome: 'André Souza',
  empresa: 'Estúdio Exemplo',
  role: 'prolu_admin',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseReady) {
      setUser(DEMO_USER)
      setLoading(false)
      return
    }

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
  // Se o usuário autenticado ainda não tem registro em `usuarios`
  // (acabou de confirmar o cadastro), devolve needsOnboarding = true.
  async function hydrateUser(authUser) {
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('id, nome, role, empresa_id, empresas(nome)')
        .eq('auth_id', authUser.id)
        .maybeSingle()

      if (!data) {
        setUser({
          id: null,
          email: authUser.email,
          nome: '',
          empresa: '',
          empresaId: null,
          role: null,
          needsOnboarding: true,
        })
        return
      }

      setUser({
        id: data.id,
        email: authUser.email,
        nome: data.nome || authUser.email,
        empresa: data.empresas?.nome || '',
        empresaId: data.empresa_id || null,
        role: data.role || 'comum',
      })
    } catch {
      setUser({
        id: null,
        email: authUser.email,
        nome: '',
        empresa: '',
        empresaId: null,
        role: null,
        needsOnboarding: true,
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

  // Simples e isolado de propósito: só cria a conta no Supabase Auth. Não faz
  // nenhuma checagem de sessão nem toca em `empresas`/`usuarios` — isso é
  // responsabilidade exclusiva de completeOnboarding, chamada depois que a
  // sessão já está confirmada.
  async function signUp(email, password) {
    if (!supabaseReady) { setUser(DEMO_USER); return { error: null, session: true } }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) console.error('[signUp] Erro ao criar conta:', error)
    return { error, user: data?.user, session: data?.session }
  }

  // Reenvia o e-mail de confirmação de cadastro (usuário pediu novo link).
  async function resendConfirmation(email) {
    if (!supabaseReady) return { error: null }
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    return { error }
  }

  // Completa o cadastro depois do signUp: cria a empresa (se for a primeira
  // pessoa) ou vincula a um convite pendente, e cria o registro em `usuarios`.
  async function completeOnboarding({ nome, empresaNome, conviteId, empresaIdConvite, roleConvite }) {
    // O insert em `empresas` exige RLS com auth.uid() não nulo, ou seja, o
    // cliente supabase-js precisa ter uma sessão ativa com o JWT do usuário
    // anexado ao header Authorization de toda requisição PostgREST.
    // getSession() só lê o estado local do cliente — isso não garante que o
    // header das próximas requisições já foi resincronizado com a sessão
    // mais recente, especialmente logo após o redirect de confirmação de
    // e-mail. refreshSession() faz uma chamada real que força essa
    // resincronização antes de tentarmos o insert, então chamamos ela
    // sempre (não só como fallback quando não há sessão nenhuma).
    let { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) console.error('[completeOnboarding] refreshSession retornou erro:', refreshErr)
    let session = refreshed?.session

    if (!session) {
      // refreshSession pode falhar mesmo com sessão válida em alguns casos —
      // tenta ler o estado atual antes de desistir.
      const { data: sessionData } = await supabase.auth.getSession()
      session = sessionData?.session
    }

    if (!session?.user) {
      return { error: 'Confirme seu e-mail antes de continuar. Verifique sua caixa de entrada e clique no link de confirmação.' }
    }

    console.log('[completeOnboarding] sessão ok, user id:', session.user.id, '| access_token presente:', !!session.access_token)

    const authUser = session.user

    let empresaId = empresaIdConvite || null
    let role = roleConvite || 'master'

    if (!empresaId) {
      const { data: empresa, error: empErr } = await supabase
        .from('empresas')
        .insert({ nome: empresaNome })
        .select('id')
        .single()
      if (empErr) {
        console.error('[completeOnboarding] Erro ao criar empresa:', empErr)
        return { error: empErr.message }
      }
      empresaId = empresa.id
      role = 'master' // quem cria a empresa é o master dela
    }

    const { error: userErr } = await supabase.from('usuarios').insert({
      auth_id: authUser.id,
      empresa_id: empresaId,
      nome,
      email: authUser.email,
      role,
    })
    if (userErr) {
      console.error('[completeOnboarding] Erro ao criar usuario:', userErr)
      return { error: userErr.message }
    }

    if (conviteId) {
      await supabase.from('convites').update({ status: 'aceito' }).eq('id', conviteId)
    }

    await hydrateUser(authUser)
    return { error: null }
  }

  async function findConvitePendente(email) {
    const { data } = await supabase
      .from('convites')
      .select('id, empresa_id, role, empresas(nome)')
      .eq('email', email)
      .eq('status', 'pendente')
      .maybeSingle()
    return data
  }

  async function signOut() {
    if (supabaseReady) await supabase.auth.signOut()
    setUser(null)
  }

  const isProluAdmin = user?.role === 'prolu_admin'
  const isEmpresaMaster = user?.role === 'prolu_admin' || user?.role === 'master'
  // Mantido por compatibilidade com telas que ainda checam isMaster para
  // ações de conteúdo Prolu (Base de Conhecimento). Aponta para prolu_admin.
  const isMaster = isProluAdmin

  return (
    <AuthContext.Provider value={{
      user, loading, isMaster, isProluAdmin, isEmpresaMaster,
      signIn, signUp, signOut, completeOnboarding, findConvitePendente, resendConfirmation,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}
