import { useMemo, useState } from 'react'
import { IconSearch } from '../../components/Icons.jsx'
import { PLANOS, STATUS_CONTA, rotuloPlano, rotuloStatusConta } from '../../utils/planos.js'
import { ConfirmarPlanoModal } from './AdminContaAcoes.jsx'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function StatusContaPill({ status }) {
  return <span className={`pill ${STATUS_CONTA[status]?.pill || 'pill-gray'}`}>{rotuloStatusConta(status)}</span>
}

const ORDENS = {
  nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  criado: (a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''),
  acesso: (a, b) => (a.ultimoAcesso || '').localeCompare(b.ultimoAcesso || ''),
}

function Cabecalho({ campo, ordem, onOrdenar, children }) {
  const ativo = ordem.campo === campo
  return (
    <th scope="col" aria-sort={ativo ? (ordem.asc ? 'ascending' : 'descending') : 'none'}>
      <button className={`gp-ordem${ativo ? ' ativo' : ''}`} onClick={() => onOrdenar(campo)}>
        {children}<span aria-hidden="true">{ativo ? (ordem.asc ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  )
}

// Aba "Gestão" de Escritórios: tabela com plano editável na linha. Recebe a
// MESMA lista já carregada pela aba Resumo (AdminEscritorios) — usuários e
// último acesso saem das mesmas consultas dos cards, sem consulta por linha.
export default function AdminEscritoriosGestao({ escritorios, onAbrir, onAlterado }) {
  const [busca, setBusca] = useState('')
  const [filtroPlano, setFiltroPlano] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ordem, setOrdem] = useState({ campo: 'nome', asc: true })
  const [trocaPlano, setTrocaPlano] = useState(null) // { escritorio, novoPlano }

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const filtrada = escritorios.filter(e =>
      (!q || e.nome.toLowerCase().includes(q))
      && (!filtroPlano || e.plano === filtroPlano)
      && (!filtroStatus || e.statusConta === filtroStatus))
    const cmp = ORDENS[ordem.campo]
    return [...filtrada].sort((a, b) => (ordem.asc ? cmp(a, b) : cmp(b, a)))
  }, [escritorios, busca, filtroPlano, filtroStatus, ordem])

  function ordenarPor(campo) {
    setOrdem(o => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: campo === 'nome' }))
  }

  return (
    <>
      <div className="gp-filtros">
        <div className="esc-search gp-busca">
          <IconSearch className="esc-search-icon" />
          <input
            className="esc-search-input"
            placeholder="Buscar por nome do escritório…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <select className="gp-select" value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)} aria-label="Filtrar por plano">
          <option value="">Todos os planos</option>
          {PLANOS.map(p => <option key={p} value={p}>{rotuloPlano(p)}</option>)}
        </select>
        <select className="gp-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {Object.keys(STATUS_CONTA).map(s => <option key={s} value={s}>{rotuloStatusConta(s)}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <p className="esc-loading">
          {escritorios.length === 0 ? 'Nenhum escritório cadastrado ainda.' : 'Nenhum escritório encontrado com esses filtros.'}
        </p>
      ) : (
        <div className="gp-tabela-wrap">
          <table className="gp-tabela">
            <thead>
              <tr>
                <Cabecalho campo="nome" ordem={ordem} onOrdenar={ordenarPor}>Escritório</Cabecalho>
                <th scope="col">Plano</th>
                <th scope="col">Status</th>
                <th scope="col" className="gp-num">Usuários</th>
                <Cabecalho campo="acesso" ordem={ordem} onOrdenar={ordenarPor}>Último acesso</Cabecalho>
                <Cabecalho campo="criado" ordem={ordem} onOrdenar={ordenarPor}>Criado em</Cabecalho>
              </tr>
            </thead>
            <tbody>
              {lista.map(e => (
                <tr
                  key={e.id}
                  className="gp-linha"
                  onClick={() => onAbrir(e.id)}
                  onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onAbrir(e.id) } }}
                  tabIndex={0}
                >
                  <td>
                    <div className="esc-name">{e.nome}</div>
                    <div className="esc-master">{e.masterNome}</div>
                  </td>
                  <td onClick={ev => ev.stopPropagation()}>
                    <select
                      className="gp-select gp-select-plano"
                      value={e.plano || ''}
                      onChange={ev => setTrocaPlano({ escritorio: e, novoPlano: ev.target.value })}
                      aria-label={`Plano de ${e.nome}`}
                    >
                      {PLANOS.map(p => <option key={p} value={p}>{rotuloPlano(p)}</option>)}
                    </select>
                  </td>
                  <td><StatusContaPill status={e.statusConta} /></td>
                  <td className="gp-num">{e.totalUsuarios}</td>
                  <td className="gp-data">{fmtDate(e.ultimoAcesso)}</td>
                  <td className="gp-data">{fmtDate(e.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trocaPlano && (
        <ConfirmarPlanoModal
          escritorio={trocaPlano.escritorio}
          novoPlano={trocaPlano.novoPlano}
          onCancel={() => setTrocaPlano(null)}
          onDone={id => { setTrocaPlano(null); onAlterado(id) }}
        />
      )}
    </>
  )
}
