import { useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import { isoLocal } from '../../services/fechamentos.js'
import { rotuloPlano } from '../../utils/planos.js'

// Ações de conta do prolu_admin (Passo 2). Tudo passa pelas RPCs da
// migration_046, que conferem auth_is_prolu_admin(), validam e gravam o
// histórico com origem 'manual'. Toda ação pede confirmação antes.

// Erros levantados nas RPCs (raise exception) já vêm com texto para o admin
function mensagemErro(error, padrao) {
  return ['42501', '22023', 'P0002'].includes(error?.code) && error.message ? error.message : padrao
}

function hojeMais(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

// Troca de plano: "Alterar o plano de X de A para B?" + motivo opcional.
// Cancelar não aplica nada (o select da linha volta sozinho ao valor salvo).
export function ConfirmarPlanoModal({ escritorio, novoPlano, onCancel, onDone }) {
  const toast = useToast()
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirmar() {
    setBusy(true)
    const { error } = await supabase.rpc('admin_alterar_plano', {
      p_empresa_id: escritorio.id, p_plano: novoPlano, p_motivo: motivo.trim() || null,
    })
    setBusy(false)
    if (error) { toast(mensagemErro(error, 'Não foi possível alterar o plano')); return }
    toast(`Plano de ${escritorio.nome} alterado para ${rotuloPlano(novoPlano)}`)
    onDone(escritorio.id)
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="modal" role="dialog" aria-labelledby="gp-plano-titulo">
        <div className="modal-title" id="gp-plano-titulo">Alterar plano</div>
        <p className="gp-confirma-texto">
          Alterar o plano de <strong>{escritorio.nome}</strong> de <strong>{rotuloPlano(escritorio.plano)}</strong> para <strong>{rotuloPlano(novoPlano)}</strong>?
        </p>
        <div className="modal-field">
          <label className="modal-label" htmlFor="gp-plano-motivo">Motivo (opcional)</label>
          <textarea id="gp-plano-motivo" className="modal-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pagamento confirmado no Asaas" />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="btn-confirm" onClick={confirmar} disabled={busy}>{busy ? 'Salvando…' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}

const ACOES = {
  suspender: {
    titulo: 'Suspender conta',
    texto: (nome) => <>A conta de <strong>{nome}</strong> fica inativa e inacessível para toda a equipe, e a página e os formulários públicos ficam indisponíveis. Nenhum dado é excluído.</>,
    botao: 'Suspender',
    perigo: true,
  },
  reativar: {
    titulo: 'Reativar conta',
    texto: (nome) => <>A conta de <strong>{nome}</strong> volta a ficar ativa, com o mesmo plano de antes.</>,
    botao: 'Reativar',
  },
  encerrar: {
    titulo: 'Encerrar conta',
    texto: (nome) => <>A conta de <strong>{nome}</strong> fica suspensa até a data de exclusão programada.</>,
    botao: 'Encerrar conta',
    perigo: true,
  },
  cancelar_encerramento: {
    titulo: 'Cancelar encerramento',
    texto: (nome) => <>A exclusão programada de <strong>{nome}</strong> é cancelada. Escolha como a conta fica.</>,
    botao: 'Confirmar',
  },
}

// Suspender (motivo obrigatório), reativar, encerrar (data + motivo) e
// cancelar encerramento (volta para ativa ou suspensa, à escolha).
export function AcaoContaModal({ escritorio, acao, onCancel, onDone }) {
  const toast = useToast()
  const cfg = ACOES[acao]
  const [motivo, setMotivo] = useState('')
  const [data, setData] = useState(hojeMais(30))
  const [destino, setDestino] = useState('ativa') // cancelar_encerramento
  const [busy, setBusy] = useState(false)

  const status = acao === 'suspender' ? 'suspensa'
    : acao === 'encerrar' ? 'encerrando'
    : acao === 'cancelar_encerramento' ? destino
    : 'ativa'
  const exigeMotivo = status === 'suspensa'
  const pronto = (!exigeMotivo || motivo.trim()) && (status !== 'encerrando' || (data && data >= isoLocal(new Date())))

  async function confirmar() {
    if (!pronto) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_alterar_status', {
      p_empresa_id: escritorio.id,
      p_status: status,
      p_motivo: motivo.trim() || null,
      p_exclusao_programada_em: status === 'encerrando' ? data : null,
    })
    setBusy(false)
    if (error) { toast(mensagemErro(error, 'Não foi possível alterar a conta')); return }
    toast(status === 'ativa' ? 'Conta reativada' : status === 'suspensa' ? 'Conta suspensa' : 'Encerramento programado')
    onDone(escritorio.id)
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="modal" role="dialog" aria-labelledby="gp-acao-titulo">
        <div className="modal-title" id="gp-acao-titulo">{cfg.titulo}</div>
        <p className="gp-confirma-texto">{cfg.texto(escritorio.nome)}</p>

        {acao === 'encerrar' && (
          <>
            <p className="gp-aviso">Os dados NÃO são excluídos automaticamente neste momento. A data fica só registrada.</p>
            <div className="modal-field">
              <label className="modal-label" htmlFor="gp-data">Exclusão programada para</label>
              <input id="gp-data" type="date" className="modal-input" value={data} min={isoLocal(new Date())} onChange={(e) => setData(e.target.value)} />
            </div>
          </>
        )}

        {acao === 'cancelar_encerramento' && (
          <div className="modal-field">
            <span className="modal-label">A conta fica</span>
            <div className="gp-opcoes">
              {[['ativa', 'Ativa'], ['suspensa', 'Suspensa']].map(([v, lbl]) => (
                <button key={v} type="button" className={`gp-opcao${destino === v ? ' ativo' : ''}`} onClick={() => setDestino(v)}>{lbl}</button>
              ))}
            </div>
          </div>
        )}

        {acao !== 'reativar' && (
          <div className="modal-field">
            <label className="modal-label" htmlFor="gp-motivo">Motivo{exigeMotivo ? '' : ' (opcional)'}</label>
            <textarea id="gp-motivo" className="modal-input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={exigeMotivo ? 'Obrigatório. Ex.: pedido do cliente' : 'Ex.: cliente pediu para encerrar'} />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={cfg.perigo ? 'btn-danger' : 'btn-confirm'} onClick={confirmar} disabled={busy || !pronto}>
            {busy ? 'Salvando…' : cfg.botao}
          </button>
        </div>
      </div>
    </div>
  )
}
