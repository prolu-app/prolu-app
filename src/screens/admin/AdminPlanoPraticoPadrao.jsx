import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import PageHeader, { PageContainer } from '../../components/PageHeader.jsx'
import Select from '../../components/Select.jsx'
import { IconPlus, IconTrash, IconChevronDown } from '../../components/Icons.jsx'
import { FmConfirmar } from '../Formularios.jsx'
import { TAG_COLORS, STATUS_ACAO } from '../../utils/planoPratico.js'
import './AdminPlanoPraticoPadrao.css'

// Plano Prático padrão (Passo 3A): o modelo que cada escritório NOVO recebe
// como cópia na criação (migration_049). Editar aqui nunca muda escritórios
// existentes. Tudo fica na tela até "Salvar", que grava o modelo inteiro numa
// transação (admin_salvar_plano_modelo).

let seq = 0
const novaChave = () => `novo-${Date.now()}-${++seq}`

const OPCOES_STATUS = Object.entries(STATUS_ACAO).map(([value, s]) => ({ value, label: s.label }))

function fmtDataHora(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function mover(lista, i, delta) {
  const j = i + delta
  if (j < 0 || j >= lista.length) return lista
  const nova = [...lista]
  ;[nova[i], nova[j]] = [nova[j], nova[i]]
  return nova
}

// o que vai para o banco (e o que compara para "alterações não salvas")
function payload(tags, acoes) {
  return {
    tags: tags.map(t => ({ chave: t.chave, nome: t.nome.trim(), cor: t.cor })),
    acoes: acoes.map(a => ({ texto: a.texto, status: a.status, tag_chave: a.tagChave || null })),
  }
}

export default function AdminPlanoPraticoPadrao() {
  const { isProluAdmin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [tags, setTags] = useState([])
  const [acoes, setAcoes] = useState([])
  const [meta, setMeta] = useState({ salvoEm: null, salvoPor: null, escritorios: null })
  const [salvoJson, setSalvoJson] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState(null) // { tipo: 'tag'|'acao', chave }
  const [saida, setSaida] = useState(null)
  const [focoChave, setFocoChave] = useState(null)

  const atualJson = useMemo(() => JSON.stringify(payload(tags, acoes)), [tags, acoes])
  const alterado = !carregando && !erro && atualJson !== salvoJson

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) { setCarregando(false); return }
    setCarregando(true)
    setErro(false)
    const { data, error } = await supabase.rpc('admin_plano_modelo')
    if (error || !data) {
      console.error('[admin] plano modelo', error)
      setErro(true)
      setCarregando(false)
      return
    }
    const t = (data.tags || []).map(x => ({ chave: x.id, nome: x.nome, cor: x.cor }))
    const a = (data.acoes || []).map(x => ({ chave: x.id, texto: x.texto, status: x.status, tagChave: x.tag_id }))
    setTags(t)
    setAcoes(a)
    setSalvoJson(JSON.stringify(payload(t, a)))
    setMeta({ salvoEm: data.salvo_em, salvoPor: data.salvo_por, escritorios: data.escritorios })
    setCarregando(false)
  }

  async function salvar() {
    if (!alterado || salvando) return true
    if (tags.some(t => !t.nome.trim())) { toast('Toda tag precisa de um nome'); return false }
    setSalvando(true)
    const p = payload(tags, acoes)
    const { error } = await supabase.rpc('admin_salvar_plano_modelo', { p_tags: p.tags, p_acoes: p.acoes })
    setSalvando(false)
    if (error) {
      toast(['42501', '22023'].includes(error.code) && error.message ? error.message : 'Não foi possível salvar o modelo')
      return false
    }
    toast('Plano Prático padrão salvo')
    await carregar()
    return true
  }

  // ── sair sem salvar ── (mesmo padrão da Minha Página: <BrowserRouter> não
  // tem useBlocker, então o clique em links do app é interceptado)
  const salvarRef = useRef(salvar)
  salvarRef.current = salvar
  useEffect(() => {
    if (!alterado) return
    const aviso = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [alterado])
  useEffect(() => {
    if (!alterado) return
    const clique = e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const destino = new URL(a.href, window.location.href)
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      setSaida(destino.pathname + destino.search + destino.hash)
    }
    document.addEventListener('click', clique, true)
    return () => document.removeEventListener('click', clique, true)
  }, [alterado])
  useEffect(() => {
    const atalho = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvarRef.current() } }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  // foco no campo recém-criado
  useEffect(() => {
    if (!focoChave) return
    document.querySelector(`[data-chave="${focoChave}"]`)?.focus()
    setFocoChave(null)
  }, [focoChave])

  // ── edição ──
  const usoDaTag = (chave) => acoes.filter(a => a.tagChave === chave).length
  const mudarTag = (chave, patch) => setTags(prev => prev.map(t => (t.chave === chave ? { ...t, ...patch } : t)))
  const mudarAcao = (chave, patch) => setAcoes(prev => prev.map(a => (a.chave === chave ? { ...a, ...patch } : a)))

  function novaTag() {
    const chave = novaChave()
    setTags(prev => [...prev, { chave, nome: '', cor: TAG_COLORS[prev.length % TAG_COLORS.length] }])
    setFocoChave(chave)
  }
  function novaAcao() {
    const chave = novaChave()
    setAcoes(prev => [...prev, { chave, texto: '', status: 'pend', tagChave: tags[0]?.chave || null }])
    setFocoChave(chave)
  }
  function confirmarExclusao() {
    if (excluir.tipo === 'tag') {
      setTags(prev => prev.filter(t => t.chave !== excluir.chave))
      // ações da tag continuam no modelo, sem tag
      setAcoes(prev => prev.map(a => (a.tagChave === excluir.chave ? { ...a, tagChave: null } : a)))
    } else {
      setAcoes(prev => prev.filter(a => a.chave !== excluir.chave))
    }
    setExcluir(null)
  }

  const opcoesTag = useMemo(() => [
    { value: '', label: 'Sem tag' },
    ...tags.map(t => ({ value: t.chave, label: t.nome.trim() || 'Tag sem nome', cor: t.cor })),
  ], [tags])
  const rotuloTag = (o) => (o.value
    ? <span className="ppp-tag-opcao"><span className="ppp-dot" style={{ background: o.cor }} />{o.label}</span>
    : <span className="ppp-sem-tag">{o.label}</span>)

  if (!isProluAdmin) return null

  const ultimaEdicao = fmtDataHora(meta.salvoEm)
  const tagExcluir = excluir?.tipo === 'tag' ? tags.find(t => t.chave === excluir.chave) : null

  return (
    <PageContainer>
      <PageHeader
        titulo="Plano Prático padrão"
        descricao="Tags e ações que cada escritório novo recebe no Plano Prático."
        acoes={(
          <button className="btn-primary" onClick={salvar} disabled={!alterado || salvando}>
            {salvando ? 'Salvando…' : alterado ? 'Salvar' : 'Salvo'}
          </button>
        )}
      />

      <p className="ppp-aviso" role="note">
        As alterações valem apenas para escritórios criados a partir de agora. Escritórios existentes não são alterados.
      </p>

      {!carregando && !erro && (
        <p className="ppp-meta">
          {meta.escritorios != null && <>{meta.escritorios} {meta.escritorios === 1 ? 'escritório cadastrado' : 'escritórios cadastrados'} · </>}
          {ultimaEdicao ? <>Última edição do modelo: {ultimaEdicao}{meta.salvoPor ? ` por ${meta.salvoPor}` : ''}</> : 'Modelo ainda não editado (conteúdo padrão original)'}
          {alterado && <span className="ppp-pendente"> · Alterações não salvas</span>}
        </p>
      )}

      {carregando ? (
        <p className="ppp-vazio">Carregando…</p>
      ) : erro ? (
        <p className="ppp-vazio">Não foi possível carregar o modelo. Confira se a migration 049 foi rodada e recarregue a página.</p>
      ) : (
        <>
          {/* ── tags ── */}
          <section className="ppp-secao">
            <div className="ppp-secao-head">
              <h2 className="section-title ppp-secao-titulo">Tags</h2>
              <button className="ppp-add" onClick={novaTag}><IconPlus /> Nova tag</button>
            </div>
            <div className="card ppp-lista">
              {tags.length === 0 && <p className="ppp-vazio-inline">Nenhuma tag. As ações ficam sem tag.</p>}
              {tags.map((t, i) => (
                <div className="ppp-linha" key={t.chave}>
                  <OrdemBotoes i={i} total={tags.length} rotulo={t.nome || 'tag'} onMover={d => setTags(prev => mover(prev, i, d))} />
                  <div className="ppp-cores" role="radiogroup" aria-label={`Cor da tag ${t.nome || ''}`}>
                    {TAG_COLORS.map(c => (
                      <button
                        key={c} type="button" role="radio" aria-checked={t.cor === c} aria-label={`Cor ${c}`}
                        className={`ppp-cor${t.cor === c ? ' on' : ''}`} style={{ background: c }}
                        onClick={() => mudarTag(t.chave, { cor: c })}
                      />
                    ))}
                  </div>
                  <input
                    className="ppp-input" data-chave={t.chave} value={t.nome} maxLength={60}
                    placeholder="Nome da tag" aria-label="Nome da tag"
                    onChange={e => mudarTag(t.chave, { nome: e.target.value })}
                  />
                  <span className="ppp-uso">{usoDaTag(t.chave)} {usoDaTag(t.chave) === 1 ? 'ação' : 'ações'}</span>
                  <button className="ppp-del" onClick={() => setExcluir({ tipo: 'tag', chave: t.chave })} aria-label={`Excluir tag ${t.nome}`} title="Excluir tag">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── ações ── */}
          <section className="ppp-secao">
            <div className="ppp-secao-head">
              <h2 className="section-title ppp-secao-titulo">Ações ({acoes.length})</h2>
              <button className="ppp-add" onClick={novaAcao}><IconPlus /> Nova ação</button>
            </div>
            <div className="card ppp-lista">
              {acoes.length === 0 && <p className="ppp-vazio-inline">Nenhuma ação. Escritórios novos começam com o Plano Prático vazio.</p>}
              {acoes.map((a, i) => (
                <div className="ppp-linha ppp-linha-acao" key={a.chave}>
                  <OrdemBotoes i={i} total={acoes.length} rotulo={`ação ${i + 1}`} onMover={d => setAcoes(prev => mover(prev, i, d))} />
                  <span className="ppp-num">{i + 1}</span>
                  <textarea
                    className="ppp-input ppp-texto" data-chave={a.chave} value={a.texto} rows={2} maxLength={500}
                    placeholder="Descreva a ação…" aria-label={`Texto da ação ${i + 1}`}
                    onChange={e => mudarAcao(a.chave, { texto: e.target.value })}
                  />
                  <div className="ppp-selects">
                    <Select
                      className="ppp-select" value={a.tagChave || ''} options={opcoesTag} renderOption={rotuloTag}
                      onChange={v => mudarAcao(a.chave, { tagChave: v || null })} ariaLabel={`Tag da ação ${i + 1}`}
                    />
                    <Select
                      className="ppp-select" value={a.status} options={OPCOES_STATUS}
                      renderOption={o => <span className={`pill ${STATUS_ACAO[o.value].cls}`}><span className="dot" />{o.label}</span>}
                      onChange={v => mudarAcao(a.chave, { status: v })} ariaLabel={`Status da ação ${i + 1}`}
                    />
                  </div>
                  <button className="ppp-del" onClick={() => setExcluir({ tipo: 'acao', chave: a.chave })} aria-label={`Excluir ação ${i + 1}`} title="Excluir ação">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {excluir && (
        <FmConfirmar
          titulo={excluir.tipo === 'tag' ? `Excluir a tag "${tagExcluir?.nome || 'sem nome'}"?` : 'Excluir esta ação do modelo?'}
          texto={excluir.tipo === 'tag'
            ? (usoDaTag(excluir.chave)
              ? `${usoDaTag(excluir.chave)} ${usoDaTag(excluir.chave) === 1 ? 'ação usa' : 'ações usam'} esta tag e ${usoDaTag(excluir.chave) === 1 ? 'fica' : 'ficam'} no modelo sem tag. Só vale depois de salvar.`
              : 'Nenhuma ação usa esta tag. Só vale depois de salvar.')
            : 'A ação sai do modelo. Só vale depois de salvar; escritórios existentes não mudam.'}
          rotulo="Excluir" perigo
          onConfirmar={confirmarExclusao} onCancelar={() => setExcluir(null)}
        />
      )}

      {saida && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) setSaida(null) }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="ppp-sair-titulo" aria-describedby="ppp-sair-texto">
            <div className="modal-title" id="ppp-sair-titulo">Sair sem salvar?</div>
            <p className="fm-confirmar-texto" id="ppp-sair-texto">Você tem alterações no Plano Prático padrão que ainda não foram salvas.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSaida(null)} disabled={salvando} autoFocus>Continuar editando</button>
              <button className="btn-danger" onClick={() => { const d = saida; setSaida(null); navigate(d) }} disabled={salvando}>Sair sem salvar</button>
              <button className="btn-confirm" disabled={salvando}
                onClick={async () => { const d = saida; if (await salvar()) { setSaida(null); navigate(d) } }}>
                {salvando ? 'Salvando…' : 'Salvar e sair'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function OrdemBotoes({ i, total, rotulo, onMover }) {
  return (
    <div className="ppp-ordem">
      <button type="button" onClick={() => onMover(-1)} disabled={i === 0} aria-label={`Subir ${rotulo}`} title="Subir">
        <IconChevronDown className="ppp-subir" />
      </button>
      <button type="button" onClick={() => onMover(1)} disabled={i === total - 1} aria-label={`Descer ${rotulo}`} title="Descer">
        <IconChevronDown />
      </button>
    </div>
  )
}
