import PhoneInput from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import ptBR from 'react-phone-number-input/locale/pt-BR'
import 'react-phone-number-input/style.css'

// Telefone da página pública /f/:slug (Fase 4): país padrão Brasil, seletor
// com bandeira, máscara enquanto digita e valor em E.164 (+5511998765432).
// Bandeiras embutidas no bundle (sem buscar imagens em CDN externa). O
// wrapper é um .prolu-form__input — fundo, contorno, cantos e foco vêm das
// variáveis do estilo (FormularioPublico.css, .prolu-form__telefone).
// O embed cru continua com <input type="tel"> (sem React; estilo do site).

export default function FormTelefoneField({ id, valor, onChange, invalido, describedBy, obrigatorio, inputRef }) {
  return (
    <PhoneInput
      id={id}
      ref={inputRef}
      className={`prolu-form__input prolu-form__telefone${invalido ? ' prolu-form__telefone--erro' : ''}`}
      defaultCountry="BR"
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
