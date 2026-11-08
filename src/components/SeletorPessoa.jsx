import { useEffect, useState } from 'react'
import { supabase, supabaseReady } from '../services/supabaseClient.js'
import Select from './Select.jsx'

// Pessoas da equipe do escritório (id, nome, email), em ordem de nome. Serve
// para escolher responsável em qualquer tela; o servidor confere que a pessoa
// é do mesmo escritório (ex.: projeto_itens, migration_063).
export function useEquipe(empresaId) {
  const [pessoas, setPessoas] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    if (!supabaseReady || !empresaId) { setPessoas([]); setCarregando(false); return }
    setCarregando(true)
    supabase
      .from('usuarios')
      .select('id, nome, email')
      .eq('empresa_id', empresaId)
      .then(({ data }) => {
        if (!ativo) return
        setPessoas((data || []).sort((a, b) => nomePessoa(a).localeCompare(nomePessoa(b), 'pt-BR')))
        setCarregando(false)
      })
    return () => { ativo = false }
  }, [empresaId])

  return { pessoas, carregando }
}

export function nomePessoa(p) {
  return p?.nome || p?.email || ''
}

// Seletor de pessoa reutilizável. value = id (ou null); onChange(id | null).
// A primeira opção é "Sem responsável" (rótulo trocável por semPessoa).
export default function SeletorPessoa({
  pessoas, value, onChange, semPessoa = 'Sem responsável', ariaLabel = 'Responsável', disabled = false,
}) {
  const options = [
    { value: '', label: semPessoa },
    ...(pessoas || []).map(p => ({ value: p.id, label: nomePessoa(p) })),
  ]
  // pessoa que saiu da equipe continua visível até alguém trocar
  if (value && !options.some(o => o.value === value)) options.push({ value, label: 'Pessoa removida da equipe' })

  return (
    <Select
      value={value || ''}
      onChange={(v) => onChange(v || null)}
      options={options}
      ariaLabel={ariaLabel}
      disabled={disabled}
    />
  )
}
