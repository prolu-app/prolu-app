// Estado do editor da Minha Página v2 (migration_056).
// • Rascunho: o documento que o editor carregou, alterado só nos caminhos
//   mexidos (comCaminho) — chave desconhecida é preservada. Salva sozinho
//   800 ms depois da última mudança (ou na hora, com salvarAgora / Ctrl+S),
//   inteiro, por pagina_salvar_rascunho(doc, revisao).
// • Revisão: trava entre abas. Outra aba salvou antes → 'conflito': para de
//   salvar e pede para recarregar (nada é sobrescrito).
// • Sem linha em "paginas": o 1º rascunho é a página antiga convertida
//   (converterLegado + docGravavel); nada é gravado até a 1ª mudança.
// • Publicar copia o rascunho salvo para o publicado (servidor). A 1ª
//   publicação põe no ar; as seguintes mantêm o "Fora do ar".

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import { converterLegado } from '../../utils/pagina/legado.js'
import { comCaminho, docGravavel, normalizarDoc, semDestaque } from '../../utils/pagina/modelo.js'

const ESPERA = 800
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// mensagem da função (raise exception '<código>') → código conhecido
function codigoDoErro(error) {
  const m = error?.message || ''
  for (const c of ['conflito_revisao', 'capa_sem_imagem', 'sem_rascunho', 'nunca_publicada', 'sem_permissao']) if (m.includes(c)) return c
  if (m.startsWith('pagina_invalida')) return 'pagina_invalida'
  return 'erro'
}

export default function usePaginaRascunho({ empresaId, podeEditar, toast }) {
  const [estado, setEstado] = useState('carregando') // carregando | pronto | erro
  const [doc, setDoc] = useState(null)
  const [empresa, setEmpresa] = useState(null) // { nome, slug }
  const [formularios, setFormularios] = useState([])
  // servidor: { existe, revisao, noAr, temPublicado, pendente, publicado (doc normalizado), legado: { noAr, config } }
  const [servidor, setServidor] = useState(null)
  const [salvamento, setSalvamento] = useState('salvo') // salvo | pendente | salvando | erro | conflito

  const docRef = useRef(null)
  const revisaoRef = useRef(0)
  const sujoRef = useRef(false) // mudança local ainda não enviada
  const emVooRef = useRef(null) // promessa do salvamento em andamento
  const timerRef = useRef(null)
  const conflitoRef = useRef(false)

  const carregar = useCallback(async () => {
    if (!supabaseReady || !empresaId) return
    setEstado('carregando')
    clearTimeout(timerRef.current)
    const [emp, pg, lks, frm] = await Promise.all([
      supabase.from('empresas').select('nome, slug, pagina_config').eq('id', empresaId).maybeSingle(),
      supabase.from('paginas').select('rascunho, publicado, no_ar, revisao').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('pagina_links').select('*').eq('empresa_id', empresaId).order('ordem').order('created_at'),
      supabase.from('formularios').select('id, nome, slug, ativo').eq('empresa_id', empresaId).order('nome'),
    ])
    if (emp.error || !emp.data || pg.error || lks.error) {
      console.error('[minha-pagina] carregar', emp.error || pg.error || lks.error)
      setEstado('erro')
      return
    }
    const linha = pg.data
    const cfg = emp.data.pagina_config || {}
    const inicial = linha?.rascunho || docGravavel(converterLegado(cfg, lks.data || []))
    // rascunho antigo com estilo.destaque: sai ao salvar
    const comDestaque = semDestaque(inicial) !== inicial
    docRef.current = inicial
    revisaoRef.current = linha?.revisao || 0
    sujoRef.current = false
    conflitoRef.current = false
    setDoc(inicial)
    // (vai no próximo salvamento ou na publicação; o desenho já ignora a chave)
    if (comDestaque) sujoRef.current = true
    setEmpresa({ nome: emp.data.nome, slug: emp.data.slug })
    setFormularios(frm.data || [])
    setServidor({
      existe: !!linha,
      revisao: linha?.revisao || 0,
      noAr: !!linha?.no_ar,
      temPublicado: !!linha?.publicado,
      pendente: !linha?.publicado || !igual(linha.rascunho, linha.publicado),
      publicado: linha?.publicado ? normalizarDoc(linha.publicado) : null,
      legado: { noAr: cfg.publicada === true, config: cfg },
    })
    setSalvamento('salvo')
    setEstado('pronto')
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const aplicarEstado = useCallback(est => {
    if (!est) return
    revisaoRef.current = est.revisao
    setServidor(s => ({ ...s, existe: true, revisao: est.revisao, noAr: est.no_ar, pendente: est.pendente }))
  }, [])

  // envia o rascunho atual; se mudar algo durante o envio, envia de novo
  const salvarAgora = useCallback(async () => {
    clearTimeout(timerRef.current)
    if (!podeEditar || conflitoRef.current) return false
    if (emVooRef.current) await emVooRef.current
    if (conflitoRef.current) return false
    if (!sujoRef.current) return true
    const enviado = semDestaque(docRef.current) // destaque antigo sai ao salvar
    sujoRef.current = false
    setSalvamento('salvando')
    const tarefa = supabase.rpc('pagina_salvar_rascunho', { p_doc: enviado, p_revisao: revisaoRef.current })
      .then(({ data, error }) => {
        if (error) {
          sujoRef.current = true
          const codigo = codigoDoErro(error)
          if (codigo === 'conflito_revisao') { conflitoRef.current = true; setSalvamento('conflito'); return false }
          console.error('[minha-pagina] salvar rascunho', error)
          setSalvamento('erro')
          if (codigo === 'pagina_invalida') toast('Algum valor da página não foi aceito. Confira e tente de novo.')
          return false
        }
        aplicarEstado(data)
        setSalvamento(sujoRef.current ? 'pendente' : 'salvo')
        return true
      })
    emVooRef.current = tarefa
    const ok = await tarefa
    emVooRef.current = null
    if (ok && sujoRef.current) return salvarAgora()
    return ok
  }, [podeEditar, toast, aplicarEstado])

  const agendar = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { salvarAgora() }, ESPERA)
  }, [salvarAgora])

  // altera o documento: fn(docAtual) → docNovo
  const alterarDoc = useCallback(fn => {
    if (!podeEditar || conflitoRef.current || !docRef.current) return
    const novo = fn(docRef.current)
    if (novo === docRef.current) return
    docRef.current = novo
    sujoRef.current = true
    setDoc(novo)
    setSalvamento('pendente')
    agendar()
  }, [podeEditar, agendar])

  const alterar = useCallback((caminho, valor) => alterarDoc(d => comCaminho(d, caminho, valor)), [alterarDoc])

  // { ok } | { erro: 'capa_sem_imagem' | 'conflito_revisao' | … }
  const publicar = useCallback(async () => {
    if (!podeEditar) return { erro: 'sem_permissao' }
    // 1ª vez sem linha: grava o rascunho convertido antes de publicar
    if (!servidor?.existe) sujoRef.current = true
    if (!(await salvarAgora())) return { erro: conflitoRef.current ? 'conflito_revisao' : 'erro' }
    const enviado = docRef.current
    const { data, error } = await supabase.rpc('pagina_publicar', { p_revisao: revisaoRef.current })
    if (error) {
      const codigo = codigoDoErro(error)
      if (codigo === 'conflito_revisao') { conflitoRef.current = true; setSalvamento('conflito') }
      else if (codigo !== 'capa_sem_imagem') console.error('[minha-pagina] publicar', error)
      return { erro: codigo }
    }
    aplicarEstado(data)
    setServidor(s => ({ ...s, temPublicado: true, publicado: normalizarDoc(enviado) }))
    return { ok: true, noAr: data.no_ar }
  }, [podeEditar, servidor?.existe, salvarAgora, aplicarEstado])

  const descartar = useCallback(async () => {
    if (!podeEditar) return false
    clearTimeout(timerRef.current)
    if (emVooRef.current) await emVooRef.current
    const { error } = await supabase.rpc('pagina_descartar_rascunho')
    if (error) { console.error('[minha-pagina] descartar', error); toast('Não foi possível descartar as alterações'); return false }
    await carregar()
    return true
  }, [podeEditar, toast, carregar])

  const definirNoAr = useCallback(async noAr => {
    if (!podeEditar) return false
    const { data, error } = await supabase.rpc('pagina_definir_no_ar', { p_no_ar: noAr })
    if (error) { console.error('[minha-pagina] no ar', error); toast('Não foi possível mudar o status da página'); return false }
    aplicarEstado(data)
    return true
  }, [podeEditar, toast, aplicarEstado])

  return {
    estado, doc, empresa, formularios, servidor, salvamento,
    carregar, alterar, alterarDoc, salvarAgora, publicar, descartar, definirNoAr,
  }
}
