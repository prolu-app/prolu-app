import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import { IconClose } from '../../components/Icons.jsx'
import { PLANOS, rotuloPlano, rotuloStatusConta } from '../../utils/planos.js'
import { ConfirmarPlanoModal, AcaoContaModal } from './AdminContaAcoes.jsx'
import { StatusContaPill } from './AdminEscritoriosGestao.jsx'

const ROLE_LABEL = { master: 'Master', gestor: 'Gestor', comum: 'Colaborador', prolu_admin: 'Prolu' }
const ROLE_PILL = { master: 'pill-dark', gestor: 'pill-blue', comum: 'pill-gray', prolu_admin: 'pill-dark' }
const ORIGEM_LABEL = { manual: 'Manual (admin)', asaas: 'Asaas', sistema: 'Sistema' }

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}
// colunas DATE ('YYYY-MM-DD') sem passar por UTC
function fmtDia(dia) {
  if (!dia) return '—'
  const [y, m, d] = dia.split('-')
  return `${d}/${m}/${y}`
}
function fmtDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function valorHistorico(h, valor) {
  return h.tipo === 'plano' ? rotuloPlano(valor) || '—' : rotuloStatusConta(valor) || '—'
}

// Detalhe de um escritório (prolu_admin). O resumo comercial usa o MESMO
// objeto da lista (mesmas consultas e período dos cards). Equipe/Base de
// Conhecimento vêm de admin_escritorio_equipe() e o histórico de
// empresa_historico (migration_046).
export default function AdminEscritorioDetalhe({ escritorio: e, periodOpts, period, onPeriod, onEntrar, onAlterado, onClose }) {
  const [equipe, setEquipe] = useState(null) // null = carregando
  const [equipeErro, setEquipeErro] = useState(false)
  const [historico, setHistorico] = useState(null)
  const [historicoErro, setHistoricoErro] = useState(false)
  const [trocaPlano, setTrocaPlano] = useState(null)
  const [acao, setAcao] = useState(null)

  useEffect(() => {
    let vivo = true
    setEquipe(null); setEquipeErro(false)
    supabase.rpc('admin_escritorio_equipe', { p_empresa_id: e.id }).then(({ data, error }) => {
      if (!vivo) return
      if (error) { console.error('[admin] equipe', error); setEquipeErro(true); setEquipe([]); return }
      setEquipe(data || [])
    })
    return () => { vivo = false }
  }, [e.id])

  // recarrega quando plano/status mudam (nova linha no histórico)
  useEffect(() => {
    let vivo = true
    setHistorico(null); setHistoricoErro(false)
    supabase.from('empresa_historico')
      .select('id, tipo, valor_anterior, valor_novo, exclusao_programada_em, motivo, origem, criado_em, autor:feito_por(nome)')
      .eq('empresa_id', e.id)
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) { console.error('[admin] historico', error); setHistoricoErro(true); setHistorico([]); return }
        setHistorico(data || [])
      })
    return () => { vivo = false }
  }, [e.id, e.plano, e.statusConta, e.exclusaoProgramadaEm])

  useEffect(() => {
    function onKey(ev) { if (ev.key === 'Escape' && !trocaPlano && !acao) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trocaPlano, acao, onClose])

  const kbTotal = (equipe || []).reduce((s, m) => s + m.kb_total, 0)
  const kbFeitas = (equipe || []).reduce((s, m) => s + m.kb_concluidas, 0)
  const kbPct = kbTotal ? Math.round((kbFeitas / kbTotal) * 100) : null

  function concluirAcao(id) {
    setTrocaPlano(null)
    setAcao(null)
    onAlterado(id)
  }

  return (
    <div className="modal-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose() }}>
      <div className="gp-detalhe" role="dialog" aria-labelledby="gp-det-nome">
        <button className="gp-fechar" onClick={onClose} aria-label="Fechar"><IconClose /></button>

        {/* a) cabeçalho */}
        <header className="gp-det-head">
          <div className="esc-avatar">{(e.nome || '?').charAt(0).toUpperCase()}</div>
          <div className="gp-det-titulos">
            <h2 className="gp-det-nome" id="gp-det-nome">{e.nome}</h2>
            <div className="gp-det-meta">
              <span className="pill pill-dark">{rotuloPlano(e.plano) || '—'}</span>
              <StatusContaPill status={e.statusConta} />
              <span>Criado em {fmtDate(e.criadoEm)}</span>
            </div>
          </div>
          <button className="btn-cancel gp-entrar" onClick={() => onEntrar(e)}>Entrar como escritório →</button>
        </header>

        {e.statusConta === 'suspensa' && (
          <p className="gp-aviso">Suspensa desde {fmtDate(e.suspensaEm)}{e.suspensaoMotivo ? ` · ${e.suspensaoMotivo}` : ''}</p>
        )}
        {e.statusConta === 'encerrando' && (
          <p className="gp-aviso">
            Encerramento: exclusão programada para <strong>{fmtDia(e.exclusaoProgramadaEm)}</strong>
            {e.suspensaoMotivo ? ` · ${e.suspensaoMotivo}` : ''}. Os dados NÃO são excluídos automaticamente.
          </p>
        )}

        {/* b) resumo comercial */}
        <section className="gp-secao">
          <div className="gp-secao-head">
            <h3 className="section-title gp-secao-titulo">Resumo comercial</h3>
            <div className="adm-period-pills">
              {periodOpts.map(([k, lbl]) => (
                <button key={k} className={`adm-period-pill${period === k ? ' active' : ''}`} onClick={() => onPeriod(k)}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="gp-stats">
            <div className="esc-stat"><span className="esc-stat-label">Pedidos no período</span><span className="esc-stat-val">{e.pedidosPeriodo}</span></div>
            <div className="esc-stat"><span className="esc-stat-label">Fechamentos</span><span className="esc-stat-val">{e.qtdFechamentos}</span></div>
            <div className="esc-stat"><span className="esc-stat-label">Valor fechado</span><span className="esc-stat-val">{fmtMoney(e.valorFechamentos)}</span></div>
            <div className="esc-stat"><span className="esc-stat-label">Conversão</span><span className="esc-stat-val">{e.taxaConversao !== null ? `${e.taxaConversao}%` : '—'}</span></div>
            <div className="esc-stat"><span className="esc-stat-label">Último acesso</span><span className="esc-stat-val esc-stat-date">{fmtDate(e.ultimoAcesso)}</span></div>
          </div>
        </section>

        {/* c + d) equipe e Base de Conhecimento */}
        <section className="gp-secao">
          <div className="gp-secao-head">
            <h3 className="section-title gp-secao-titulo">Equipe e Base de Conhecimento</h3>
            {kbPct !== null && <span className="gp-kb-geral">Escritório: {kbFeitas} de {kbTotal} aulas · {kbPct}%</span>}
          </div>
          {equipe === null ? (
            <p className="esc-loading">Carregando…</p>
          ) : equipeErro ? (
            <p className="esc-loading">Não foi possível carregar a equipe.</p>
          ) : equipe.length === 0 ? (
            <p className="esc-loading">Nenhum usuário neste escritório.</p>
          ) : (
            <div className="gp-tabela-wrap gp-tabela-wrap-interna">
              <table className="gp-tabela gp-tabela-equipe">
                <thead>
                  <tr>
                    <th scope="col">Pessoa</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Último login</th>
                    <th scope="col">Base de Conhecimento</th>
                  </tr>
                </thead>
                <tbody>
                  {equipe.map(m => {
                    const pct = m.kb_total ? Math.round((m.kb_concluidas / m.kb_total) * 100) : null
                    return (
                      <tr key={m.usuario_id}>
                        <td>
                          <div className="esc-name">{m.nome || '—'}</div>
                          <div className="esc-master">{m.email || '—'}</div>
                        </td>
                        <td><span className={`pill ${ROLE_PILL[m.role] || 'pill-gray'}`}>{ROLE_LABEL[m.role] || m.role}</span></td>
                        <td className="gp-data">{fmtDate(m.ultimo_login)}</td>
                        <td>
                          {pct === null ? '—' : (
                            <div className="gp-kb">
                              <div className="gp-kb-barra"><span style={{ width: `${pct}%` }} /></div>
                              <span className="gp-kb-num">{m.kb_concluidas}/{m.kb_total} · {pct}%</span>
                              {m.kb_ultima_conclusao && <span className="gp-kb-ultima">última em {fmtDate(m.kb_ultima_conclusao)}</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* e) conta e plano */}
        <section className="gp-secao">
          <h3 className="section-title gp-secao-titulo">Conta e plano</h3>
          <div className="gp-acoes">
            <label className="gp-acao-plano">
              <span className="modal-label">Plano</span>
              <select className="gp-select gp-select-plano" value={e.plano || ''} onChange={ev => setTrocaPlano(ev.target.value)}>
                {PLANOS.map(p => <option key={p} value={p}>{rotuloPlano(p)}</option>)}
              </select>
            </label>
            <div className="gp-acao-botoes">
              {e.statusConta === 'ativa' && <button className="btn-cancel" onClick={() => setAcao('suspender')}>Suspender</button>}
              {e.statusConta === 'suspensa' && <button className="btn-confirm" onClick={() => setAcao('reativar')}>Reativar</button>}
              {e.statusConta !== 'encerrando' && <button className="btn-cancel gp-btn-perigo" onClick={() => setAcao('encerrar')}>Encerrar conta</button>}
              {e.statusConta === 'encerrando' && <button className="btn-confirm" onClick={() => setAcao('cancelar_encerramento')}>Cancelar encerramento</button>}
            </div>
          </div>

          <h4 className="gp-hist-titulo">Histórico de mudanças</h4>
          {historico === null ? (
            <p className="esc-loading">Carregando…</p>
          ) : historicoErro ? (
            <p className="esc-loading">Não foi possível carregar o histórico.</p>
          ) : historico.length === 0 ? (
            <p className="esc-loading">Nenhuma mudança de plano ou status registrada ainda.</p>
          ) : (
            <ol className="gp-hist">
              {historico.map(h => (
                <li key={h.id} className="gp-hist-item">
                  <div className="gp-hist-linha">
                    <span className="gp-hist-tipo">{h.tipo === 'plano' ? 'Plano' : 'Status'}</span>
                    <span>{valorHistorico(h, h.valor_anterior)} → <strong>{valorHistorico(h, h.valor_novo)}</strong></span>
                    {h.tipo === 'status' && h.valor_novo === 'encerrando' && h.exclusao_programada_em && (
                      <span className="gp-hist-extra">exclusão em {fmtDia(h.exclusao_programada_em)}</span>
                    )}
                  </div>
                  {h.motivo && <div className="gp-hist-motivo">{h.motivo}</div>}
                  <div className="gp-hist-meta">
                    {fmtDataHora(h.criado_em)} · {ORIGEM_LABEL[h.origem] || h.origem}{h.autor?.nome ? ` · ${h.autor.nome}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {trocaPlano && trocaPlano !== e.plano && (
        <ConfirmarPlanoModal escritorio={e} novoPlano={trocaPlano} onCancel={() => setTrocaPlano(null)} onDone={concluirAcao} />
      )}
      {acao && (
        <AcaoContaModal escritorio={e} acao={acao} onCancel={() => setAcao(null)} onDone={concluirAcao} />
      )}
    </div>
  )
}
