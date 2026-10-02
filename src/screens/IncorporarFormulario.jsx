import { useState } from 'react'
import { useToast } from '../contexts/ToastContext.jsx'
import { IconCopy } from '../components/Icons.jsx'

// Tela "Incorporar" do formulário (Fase 3): gera o código para o escritório
// colar no próprio site. Dois modos, mesmo formulário e mesma Edge Function:
//   iframe → /f/:slug?embed=1, isolado do site; aparência pelo painel
//            Estilo do editor (formularios.estilo)
//   cru    → public/embed.js monta o formulário direto no DOM do site, sem
//            isolamento; aparência pelo CSS do próprio site
// As classes listadas (só no modo cru) são as de embed.js — as mesmas da página pública.

const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/formulario-publico`

const MODOS = [
  {
    value: 'iframe',
    titulo: 'Com estilo do Prolu',
    texto: 'Um iframe com o formulário igual ao link público. O CSS do seu site não interfere. A aparência vem do painel Estilo do formulário.',
  },
  {
    value: 'cru',
    titulo: 'Cru, para estilizar no meu site',
    texto: 'O formulário entra direto na página, quase sem estilo. O CSS do seu site estiliza tudo, inclusive regras gerais do tema (input, button…).',
  },
]

const CLASSES = [
  ['.prolu-form', 'Caixa do formulário. data-estado = carregando | pronto | enviado | indisponivel'],
  ['.prolu-form__escritorio', 'Nome do escritório (sempre, no topo)'],
  ['.prolu-form__titulo', 'Título da página, abaixo do escritório (se houver); também nas mensagens'],
  ['.prolu-form__capa', 'Imagem de capa (se houver)'],
  ['.prolu-form__logo', 'Logo (se houver)'],
  ['.prolu-form__intro', 'Texto de introdução'],
  ['.prolu-form__video', 'Caixa do vídeo do YouTube (iframe dentro)'],
  ['.prolu-form__campos', 'Lista com todos os campos'],
  ['.prolu-form__campo', 'Cada campo (rótulo + resposta + erro)'],
  ['.prolu-form__campo--{tipo}', 'Por tipo: text, textarea, number, phone, email, select'],
  ['.prolu-form__campo--obrigatorio', 'Campo obrigatório'],
  ['.prolu-form__campo--erro', 'Campo com erro de validação'],
  ['.prolu-form__label', 'Rótulo (a pergunta)'],
  ['.prolu-form__asterisco', 'O * dos obrigatórios'],
  ['.prolu-form__input', 'Caixa de resposta (input, textarea e select)'],
  ['.prolu-form__erro', 'Mensagem de erro do campo'],
  ['.prolu-form__erro-geral', 'Erro do envio, acima do botão'],
  ['.prolu-form__enviar', 'Botão Enviar'],
  ['.prolu-form__legenda', '"* campos obrigatórios"'],
  ['.prolu-form__mensagem', 'Mensagem final; --sucesso ou --indisponivel'],
  ['.prolu-form__texto', 'Texto da mensagem final'],
  ['.prolu-form__obrigado-botao', 'Botão opcional da mensagem final (link)'],
]

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export default function IncorporarFormulario({ form, campos, onFechar }) {
  const toast = useToast()
  const [modo, setModo] = useState('iframe')
  const origem = window.location.origin

  const codigo = modo === 'iframe'
    ? `<iframe src="${origem}/f/${form.slug}?embed=1" data-prolu-form title="${attr(form.nome)}" loading="lazy" style="width:100%;height:720px;border:0"></iframe>\n<script src="${origem}/embed.js" async></script>`
    : `<div data-prolu-form="${form.slug}" data-api="${API}"></div>\n<script src="${origem}/embed.js" async></script>`

  const exemplo = `.prolu-form__input { padding: 10px; border: 1px solid #ccc; border-radius: 6px; }\n.prolu-form__enviar { background: #1d3557; color: #fff; border: 0; padding: 12px 24px; }`

  async function copiar(texto, msg) {
    try {
      await navigator.clipboard.writeText(texto)
      toast(msg)
    } catch {
      toast('Não foi possível copiar — selecione e copie manualmente')
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="modal fm-embed" role="dialog" aria-modal="true" aria-labelledby="fm-embed-titulo">
        <div className="modal-title" id="fm-embed-titulo">Incorporar no site</div>

        <div className="fm-embed-modos" role="radiogroup" aria-label="Modo de incorporação">
          {MODOS.map(m => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={modo === m.value}
              className={`fm-embed-modo${modo === m.value ? ' on' : ''}`}
              onClick={() => setModo(m.value)}
            >
              <span className="fm-embed-modo-titulo">{m.titulo}</span>
              <span className="fm-embed-modo-texto">{m.texto}</span>
            </button>
          ))}
        </div>

        {!form.ativo && <p className="fm-publico-aviso">Formulário inativo: no site vai aparecer "Formulário indisponível" até você ativá-lo.</p>}

        <div className="fm-embed-bloco">
          <div className="fm-embed-bloco-head">
            <span className="fm-publico-label">Código</span>
            <button type="button" className="fm-embed-copiar" onClick={() => copiar(codigo, 'Código copiado')}>
              <IconCopy /> Copiar
            </button>
          </div>
          <textarea className="fm-embed-codigo" readOnly rows={modo === 'iframe' ? 4 : 3} value={codigo} onFocus={e => e.target.select()} aria-label="Código para colar no site" />
          <p className="fm-publico-dica">
            Cole no HTML da página, onde o formulário deve aparecer.
            {modo === 'iframe'
              ? ' A altura se ajusta sozinha ao conteúdo.'
              : ' Para tirar até o estilo mínimo (espaçamento e cor dos erros), adicione data-estilo-base="nao" no <div>.'}
          </p>
        </div>

        {modo === 'iframe' && (
          <p className="fm-publico-dica fm-embed-nota">
            Cores, bordas, altura dos campos e posição do botão: painel <b>Estilo</b> do formulário.
            O que acontece depois do envio (mensagem ou redirecionamento): painel <b>Depois do envio</b>.
          </p>
        )}

        {modo === 'cru' && (
          <div className="fm-embed-bloco">
            <span className="fm-publico-label">Classes para estilizar</span>
            <p className="fm-publico-dica">
              Escreva o CSS no próprio site. Os nomes são fixos e não mudam. O painel Estilo do formulário não vale neste modo;
              o painel Depois do envio (mensagem ou redirecionamento) vale.
            </p>
            <table className="fm-embed-classes">
              <tbody>
                {CLASSES.map(([c, d]) => (
                  <tr key={c}><td><code>{c}</code></td><td>{d}</td></tr>
                ))}
              </tbody>
            </table>
            <pre className="fm-embed-exemplo">{exemplo}</pre>
          </div>
        )}

        {modo === 'cru' && campos.length > 0 && (
          <div className="fm-embed-bloco">
            <span className="fm-publico-label">Campo a campo</span>
            <p className="fm-publico-dica">Cada campo tem um seletor próprio, que não muda ao editar a pergunta ou reordenar.</p>
            <table className="fm-embed-classes">
              <tbody>
                {campos.map(c => {
                  const sel = `.prolu-form__campo[data-campo="${c.id}"]`
                  return (
                    <tr key={c.id}>
                      <td className="fm-embed-campo">{c.label || 'Pergunta'}</td>
                      <td>
                        <button type="button" className="fm-embed-seletor" onClick={() => copiar(sel, 'Seletor copiado')} title="Copiar seletor">
                          <code>{sel}</code>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-confirm" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
