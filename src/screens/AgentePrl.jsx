import { useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { IconAgente, IconArrowUpRight, IconClose, IconCheck } from '../components/Icons.jsx'
import './AgentePrl.css'

const STEPS = [
  {
    n: 1,
    title: 'Crie um novo Project',
    body: <>No menu lateral esquerdo, clique em <strong>Projects</strong> e depois em <strong>New Project</strong>. Dê o nome <code>Agente Prolu</code>.</>,
  },
  {
    n: 2,
    title: 'Cole as instruções',
    body: <>Dentro do projeto, clique em <strong>Set project instructions</strong>. Abra o arquivo <code>instrucoes.txt</code>, copie todo o conteúdo e cole aqui. Salve.</>,
  },
  {
    n: 3,
    title: 'Adicione o conhecimento',
    body: <>Ainda no projeto, clique em <strong>Add content</strong> ou <strong>Project files</strong>. Faça upload do arquivo <code>conhecimento.txt</code>.</>,
  },
  {
    n: 4,
    title: 'Abra uma conversa e comece',
    body: <>Abra uma nova conversa dentro do projeto e tente: <em>"Quero criar um vídeo para atrair pedidos de orçamento"</em> ou <em>"Me ajuda a montar uma proposta para um cliente"</em>.</>,
  },
]

const FILES = [
  { name: 'instrucoes.txt', desc: 'Cole no campo de instruções do Project', url: 'https://prolu.com.br/wp-content/uploads/agente-prolu/instrucoes-agente-prolu.txt' },
  { name: 'conhecimento.txt', desc: 'Faça upload como arquivo do Project', url: 'https://prolu.com.br/wp-content/uploads/agente-prolu/conhecimento-agente-prolu.txt' },
]

export default function AgentePrl() {
  const toast = useToast()
  const [claudeOpen, setClaudeOpen] = useState(false)

  return (
    <>
      {/* hero */}
      <div className="agp-hero">
        <span className="agp-tag"><IconAgente /> Exclusivo para clientes Prolu</span>
        <h1 className="agp-title">Seu assistente estratégico <em>já está pronto.</em></h1>
        <p className="agp-sub">O Agente Prolu aplica o método completo para ajudar você a atender melhor, montar propostas e criar conteúdo que atrai orçamentos.</p>
      </div>

      {/* escolha de plataforma */}
      <div className="section-title">Como acessar</div>
      <p className="agp-intro">O agente está disponível em duas versões. O conteúdo é o mesmo — escolha a que se encaixa melhor no seu fluxo de trabalho.</p>

      <div className="agp-options">
        <div className="agp-card featured">
          <span className="agp-badge">Mais simples</span>
          <h3>ChatGPT</h3>
          <p>Acesse pelo link e já começa a usar. Não precisa configurar nada.</p>
          <a
            href="https://chatgpt.com/g/g-6a275f2e6b90819199b3cd3a70720fac-agente-prolu"
            target="_blank"
            rel="noreferrer"
            className="agp-btn agp-btn-primary"
          >
            Acessar o Agente Prolu <IconArrowUpRight />
          </a>
        </div>

        <div className="agp-card">
          <span className="agp-badge alt">Mais controle</span>
          <h3>Claude</h3>
          <p>Configure seu próprio projeto privado no Claude. As conversas ficam salvas e organizadas por cliente.</p>
          <button className="agp-btn agp-btn-secondary" onClick={() => setClaudeOpen(true)}>
            Ver como configurar
          </button>
        </div>
      </div>

      {/* modal de instruções claude */}
      {claudeOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setClaudeOpen(false) }}>
          <div className="agp-modal">
            <button className="agp-modal-close" onClick={() => setClaudeOpen(false)} aria-label="Fechar">
              <IconClose />
            </button>

            <span className="agp-tag dark">Configuração do Claude</span>
            <h2 className="agp-modal-title">Agente Prolu no <em>Claude</em></h2>
            <p className="agp-modal-sub">Configure seu projeto privado em 4 passos. As conversas ficam salvas e organizadas por cliente.</p>

            <div className="agp-label">Antes de começar</div>
            <h3 className="agp-h3">Baixe os dois arquivos</h3>
            <p className="agp-p">Você vai precisar deles durante a configuração.</p>

            <div className="agp-download-box">
              <div className="agp-download-title">Arquivos do Agente Prolu</div>
              <div className="agp-download-files">
                {FILES.map((f) => (
                  <a key={f.name} href={f.url} className="agp-download-file" download onClick={() => toast(`Baixando ${f.name}`)}>
                    <div>
                      <div className="agp-file-name">{f.name}</div>
                      <div className="agp-file-desc">{f.desc}</div>
                    </div>
                    <span className="agp-download-icon">↓</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="agp-label">Passo a passo</div>
            <h3 className="agp-h3">Como configurar</h3>
            <p className="agp-p">Acesse claude.ai e siga os passos abaixo.</p>

            <div className="agp-steps">
              {STEPS.map((s) => (
                <div className="agp-step" key={s.n}>
                  <div className="agp-step-number">{s.n}</div>
                  <div className="agp-step-content">
                    <h4>{s.title}</h4>
                    <p>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <a href="https://claude.ai" target="_blank" rel="noreferrer" className="agp-btn agp-btn-primary agp-modal-cta">
              Abrir claude.ai <IconArrowUpRight />
            </a>
          </div>
        </div>
      )}
    </>
  )
}
