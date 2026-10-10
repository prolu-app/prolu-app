import './PageHeader.css'

// Container único de página: mesma largura máxima e mesmas margens em todas as
// telas que o usam (o padding externo continua sendo o do .main do AppLayout).
export function PageContainer({ children, className = '' }) {
  return <div className={`page-container${className ? ` ${className}` : ''}`}>{children}</div>
}

// Cabeçalho único de página: título e descrição à esquerda, ação principal à
// direita alinhada ao título, e respiro fixo até o conteúdo. Em telas
// estreitas a ação desce para baixo da descrição.
export default function PageHeader({ titulo, descricao, acoes, className = '' }) {
  return (
    <header className={`ph${className ? ` ${className}` : ''}`}>
      <div className="ph-texto">
        <h1 className="page-title">{titulo}</h1>
        {descricao && <p className="page-sub">{descricao}</p>}
      </div>
      {acoes && <div className="ph-acoes">{acoes}</div>}
    </header>
  )
}
