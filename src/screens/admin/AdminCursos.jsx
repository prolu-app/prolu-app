import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import PageHeader, { PageContainer } from '../../components/PageHeader.jsx'
import { PlanoTag } from '../../components/PlanoTag.jsx'
import { IconPlus, IconSearch } from '../../components/Icons.jsx'
import { FmSwitch, FmConfirmar } from '../Formularios.jsx'
import { PLANOS, rotuloPlano } from '../../utils/planos.js'
import './AdminModelosPrecificacao.css'
import './AdminEscritorios.css'
import './AdminCursos.css'

// Cursos (Passo 3B): quem acessa cada curso = planos da lista (explícita) +
// liberações avulsas por escritório (curso_liberacoes). Tudo pelo servidor
// (migration_050): admin_salvar_curso, liberar_curso, revogar_curso. As aulas
// continuam sendo editadas na Base de Conhecimento; aqui só se associam as
// pastas Prolu ao curso.

const ORIGEM = { manual: 'Manual', checkout: 'Checkout', sistema: 'Sistema' }
const FORM_VAZIO = { id: null, titulo: '', descricao: '', ordem: 0, checkout_url: '', ativo: true, planos: [], pastas: [] }

function fmtData(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}

function msgErro(error, padrao) {
  return ['42501', '22023', 'P0002', '23514'].includes(error?.code) && error.message ? error.message : padrao
}

export default function AdminCursos() {
  const { isProluAdmin } = useAuth()
  const toast = useToast()
  const [carregando, setCarregando] = useState(true)
  const [cursos, setCursos] = useState([])
  const [pastasProlu, setPastasProlu] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [selId, setSelId] = useState(null) // id do curso ou 'novo'
  const [form, setForm] = useState(FORM_VAZIO)
  const [confirmarSalvar, setConfirmarSalvar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [liberacoes, setLiberacoes] = useState(null)
  const [modalLiberar, setModalLiberar] = useState(false)
  const [revogar, setRevogar] = useState(null) // liberação

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar(manterSel = null) {
    if (!supabaseReady) { setCarregando(false); return }
    setCarregando(true)
    const [{ data: cs, error: e1 }, { data: ps }, { data: es }] = await Promise.all([
      supabase.rpc('kb_cursos', { p_empresa_id: null }),
      supabase.from('kb_pastas').select('id, titulo, curso_id, ordem').is('empresa_id', null).order('ordem'),
      supabase.from('empresas').select('id, nome, plano, status_conta').order('nome'),
    ])
    if (e1) { toast('Não foi possível carregar os cursos'); setCarregando(false); return }
    const lista = Array.isArray(cs) ? cs : []
    setCursos(lista)
    setPastasProlu(ps || [])
    setEmpresas(es || [])
    setCarregando(false)
    const alvo = manterSel || selId || lista[0]?.id || null
    if (alvo && alvo !== 'novo') selecionar(alvo, lista, ps || [])
  }

  function selecionar(id, lista = cursos, pastas = pastasProlu) {
    const c = lista.find(x => x.id === id)
    if (!c) return
    setSelId(id)
    setForm({
      id: c.id, titulo: c.titulo, descricao: c.descricao || '', ordem: c.ordem ?? 0,
      checkout_url: c.checkout_url || '', ativo: c.ativo !== false, planos: c.planos || [],
      pastas: pastas.filter(p => p.curso_id === c.id).map(p => p.id),
    })
    carregarLiberacoes(id)
  }

  function novoCurso() {
    setSelId('novo')
    setForm({ ...FORM_VAZIO, ordem: cursos.length })
    setLiberacoes(null)
  }

  async function carregarLiberacoes(cursoId) {
    setLiberacoes(null)
    const { data, error } = await supabase.rpc('admin_curso_liberacoes', { p_curso_id: cursoId })
    if (error) { toast('Não foi possível carregar as liberações'); setLiberacoes([]); return }
    setLiberacoes(data || [])
  }

  async function salvar() {
    setSalvando(true)
    const { data, error } = await supabase.rpc('admin_salvar_curso', {
      p_id: form.id, p_titulo: form.titulo, p_descricao: form.descricao, p_ativo: form.ativo,
      p_ordem: Number(form.ordem) || 0, p_checkout_url: form.checkout_url, p_planos: form.planos, p_pastas: form.pastas,
    })
    setSalvando(false)
    setConfirmarSalvar(false)
    if (error) { toast(msgErro(error, 'Não foi possível salvar o curso')); return }
    toast(form.id ? 'Curso salvo' : 'Curso criado')
    carregar(data)
  }

  function alternar(lista, v) {
    return lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]
  }

  const cursoSel = cursos.find(c => c.id === selId)
  // resumo do que muda no acesso, para a confirmação
  const resumo = useMemo(() => {
    if (!form.titulo.trim()) return null
    const antes = cursoSel?.planos || []
    const ganham = form.planos.filter(p => !antes.includes(p))
    const perdem = antes.filter(p => !form.planos.includes(p))
    return { ganham, perdem, desativa: cursoSel && cursoSel.ativo !== false && !form.ativo, ativa: cursoSel && cursoSel.ativo === false && form.ativo }
  }, [form, cursoSel])

  if (!isProluAdmin) return null

  return (
    <PageContainer>
      <PageHeader
        titulo="Cursos"
        descricao="Quem acessa cada curso: os planos da lista e os escritórios liberados avulso. As aulas continuam na Base de Conhecimento."
        acoes={<button className="btn-primary" onClick={novoCurso}><IconPlus /> Novo curso</button>}
      />

      {carregando ? (
        <p className="amp-empty">Carregando…</p>
      ) : (
        <div className="amp-layout acu-layout">
          <div className="amp-sidebar" role="list" aria-label="Cursos">
            {cursos.length === 0 && selId !== 'novo' && <p className="acu-vazio">Nenhum curso ainda.</p>}
            {cursos.map(c => (
              <button key={c.id} type="button" role="listitem"
                className={`acu-item${c.id === selId ? ' active' : ''}${c.ativo === false ? ' inativo' : ''}`}
                onClick={() => selecionar(c.id)} aria-current={c.id === selId || undefined}>
                <span className="acu-item-nome">{c.titulo}</span>
                <span className="acu-item-planos">
                  {c.ativo === false ? <span className="pill pill-gray">Inativo</span> : (c.planos || []).map(p => <PlanoTag key={p} plano={p} />)}
                </span>
              </button>
            ))}
            {selId === 'novo' && <div className="acu-item active"><span className="acu-item-nome">Novo curso</span></div>}
          </div>

          {selId && (
            <div className="amp-content">
              <section className="card acu-card">
                <div className="acu-campos">
                  <label className="acu-campo acu-campo-largo">
                    <span className="modal-label">Título</span>
                    <input className="modal-input" value={form.titulo} maxLength={120} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
                  </label>
                  <label className="acu-campo acu-campo-largo">
                    <span className="modal-label">Descrição curta</span>
                    <textarea className="modal-input" rows={2} value={form.descricao} maxLength={300} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                  </label>
                  <label className="acu-campo acu-campo-largo">
                    <span className="modal-label">Link de compra (opcional)</span>
                    <input className="modal-input" value={form.checkout_url} placeholder="https://… (Kiwify, Asaas…). Sem link: botão “Fale com o Comercial”"
                      onChange={e => setForm(f => ({ ...f, checkout_url: e.target.value }))} />
                  </label>
                  <label className="acu-campo">
                    <span className="modal-label">Ordem</span>
                    <input className="modal-input" type="number" value={form.ordem} onChange={e => setForm(f => ({ ...f, ordem: e.target.value }))} />
                  </label>
                  <div className="acu-campo">
                    <span className="modal-label">Ativo</span>
                    <div className="acu-switch">
                      <FmSwitch ligado={form.ativo} rotulo={form.ativo ? 'Desativar curso' : 'Ativar curso'} onChange={v => setForm(f => ({ ...f, ativo: v }))} />
                      <span>{form.ativo ? 'Aparece na Base de Conhecimento' : 'Fora do ar para todos'}</span>
                    </div>
                  </div>
                </div>

                <div className="acu-bloco">
                  <span className="modal-label">Planos que liberam</span>
                  <div className="acu-planos" role="group" aria-label="Planos que liberam o curso">
                    {PLANOS.map(p => {
                      const on = form.planos.includes(p)
                      return (
                        <button key={p} type="button" className={`acu-plano${on ? ' on' : ''}`} aria-pressed={on}
                          onClick={() => setForm(f => ({ ...f, planos: alternar(f.planos, p) }))}>
                          <PlanoTag plano={p} />
                        </button>
                      )
                    })}
                  </div>
                  <p className="acu-hint">Lista explícita: só os planos marcados liberam (pode ser, por exemplo, Business e Consultoria sem Mentoria).</p>
                </div>

                <div className="acu-bloco">
                  <span className="modal-label">Pastas da Base de Conhecimento neste curso</span>
                  {pastasProlu.length === 0 ? <p className="acu-hint">Nenhuma pasta Prolu.</p> : (
                    <div className="acu-pastas">
                      {pastasProlu.map(p => {
                        const outro = p.curso_id && p.curso_id !== form.id ? cursos.find(c => c.id === p.curso_id) : null
                        return (
                          <label key={p.id} className="acu-pasta">
                            <input type="checkbox" checked={form.pastas.includes(p.id)} onChange={() => setForm(f => ({ ...f, pastas: alternar(f.pastas, p.id) }))} />
                            <span>{p.titulo}</span>
                            {outro && <span className="acu-pasta-outro">hoje em “{outro.titulo}”</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                  <p className="acu-hint">Pasta desmarcada de todos os cursos fica livre para todos os escritórios.</p>
                </div>

                <div className="acu-acoes">
                  <button className="btn-primary" disabled={!form.titulo.trim() || salvando} onClick={() => setConfirmarSalvar(true)}>
                    {form.id ? 'Salvar curso' : 'Criar curso'}
                  </button>
                </div>
              </section>

              {form.id && (
                <section className="acu-secao">
                  <div className="acu-secao-head">
                    <h2 className="section-title acu-secao-titulo">Liberações avulsas</h2>
                    <button className="btn-cancel" onClick={() => setModalLiberar(true)}><IconPlus /> Liberar escritório</button>
                  </div>
                  <div className="card acu-lib-card">
                    {liberacoes === null ? <p className="acu-hint">Carregando…</p>
                      : liberacoes.length === 0 ? <p className="acu-hint">Nenhum escritório liberado fora do plano.</p>
                      : (
                        <table className="acu-tabela">
                          <thead>
                            <tr><th>Escritório</th><th>Origem</th><th>Motivo</th><th>Data</th><th /></tr>
                          </thead>
                          <tbody>
                            {liberacoes.map(l => (
                              <tr key={l.id} className={l.revogado_em ? 'revogada' : ''}>
                                <td><div className="acu-emp">{l.empresa_nome}</div><PlanoTag plano={l.empresa_plano} /></td>
                                <td>{ORIGEM[l.origem] || l.origem}</td>
                                <td>{l.motivo || '—'}{l.revogado_em && <div className="acu-revog">Revogada{l.revogado_motivo ? `: ${l.revogado_motivo}` : ''}</div>}</td>
                                <td className="acu-data">{fmtData(l.criado_em)}{l.criado_por ? <div>{l.criado_por}</div> : null}{l.revogado_em && <div>revogada {fmtData(l.revogado_em)}</div>}</td>
                                <td>{!l.revogado_em && <button className="acu-revogar" onClick={() => setRevogar(l)}>Revogar</button>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {confirmarSalvar && resumo && (
        <FmConfirmar
          titulo={form.id ? `Salvar “${form.titulo.trim()}”?` : `Criar “${form.titulo.trim()}”?`}
          texto={[
            resumo.ganham.length ? `Passam a acessar: ${resumo.ganham.map(rotuloPlano).join(', ')}.` : '',
            resumo.perdem.length ? `Deixam de acessar: ${resumo.perdem.map(rotuloPlano).join(', ')} (exceto escritórios liberados avulso).` : '',
            resumo.desativa ? 'O curso sai do ar para todos os escritórios.' : '',
            resumo.ativa ? 'O curso volta a aparecer para quem tem acesso.' : '',
            !form.id ? `Planos que liberam: ${form.planos.length ? form.planos.map(rotuloPlano).join(', ') : 'nenhum (só liberação avulsa)'}.` : '',
          ].filter(Boolean).join(' ') || 'Salvar as alterações do curso.'}
          rotulo={form.id ? 'Salvar' : 'Criar'} ocupado={salvando}
          onConfirmar={salvar} onCancelar={() => setConfirmarSalvar(false)}
        />
      )}

      {modalLiberar && cursoSel && (
        <LiberarModal
          curso={cursoSel} empresas={empresas}
          jaLiberadas={new Set((liberacoes || []).filter(l => !l.revogado_em).map(l => l.empresa_id))}
          onFechar={() => setModalLiberar(false)}
          onFeito={() => { setModalLiberar(false); carregarLiberacoes(cursoSel.id) }}
        />
      )}

      {revogar && (
        <RevogarModal liberacao={revogar} curso={cursoSel}
          onFechar={() => setRevogar(null)}
          onFeito={() => { setRevogar(null); carregarLiberacoes(cursoSel.id) }} />
      )}
    </PageContainer>
  )
}

function LiberarModal({ curso, empresas, jaLiberadas, onFechar, onFeito }) {
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [empresa, setEmpresa] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [busy, setBusy] = useState(false)

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return empresas.filter(e => !q || e.nome.toLowerCase().includes(q)).slice(0, 30)
  }, [empresas, busca])

  async function liberar() {
    setBusy(true)
    const { error } = await supabase.rpc('liberar_curso', { p_empresa_id: empresa.id, p_curso_id: curso.id, p_origem: 'manual', p_motivo: motivo.trim() || null })
    setBusy(false)
    if (error) { toast(msgErro(error, 'Não foi possível liberar o curso')); return }
    toast(`Curso liberado para ${empresa.nome}`)
    onFeito()
  }

  if (confirmando) {
    return (
      <FmConfirmar
        titulo="Liberar curso?"
        texto={`${empresa.nome} (plano ${rotuloPlano(empresa.plano)}) passa a acessar “${curso.titulo}”, independente do plano.`}
        rotulo="Liberar" ocupado={busy} onConfirmar={liberar} onCancelar={() => setConfirmando(false)}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="modal acu-modal" role="dialog" aria-labelledby="acu-lib-titulo">
        <div className="modal-title" id="acu-lib-titulo">Liberar “{curso.titulo}”</div>
        <div className="esc-search acu-busca">
          <IconSearch className="esc-search-icon" />
          <input className="esc-search-input" autoFocus placeholder="Buscar escritório pelo nome…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="acu-emp-lista" role="listbox" aria-label="Escritórios">
          {lista.length === 0 && <p className="acu-hint">Nenhum escritório encontrado.</p>}
          {lista.map(e => {
            const ja = jaLiberadas.has(e.id)
            return (
              <button key={e.id} type="button" role="option" aria-selected={empresa?.id === e.id} disabled={ja}
                className={`acu-emp-op${empresa?.id === e.id ? ' on' : ''}`} onClick={() => setEmpresa(e)}>
                <span>{e.nome}</span>
                <span className="acu-emp-op-meta">{ja ? 'já liberado' : <PlanoTag plano={e.plano} />}</span>
              </button>
            )
          })}
        </div>
        <div className="modal-field">
          <label className="modal-label" htmlFor="acu-motivo">Motivo (opcional)</label>
          <input id="acu-motivo" className="modal-input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: pagou o curso pelo Pix" />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onFechar}>Cancelar</button>
          <button className="btn-confirm" disabled={!empresa} onClick={() => setConfirmando(true)}>Liberar</button>
        </div>
      </div>
    </div>
  )
}

function RevogarModal({ liberacao, curso, onFechar, onFeito }) {
  const toast = useToast()
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  async function revogar() {
    setBusy(true)
    const { error } = await supabase.rpc('revogar_curso', { p_empresa_id: liberacao.empresa_id, p_curso_id: curso.id, p_motivo: motivo.trim() || null })
    setBusy(false)
    if (error) { toast(msgErro(error, 'Não foi possível revogar')); return }
    toast('Liberação revogada')
    onFeito()
  }
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onFechar() }}>
      <div className="modal" role="alertdialog" aria-labelledby="acu-rev-titulo">
        <div className="modal-title" id="acu-rev-titulo">Revogar liberação?</div>
        <p className="fm-confirmar-texto">
          {liberacao.empresa_nome} deixa de acessar “{curso.titulo}”, a não ser que o plano dele ({rotuloPlano(liberacao.empresa_plano)}) libere o curso. A liberação fica no histórico.
        </p>
        <div className="modal-field">
          <label className="modal-label" htmlFor="acu-rev-motivo">Motivo (opcional)</label>
          <input id="acu-rev-motivo" className="modal-input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: reembolso" />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onFechar} disabled={busy}>Cancelar</button>
          <button className="btn-danger" onClick={revogar} disabled={busy}>{busy ? 'Revogando…' : 'Revogar'}</button>
        </div>
      </div>
    </div>
  )
}
