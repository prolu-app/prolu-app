import { useConta } from '../contexts/ContaContext.jsx'
import PageHeader, { PageContainer } from '../components/PageHeader.jsx'
import { CartaoVitrine } from '../components/BloqueioPlano.jsx'
import './ProjetosEmBreve.css'

// Área de Projetos ainda sem funcionalidade (Lote B): só a página provisória.
// Sem o plano mínimo, mostra também o convite de upgrade; com ele, só o aviso.
// Nada aqui é anunciado como pronto.
export const PAGINAS_PROJETOS = {
  projetos_visao_geral: {
    titulo: 'Visão Geral',
    descricao: 'Números e andamento de todos os projetos do escritório.',
  },
  projetos_etapas_tarefas: {
    titulo: 'Etapas e Tarefas',
    descricao: 'Projetos com etapas, tarefas e responsáveis.',
  },
  projetos_cronograma: {
    titulo: 'Cronograma',
    descricao: 'Prazos e entregas ao longo do tempo.',
  },
}

export default function ProjetosEmBreve({ recurso }) {
  const { planoLibera } = useConta()
  const pagina = PAGINAS_PROJETOS[recurso]
  const liberado = planoLibera(recurso)

  return (
    <PageContainer>
      <PageHeader
        titulo={pagina.titulo}
        descricao={pagina.descricao}
        acoes={<span className="pe-selo">Em breve</span>}
      />

      <div className="card pe-aviso">
        <p className="pe-aviso-titulo">Esta área ainda está em construção.</p>
        <p className="pe-aviso-texto">
          {liberado
            ? 'Ela já faz parte do plano do seu escritório e aparece aqui assim que estiver pronta.'
            : 'Quando estiver pronta, fará parte dos planos a partir do indicado abaixo.'}
        </p>
      </div>

      {!liberado && (
        <div className="pe-vitrine">
          <CartaoVitrine recurso={recurso} />
        </div>
      )}
    </PageContainer>
  )
}
