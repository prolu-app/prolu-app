import { CORES_TAG, rotuloPlano, rotuloStatusConta } from '../utils/planos.js'
import './PlanoTag.css'

function Tag({ cores, children, tamanho }) {
  const estilo = cores ? { background: cores.fundo, color: cores.texto, borderColor: cores.borda } : undefined
  return <span className={`tag-plano${tamanho === 'grande' ? ' tag-plano-grande' : ''}`} style={estilo}>{children}</span>
}

// Tag colorida do plano (cores em CORES_TAG, src/utils/planos.js)
export function PlanoTag({ plano, tamanho }) {
  if (!plano) return <span className="tag-plano tag-plano-vazia">—</span>
  return <Tag cores={CORES_TAG.plano[plano]} tamanho={tamanho}>{rotuloPlano(plano) || plano}</Tag>
}

// Tag colorida do status da conta (ativa / suspensa / encerrando)
export function StatusTag({ status, tamanho }) {
  if (!status) return <span className="tag-plano tag-plano-vazia">—</span>
  return <Tag cores={CORES_TAG.status[status]} tamanho={tamanho}>{rotuloStatusConta(status)}</Tag>
}
