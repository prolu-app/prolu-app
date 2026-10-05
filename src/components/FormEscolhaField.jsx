// Escolha única (radio) e múltipla escolha (checkbox) da página pública
// (migration_039), com a opção "Outro:" opcional: marcada, libera um campo de
// texto ao lado; a resposta vira "Outro: <texto>" (ou "Outro:" em branco — não
// bloqueia o envio). Radio guarda texto; checkbox, lista de textos.
// Visual pelas variáveis do estilo (.prolu-form__escolha em FormularioPublico.css).

const PREFIXO = 'Outro:'
const ehOutro = v => typeof v === 'string' && /^Outro:( |$)/.test(v)
const textoDoOutro = v => (ehOutro(v) ? v.slice(PREFIXO.length).replace(/^ /, '') : '')
const montarOutro = texto => (texto ? `${PREFIXO} ${texto}` : PREFIXO)

export default function FormEscolhaField({ id, tipo, opcoes, outro, valor, onChange, rotuloId, invalido, describedBy, primeiroRef }) {
  const multipla = tipo === 'checkbox'
  const lista = multipla ? (Array.isArray(valor) ? valor : []) : (valor ? [valor] : [])
  const respostaOutro = lista.find(ehOutro)
  const outroMarcado = respostaOutro !== undefined

  function alternar(opcao) {
    if (!multipla) { onChange(opcao); return }
    onChange(lista.includes(opcao) ? lista.filter(x => x !== opcao) : [...lista, opcao])
  }
  function alternarOutro() {
    if (!multipla) { onChange(outroMarcado ? valor : montarOutro('')); return }
    onChange(outroMarcado ? lista.filter(x => !ehOutro(x)) : [...lista, montarOutro('')])
  }
  function digitarOutro(texto) {
    const novo = montarOutro(texto)
    if (!multipla) { onChange(novo); return }
    onChange(lista.map(x => (ehOutro(x) ? novo : x)))
  }

  const tipoInput = multipla ? 'checkbox' : 'radio'
  return (
    <div
      className={`prolu-form__escolhas prolu-form__escolhas--${tipo}`}
      role={multipla ? 'group' : 'radiogroup'}
      aria-labelledby={rotuloId}
      aria-invalid={invalido || undefined}
      aria-describedby={describedBy}
    >
      {opcoes.map((o, i) => (
        <label className="prolu-form__escolha" key={o}>
          <input
            ref={i === 0 ? primeiroRef : undefined}
            type={tipoInput} name={id} value={o}
            checked={lista.includes(o)}
            onChange={() => alternar(o)}
          />
          <span>{o}</span>
        </label>
      ))}
      {outro && (
        <div className="prolu-form__escolha prolu-form__escolha--outro">
          <label>
            <input
              ref={opcoes.length === 0 ? primeiroRef : undefined}
              type={tipoInput} name={id} value="__outro__"
              checked={outroMarcado}
              onChange={alternarOutro}
            />
            <span>{PREFIXO}</span>
          </label>
          <input
            className="prolu-form__outro-texto"
            type="text"
            maxLength={300}
            disabled={!outroMarcado}
            value={textoDoOutro(respostaOutro)}
            onChange={e => digitarOutro(e.target.value)}
            aria-label="Outro: especifique"
          />
        </div>
      )}
    </div>
  )
}
