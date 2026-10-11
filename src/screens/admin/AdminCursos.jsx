import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { supabase, supabaseReady } from '../../services/supabaseClient.js'
import PageHeader, { PageContainer } from '../../components/PageHeader.jsx'
import { PlanoTag } from '../../components/PlanoTag.jsx'
import { IconPlus, IconSearch } from '../../components/Icons.jsx'
import { FmSwitch, FmConfirmar } from '../Formularios.jsx'
import { PLANOS, rotuloPlano } from '../../utils/planos.js'
import './AdminEscritorios.css'
import './AdminCursos.css'

// Cursos = pastas Prolu da Base de Conhecimento (migration_052). O modal
// "Acesso" de cada curso define: planos (lista explícita), tipos de usuário,
// venda avulsa (Sim/Não), link de compra e ativo; com venda avulsa = Sim, as
// liberações avulsas por escritório. Tudo validado no servidor
// (admin_salvar_acesso_curso, liberar_curso, revogar_curso + triggers).
// Módulos e aulas continuam sendo editados na Base de Conhecimento.

const TIPOS = [
  { value: 'master', label: 'Master' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'comum', label: 'Colaborador' },
]
const ROTULO_TIPO = Object.fromEntries(TIPOS.map(t => [t.value, t.label]))
const ORIGEM = { manual: 'Manual', checkout: 'Checkout', sistema: 'Sistema' }

function fmtData(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—' }
function msgErro(error, padrao) {
  return ['42501', '22023', 'P0002', '23514'].includes(error?.code) && error.message ? error.message : padrao
}
const alternar = (lista, v) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v])

export default function AdminCursos() {
  const { isProluAdmin } = useAuth()
  const toast = useToast()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [cursos, setCursos] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [abertoId, setAbertoId] = useState(null)

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    if (!supabaseReady) { setCarregando(false); return }
    setCarregando(true)
    const [{ data, error }, { data: es }] = await Promise.all([
      supabase.rpc('admin_cursos'),
      supabase.from('empresas').select('id, nome, plano, status_conta').order('nome'),
    ])
    if (error) { console.error('[admin] cursos', error); setErro(true); setCarregando(false); return }
    setErro(false)
    setCursos(Array.isArray(data) ? data : [])
    setEmpresas(es || [])
    setCarregando(false)
  }

  if (!isProluAdmin) return null
  const aberto = cursos.find(c => c.id === abertoId)

  return (
    <PageContainer>
      <PageHeader
        titulo="Cursos"
        descricao="Cada pasta da Base de Conhecimento da Prolu é um curso. Em “Acesso”, defina planos, tipos de usuário e venda avulsa. Módulos e aulas são editados na Base de Conhecimento."
      />

      {carregando ? (
        <p className="esc-loading">Carregando…</p>
      ) : erro ? (
        <p className="esc-loading">Não foi possível carregar os cursos. Confira se a migration 052 foi rodada.</p>
      ) : cursos.length === 0 ? (
        <p className="esc-loading">Nenhuma pasta da Prolu na Base de Conhecimento ainda.</p>
      ) : (
        <div className="acu-tabela-wrap">
          <table className="acu-tabela acu-tabela-cursos">
            <thead>
              <tr><th>Curso</th><th>Planos</th><th>Quem vê</th><th>Venda avulsa</th><th>Aulas</th><th /></tr>
            </thead>
            <tbody>
              {cursos.map(c => (
                <tr key={c.id} className={c.ativo ? '' : 'revogada'}>
                  <td>
                    <div className="acu-emp">{c.titulo}</div>
                    {!c.ativo && <span className="pill pill-gray">Inativo</span>}
                  </td>
                  <td><span className="acu-tags">{c.planos.length ? c.planos.map(p => <PlanoTag key={p} plano={p} />) : <span className="acu-hint">nenhum</span>}</span></td>
                  <td className="acu-data">{c.tipos_usuario.map(t => ROTULO_TIPO[t] || t).join(', ')}</td>
                  <td>
                    {c.venda_avulsa ? <span className="pill pill-violet">Sim</span> : <span className="pill pill-gray">Não</span>}
                    {c.venda_avulsa && c.liberacoes_ativas > 0 && <div className="acu-hint">{c.liberacoes_ativas} {c.liberacoes_ativas === 1 ? 'escritório avulso' : 'escritórios avulsos'}</div>}
                  </td>
                  <td className="acu-data">{c.aulas}{c.aulas_com_regra > 0 && <div>{c.aulas_com_regra} com regra de plano</div>}</td>
                  <td><button className="btn-cancel acu-btn-acesso" onClick={() => setAbertoId(c.id)}>Acesso</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <AcessoModal
          curso={aberto} empresas={empresas}
          onFechar={() => setAbertoId(null)}
          onSalvo={() => { setAbertoId(null); carregar() }}
          onLiberacoesMudaram={carregar}
        />
      )}
    </PageContainer>
  )
}

function AcessoModal({ curso, empresas, onFechar, onSalvo, onLiberacoesMudaram }) {
  const toast = useToast()
  const [form, setForm] = useState({
    planos: curso.planos, tipos: curso.tipos_usuario, ativo: curso.ativo,
    venda: curso.venda_avulsa, link: curso.checkout_url || '',
  })
  const [confirmar, setConfirmar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [liberacoes, setLiberacoes] = useState(null)
  const [liberar, setLiberar] = useState(false)
  const [revogar, setRevogar] = useState(null)

  useEffect(() => { if (curso.venda_avulsa) carregarLiberacoes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarLiberacoes() {
    const { data, error } = await supabase.rpc('admin_curso_liberacoes', { p_pasta_id: curso.id })
    if (error) { toast('Não foi possível carregar as liberações'); setLiberacoes([]); return }
    setLiberacoes(data || [])
  }

  // resumo do que muda, para a confirmação
  const mudancas = useMemo(() => {
    const itens = []
    const ganham = form.planos.filter(p => !curso.planos.includes(p))
    const perdem = curso.planos.filter(p => !form.planos.includes(p))
    if (ganham.length) itens.push(`Passam a acessar: planos ${ganham.map(rotuloPlano).join(', ')}.`)
    if (perdem.length) itens.push(`Deixam de acessar: planos ${perdem.map(rotuloPlano).join(', ')}${curso.venda_avulsa && form.venda ? ' (exceto escritórios liberados avulso)' : ''}.`)
    const tGanham = form.tipos.filter(t => !curso.tipos_usuario.includes(t))
    const tPerdem = curso.tipos_usuario.filter(t => !form.tipos.includes(t))
    if (tGanham.length) itens.push(`Passam a ver: ${tGanham.map(t => ROTULO_TIPO[t]).join(', ')}.`)
    if (tPerdem.length) itens.push(`Deixam de ver: ${tPerdem.map(t => ROTULO_TIPO[t]).join(', ')}.`)
    if (curso.ativo && !form.ativo) itens.push('O curso sai do ar para todos os escritórios.')
    if (!curso.ativo && form.ativo) itens.push('O curso volta a aparecer.')
    if (!curso.venda_avulsa && form.venda && curso.aulas_com_regra > 0) {
      itens.push(`Venda avulsa ligada: ${curso.aulas_com_regra} ${curso.aulas_com_regra === 1 ? 'aula com regra de plano passa' : 'aulas com regra de plano passam'} a ser liberada${curso.aulas_com_regra === 1 ? '' : 's'} para todos que têm o curso.`)
    }
    if (curso.venda_avulsa && !form.venda && curso.liberacoes_ativas > 0) {
      itens.push(`Venda avulsa desligada: ${curso.liberacoes_ativas} ${curso.liberacoes_ativas === 1 ? 'escritório perde' : 'escritórios perdem'} o acesso avulso (liberações revogadas).`)
    }
    return itens
  }, [form, curso])

  const linkInvalido = form.venda && form.link.trim() && !/^https:\/\/\S+$/i.test(form.link.trim())

  async function salvar() {
    setSalvando(true)
    const { data, error } = await supabase.rpc('admin_salvar_acesso_curso', {
      p_pasta_id: curso.id, p_planos: form.planos, p_tipos: form.tipos, p_ativo: form.ativo,
      p_venda_avulsa: form.venda, p_checkout_url: form.venda ? form.link : null,
    })
    setSalvando(false)
    setConfirmar(false)
    if (error) { toast(msgErro(error, 'Não foi possível salvar o acesso')); return }
    const extra = [
      data?.aulas_liberadas ? `${data.aulas_liberadas} aula(s) liberada(s) para todos` : '',
      data?.liberacoes_revogadas ? `${data.liberacoes_revogadas} liberação(ões) revogada(s)` : '',
    ].filter(Boolean).join(' · ')
    toast(extra ? `Acesso salvo · ${extra}` : 'Acesso salvo')
    onSalvo()
  }

  if (confirmar) {
    return (
      <FmConfirmar
        titulo={`Salvar o acesso de “${curso.titulo}”?`}
        texto={mudancas.length ? mudancas.join(' ') : 'Nenhuma mudança de quem acessa; salvar mesmo assim.'}
        rotulo="Salvar" ocupado={salvando} perigo={mudancas.some(m => m.includes('perde') || m.includes('Deixam') || m.includes('sai do ar'))}
        onConfirmar={salvar} onCancelar={() => setConfirmar(false)}
      />
    )
  }
  if (liberar) {
    return <LiberarModal curso={curso} empresas={empresas}
      jaLiberadas={new Set((liberacoes || []).filter(l => !l.revogado_em).map(l => l.empresa_id))}
      onFechar={() => setLiberar(false)}
      onFeito={() => { setLiberar(false); carregarLiberacoes(); onLiberacoesMudaram() }} />
  }
  if (revogar) {
    return <RevogarModal liberacao={revogar} curso={curso}
      onFechar={() => setRevogar(null)}
      onFeito={() => { setRevogar(null); carregarLiberacoes(); onLiberacoesMudaram() }} />
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="modal acu-modal acu-modal-acesso" role="dialog" aria-labelledby="acu-acesso-titulo">
        <div className="modal-title" id="acu-acesso-titulo">Acesso · {curso.titulo}</div>

        <div className="acu-bloco acu-bloco-primeiro">
          <span className="modal-label">Planos que veem o curso</span>
          <div className="acu-planos" role="group" aria-label="Planos que veem o curso">
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
          <p className="acu-hint">Lista explícita: só os planos marcados veem o curso.</p>
        </div>

        <div className="acu-bloco">
          <span className="modal-label">Tipos de usuário que veem</span>
          <div className="acu-planos" role="group" aria-label="Tipos de usuário">
            {TIPOS.map(t => {
              const on = form.tipos.includes(t.value)
              return (
                <button key={t.value} type="button" className={`acu-tipo${on ? ' on' : ''}`} aria-pressed={on}
                  disabled={t.value === 'master'} title={t.value === 'master' ? 'O Master sempre vê' : undefined}
                  onClick={() => setForm(f => ({ ...f, tipos: alternar(f.tipos, t.value) }))}>
                  {t.label}
                </button>
              )
            })}
          </div>
          <p className="acu-hint">Quem não está marcado não vê o curso (nem em vitrine).</p>
        </div>

        <div className="acu-bloco acu-linha">
          <div>
            <span className="modal-label">Venda avulsa disponível</span>
            <div className="acu-sim-nao" role="radiogroup" aria-label="Venda avulsa disponível">
              {[[true, 'Sim'], [false, 'Não']].map(([v, lbl]) => (
                <button key={lbl} type="button" role="radio" aria-checked={form.venda === v}
                  className={`acu-tipo${form.venda === v ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, venda: v }))}>{lbl}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="modal-label">Ativo</span>
            <div className="acu-switch">
              <FmSwitch ligado={form.ativo} rotulo={form.ativo ? 'Desativar curso' : 'Ativar curso'} onChange={v => setForm(f => ({ ...f, ativo: v }))} />
              <span>{form.ativo ? 'No ar' : 'Fora do ar'}</span>
            </div>
          </div>
        </div>
        <p className="acu-hint">
          {form.venda
            ? 'Sim: curso vendido separadamente. Quem tem acesso (plano ou avulso) vê todas as aulas; não há regra de plano por aula.'
            : 'Não: acesso só pelo plano e tipo de usuário. Permite regra de plano por aula; sem link de compra e sem escritórios avulsos.'}
        </p>

        {form.venda && (
          <div className="acu-bloco">
            <label className="modal-label" htmlFor="acu-link">Link de compra (opcional)</label>
            <input id="acu-link" className="modal-input" value={form.link} placeholder="https://… — sem link, o botão vira “Fale com o Comercial”"
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))} />
            {linkInvalido && <p className="acu-erro">O link precisa começar com https://</p>}
          </div>
        )}

        {form.venda && (
          <div className="acu-bloco">
            <div className="acu-secao-head">
              <span className="modal-label">Escritórios avulsos</span>
              {curso.venda_avulsa && <button className="btn-cancel acu-btn-mini" onClick={() => setLiberar(true)}><IconPlus /> Liberar escritório</button>}
            </div>
            {!curso.venda_avulsa ? (
              <p className="acu-hint">Salve com venda avulsa = Sim para liberar escritórios.</p>
            ) : liberacoes === null ? <p className="acu-hint">Carregando…</p>
              : liberacoes.length === 0 ? <p className="acu-hint">Nenhum escritório liberado fora do plano.</p>
              : (
                <ul className="acu-libs">
                  {liberacoes.map(l => (
                    <li key={l.id} className={l.revogado_em ? 'revogada' : ''}>
                      <div>
                        <span className="acu-emp">{l.empresa_nome}</span> <PlanoTag plano={l.empresa_plano} />
                        <div className="acu-hint">
                          {ORIGEM[l.origem] || l.origem} · {fmtData(l.criado_em)}{l.motivo ? ` · ${l.motivo}` : ''}
                          {l.revogado_em && <> · <span className="acu-revog">revogada {fmtData(l.revogado_em)}{l.revogado_motivo ? `: ${l.revogado_motivo}` : ''}</span></>}
                        </div>
                      </div>
                      {!l.revogado_em && <button className="acu-revogar" onClick={() => setRevogar(l)}>Revogar</button>}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onFechar}>Cancelar</button>
          <button className="btn-confirm" disabled={linkInvalido || !form.tipos.includes('master')} onClick={() => setConfirmar(true)}>Salvar acesso</button>
        </div>
      </div>
    </div>
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
    const { error } = await supabase.rpc('liberar_curso', { p_empresa_id: empresa.id, p_pasta_id: curso.id, p_origem: 'manual', p_motivo: motivo.trim() || null })
    setBusy(false)
    if (error) { toast(msgErro(error, 'Não foi possível liberar o curso')); return }
    toast(`Curso liberado para ${empresa.nome}`)
    onFeito()
  }

  if (confirmando) {
    return (
      <FmConfirmar titulo="Liberar curso?"
        texto={`${empresa.nome} (plano ${rotuloPlano(empresa.plano)}) passa a acessar o curso inteiro “${curso.titulo}”, independente do plano.`}
        rotulo="Liberar" ocupado={busy} onConfirmar={liberar} onCancelar={() => setConfirmando(false)} />
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
          <button className="btn-cancel" onClick={onFechar}>Voltar</button>
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
    const { error } = await supabase.rpc('revogar_curso', { p_empresa_id: liberacao.empresa_id, p_pasta_id: curso.id, p_motivo: motivo.trim() || null })
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
          {liberacao.empresa_nome} deixa de acessar “{curso.titulo}”, a não ser que o plano dele ({rotuloPlano(liberacao.empresa_plano)}) esteja na lista do curso. A liberação fica no histórico.
        </p>
        <div className="modal-field">
          <label className="modal-label" htmlFor="acu-rev-motivo">Motivo (opcional)</label>
          <input id="acu-rev-motivo" className="modal-input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: reembolso" />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onFechar} disabled={busy}>Voltar</button>
          <button className="btn-danger" onClick={revogar} disabled={busy}>{busy ? 'Revogando…' : 'Revogar'}</button>
        </div>
      </div>
    </div>
  )
}
