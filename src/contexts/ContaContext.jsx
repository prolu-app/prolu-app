import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import { useAuth } from './AuthContext.jsx'
import { planoLibera as planoLiberaRecurso } from '../utils/planos.js'

const ContaContext = createContext(null)

// Plano e status da conta (escritório) em uso — lido uma vez por usuário/
// escritório. Para o usuário comum vem de conta_atual() (migration_045), que
// responde mesmo com a conta suspensa. Para o prolu_admin "dentro" de um
// escritório, vem da própria linha de empresas: ele vê o app como aquele
// escritório veria, inclusive as vitrines.
export function ContaProvider({ children }) {
  const { user, impersonatedEmpresaId } = useAuth()
  const [conta, setConta] = useState(null) // { empresaId, nome, plano, statusConta }
  const [chaveCarregada, setChaveCarregada] = useState(null)
  const [versao, setVersao] = useState(0)

  const temCadastro = !!user && !user.needsOnboarding
  // Chave do que precisa estar carregado: comparando com a última carga, o
  // app não renderiza nem um instante com a conta de outro usuário/escritório
  // (ex.: piscar as telas antes da tela de conta suspensa).
  const chave = temCadastro ? `${user.id}|${impersonatedEmpresaId || ''}` : null
  const carregando = chave !== null && chaveCarregada !== chave

  useEffect(() => {
    if (!temCadastro) { setConta(null); setChaveCarregada(null); return }
    if (!supabaseReady) {
      setConta({ empresaId: null, nome: user.empresa, plano: 'consultoria', statusConta: 'ativa' })
      setChaveCarregada(chave)
      return
    }

    let vivo = true
    const consulta = impersonatedEmpresaId
      ? supabase.from('empresas').select('empresa_id:id, nome, plano, status_conta').eq('id', impersonatedEmpresaId).maybeSingle()
      : supabase.rpc('conta_atual').maybeSingle()
    consulta.then(({ data, error }) => {
      if (!vivo) return
      if (error) console.error('[conta] Erro ao carregar plano da conta:', error)
      setConta(data ? { empresaId: data.empresa_id, nome: data.nome, plano: data.plano, statusConta: data.status_conta } : null)
      setChaveCarregada(chave)
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  // Sem plano conhecido (erro de leitura) o front não bloqueia: quem garante
  // o bloqueio de verdade é o servidor (RLS e Edge Functions).
  const planoLibera = useCallback(
    (recurso) => (conta?.plano ? planoLiberaRecurso(conta.plano, recurso) : true),
    [conta?.plano],
  )

  const value = {
    conta,
    carregando,
    plano: conta?.plano || null,
    statusConta: conta?.statusConta || null,
    contaAtiva: !conta || conta.statusConta === 'ativa',
    planoLibera,
    recarregar,
  }

  return <ContaContext.Provider value={value}>{children}</ContaContext.Provider>
}

export function useConta() {
  const ctx = useContext(ContaContext)
  if (!ctx) throw new Error('useConta precisa estar dentro de ContaProvider')
  return ctx
}
