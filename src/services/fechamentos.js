import { supabase, fetchAllRows } from './supabaseClient.js'

/* Fonte única de "fechamentos" (projetos fechados + valor fechado).
   A regra vive no banco — fn_fechamentos / fn_fechamentos_periodo
   (supabase/migration_020_fechamentos_fonte_unica.sql):
     fechado = status "Fechado" + data_fechamento dentro do período
     inicio/fim omitidos = 01/01 do ano corrente até hoje
   Nenhuma tela deve recalcular isso por conta própria. */

export const FECHAMENTOS_VAZIO = { qtd: 0, valor: 0 }

// Date local → 'YYYY-MM-DD' (toISOString converteria pra UTC e pularia o dia à noite)
export function isoLocal(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Linha a linha: [{ linhaId, empresaId, dataFechamento, valor }]
export async function listarFechamentos({ empresaId = null, inicio = null, fim = null } = {}) {
  const { data, error } = await fetchAllRows(() => supabase
    .rpc('fn_fechamentos', { p_empresa_id: empresaId, p_data_inicio: inicio, p_data_fim: fim })
    .order('linha_id'))
  if (error) return { data: [], error }
  return {
    data: data.map(r => ({
      linhaId: r.linha_id,
      empresaId: r.empresa_id,
      dataFechamento: r.data_fechamento,
      valor: Number(r.valor) || 0,
    })),
    error: null,
  }
}

// Agregado por empresa: { [empresaId]: { qtd, valor } }. Empresa sem fechamento não aparece.
export async function resumoFechamentos({ empresaId = null, inicio = null, fim = null } = {}) {
  const { data, error } = await supabase
    .rpc('fn_fechamentos_periodo', { p_empresa_id: empresaId, p_data_inicio: inicio, p_data_fim: fim })
  if (error) return { data: {}, error }
  const porEmpresa = {}
  for (const r of data || []) {
    porEmpresa[r.empresa_id] = { qtd: Number(r.qtd_fechados) || 0, valor: Number(r.valor_fechado) || 0 }
  }
  return { data: porEmpresa, error: null }
}

export function somarFechamentos(lista) {
  return { qtd: lista.length, valor: lista.reduce((s, f) => s + f.valor, 0) }
}

/* Modo demonstração (sem Supabase): mesma regra da função SQL, aplicada ao
   seed em memória. `ids` = { status, dataFechamento, valor } (ids das colunas). */
export function fechamentosLocais(rows, ids, inicio = null, fim = null) {
  const hoje = new Date()
  const ini = inicio || `${hoje.getFullYear()}-01-01`
  const end = fim || isoLocal(hoje)
  if (!ids.status || !ids.dataFechamento) return []
  return rows
    .filter(r => {
      const df = typeof r[ids.dataFechamento] === 'string' ? r[ids.dataFechamento].slice(0, 10) : ''
      return r[ids.status] === 'Fechado' && df >= ini && df <= end
    })
    .map(r => ({
      linhaId: r.id,
      empresaId: r.empresaId ?? null,
      dataFechamento: r[ids.dataFechamento].slice(0, 10),
      valor: Number(r[ids.valor]) || 0,
    }))
}
