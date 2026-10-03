import { useEffect, useMemo, useRef, useState } from 'react'
import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import ptBR from 'react-phone-number-input/locale/pt-BR'
import 'react-phone-number-input/style.css'

// Telefone da página pública /e/:escritorio/:formulario (Fase 4): país padrão Brasil, máscara
// enquanto digita e valor em E.164 (+5511998765432). Bandeiras embutidas no
// bundle (sem CDN externa). O wrapper é um .prolu-form__input — fundo,
// contorno, cantos e foco vêm das variáveis do estilo (FormularioPublico.css).
// O embed cru continua com <input type="tel"> (sem React; estilo do site).
//
// getCountryCallingCode vem do react-phone-number-input, que o reexporta do
// libphonenumber-js (dependência dela, não do app — importar direto quebraria
// se a lib mudasse).

const ddi = pais => (pais ? `+${getCountryCallingCode(pais)}` : '+')
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Seletor de país próprio (no lugar do <select> nativo, que só lista nomes):
// fechado mostra bandeira + DDI; aberto, uma lista com bandeira, nome e DDI à
// direita, com busca por nome ou código. Teclado: setas, Enter, Esc, Tab.
// inline (embed/iframe): a lista flutua sobre a página, mas o campo ganha um
// espaço embaixo do tamanho dela enquanto aberta — a página cresce e o iframe
// acompanha (sem isso a lista seria cortada pela altura do iframe).
function SeletorPais({ value, onChange, options, iconComponent: Bandeira, disabled, readOnly, inline, 'aria-label': rotulo }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const raiz = useRef(null)
  const lista = useRef(null)
  const campoBusca = useRef(null)
  const botao = useRef(null)
  const caixa = useRef(null)
  const listaId = useRef(`prolu-paises-${Math.random().toString(36).slice(2, 8)}`).current

  const paises = useMemo(() => options.filter(o => !o.divider), [options])
  const filtrados = useMemo(() => {
    const t = semAcento(busca.trim()).replace(/^\+/, '')
    if (!t) return paises
    return paises.filter(o => semAcento(o.label).includes(t) || (o.value && getCountryCallingCode(o.value).startsWith(t)))
  }, [paises, busca])
  const atual = paises.find(o => (o.value ?? null) === (value ?? null))

  function abrir() {
    if (disabled || readOnly) return
    setBusca('')
    setAtivo(Math.max(0, paises.findIndex(o => (o.value ?? null) === (value ?? null))))
    setAberto(true)
  }
  function fechar(focar = true) {
    setAberto(false)
    if (focar) botao.current?.focus()
  }
  function escolher(o) {
    if (!o) return
    onChange(o.value)
    fechar()
  }

  // clicar fora fecha
  useEffect(() => {
    if (!aberto) return
    const fora = e => { if (!raiz.current?.contains(e.target)) setAberto(false) }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])
  // ao abrir: foco na busca
  useEffect(() => { if (aberto) campoBusca.current?.focus() }, [aberto])
  // a busca muda a lista: volta para o primeiro
  useEffect(() => { setAtivo(0) }, [busca])
  // embed: reserva o espaço da lista no campo enquanto ela está aberta
  useEffect(() => {
    if (!aberto || !inline) return
    const campo = raiz.current?.closest('.prolu-form__campo')
    const h = caixa.current?.getBoundingClientRect().height || 0
    if (!campo || !h) return
    const antes = campo.style.paddingBottom
    campo.style.paddingBottom = `${Math.ceil(h) + 8}px`
    return () => { campo.style.paddingBottom = antes }
  }, [aberto, inline])
  // item ativo sempre visível
  useEffect(() => {
    if (aberto) lista.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativo])

  function teclado(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(i => Math.min(filtrados.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(filtrados[ativo]) }
    else if (e.key === 'Escape') { e.preventDefault(); fechar() }
    else if (e.key === 'Tab') setAberto(false)
  }

  return (
    <div ref={raiz} className={`PhoneInputCountry prolu-form__pais${aberto ? ' prolu-form__pais--aberto' : ''}`}>
      <button
        ref={botao} type="button" className="prolu-form__pais-botao" disabled={disabled || readOnly}
        aria-haspopup="listbox" aria-expanded={aberto} aria-controls={listaId}
        aria-label={`${rotulo || 'País do telefone'}: ${atual?.label || 'Internacional'} ${ddi(value)}`}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={e => { if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); abrir() } }}
      >
        <span className="prolu-form__pais-bandeira">{value && <Bandeira country={value} label={atual?.label || value} />}</span>
        <span className="prolu-form__pais-ddi">{ddi(value)}</span>
        <svg className="prolu-form__pais-seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {aberto && (
        <div ref={caixa} className="prolu-form__paises">
          <input
            ref={campoBusca} className="prolu-form__paises-busca" type="search" value={busca}
            placeholder="Buscar país ou código" aria-label="Buscar país ou código"
            role="combobox" aria-expanded="true" aria-controls={listaId} aria-autocomplete="list"
            aria-activedescendant={filtrados[ativo] ? `${listaId}-${ativo}` : undefined}
            onChange={e => setBusca(e.target.value)} onKeyDown={teclado}
          />
          <ul ref={lista} id={listaId} role="listbox" aria-label="Países" className="prolu-form__paises-lista">
            {filtrados.length === 0 && <li className="prolu-form__paises-vazio">Nenhum país encontrado</li>}
            {filtrados.map((o, i) => {
              const escolhido = (o.value ?? null) === (value ?? null)
              return (
                <li
                  key={o.value || 'ZZ'} id={`${listaId}-${i}`} data-i={i} role="option" aria-selected={escolhido}
                  className={`prolu-form__paises-item${i === ativo ? ' ativo' : ''}${escolhido ? ' escolhido' : ''}`}
                  onMouseDown={e => e.preventDefault()} // mantém o foco na busca
                  onMouseMove={() => { if (ativo !== i) setAtivo(i) }}
                  onClick={() => escolher(o)}
                >
                  <span className="prolu-form__pais-bandeira">{o.value && <Bandeira country={o.value} label={o.label} />}</span>
                  <span className="prolu-form__paises-nome">{o.label}</span>
                  <span className="prolu-form__paises-ddi">{ddi(o.value)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function FormTelefoneField({ id, valor, onChange, invalido, describedBy, obrigatorio, inputRef, inline }) {
  return (
    <PhoneInput
      id={id}
      ref={inputRef}
      className={`prolu-form__input prolu-form__telefone${invalido ? ' prolu-form__telefone--erro' : ''}`}
      defaultCountry="BR"
      countryCallingCodeEditable={false}
      countrySelectComponent={SeletorPais}
      countrySelectProps={{ 'aria-label': 'País do telefone', inline }}
      flags={flags}
      labels={ptBR}
      countryOptionsOrder={['BR', '|', '...']}
      value={valor || undefined}
      onChange={v => onChange(v || '')}
      aria-invalid={invalido}
      aria-describedby={describedBy}
      required={obrigatorio}
      autoComplete="tel"
    />
  )
}
