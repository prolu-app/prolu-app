import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import ptBR from 'react-phone-number-input/locale/pt-BR'
import 'react-phone-number-input/style.css'

// Telefone da página pública /f/:slug (Fase 4): país padrão Brasil, seletor
// com bandeira + DDI (+55, +1…), máscara enquanto digita e valor em E.164
// (+5511998765432). Bandeiras embutidas no bundle (sem buscar imagens em CDN
// externa). O wrapper é um .prolu-form__input — fundo, contorno, cantos e
// foco vêm das variáveis do estilo (FormularioPublico.css, .prolu-form__telefone).
// O embed cru continua com <input type="tel"> (sem React; estilo do site).

// Seletor de país: mesma estrutura do da biblioteca (<select> invisível por
// cima, bandeira e seta por baixo — ver CountrySelectWithIcon) com o DDI do
// país escolhido em texto, alinhado à direita.
function SeletorPais({
  value, options, onChange, iconComponent: Bandeira, disabled, readOnly, className,
  getIconAspectRatio, arrowComponent, unicodeFlags, // eslint-disable-line no-unused-vars -- props da lib que não vão para o <select>
  ...resto
}) {
  const escolhida = options.find(o => !o.divider && (o.value ?? null) === (value ?? null))
  return (
    <div className="PhoneInputCountry prolu-form__pais">
      <select
        {...resto}
        className={`PhoneInputCountrySelect${className ? ` ${className}` : ''}`}
        disabled={disabled || readOnly}
        value={value || 'ZZ'} // "ZZ" = internacional (sem país)
        onChange={e => onChange(e.target.value === 'ZZ' ? undefined : e.target.value)}
      >
        {options.map(({ value: v, label, divider }) => (
          <option key={divider ? '|' : v || 'ZZ'} value={divider ? '|' : v || 'ZZ'} disabled={!!divider}>
            {divider ? '──────────' : label}
          </option>
        ))}
      </select>
      {escolhida && value && <Bandeira aria-hidden country={value} label={escolhida.label} />}
      <span className="prolu-form__ddi" aria-hidden="true">{value ? `+${getCountryCallingCode(value)}` : '+'}</span>
      <div className="PhoneInputCountrySelectArrow" />
    </div>
  )
}

export default function FormTelefoneField({ id, valor, onChange, invalido, describedBy, obrigatorio, inputRef }) {
  return (
    <PhoneInput
      id={id}
      ref={inputRef}
      className={`prolu-form__input prolu-form__telefone${invalido ? ' prolu-form__telefone--erro' : ''}`}
      defaultCountry="BR"
      countryCallingCodeEditable={false}
      countrySelectComponent={SeletorPais}
      flags={flags}
      labels={ptBR}
      countryOptionsOrder={['BR', '|', '...']}
      value={valor || undefined}
      onChange={v => onChange(v || '')}
      aria-invalid={invalido}
      aria-describedby={describedBy}
      required={obrigatorio}
      autoComplete="tel"
      countrySelectProps={{ 'aria-label': 'País do telefone' }}
    />
  )
}
