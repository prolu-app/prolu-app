import { useEffect, useRef, useState } from 'react'

// Campo de seleção da página pública /f/:slug (no lugar do <select> nativo,
// que ignora o estilo do formulário). Usa as variáveis --pf-* do estilo.
//
// Três apresentações:
//   lista  — computador: lista suspensa abaixo do campo
//   folha  — celular (toque ou < 640px): folha que sobe de baixo
//   inline — dentro do iframe (embed): a lista abre no fluxo da página e o
//            iframe cresce junto (fixed/absolute ficariam fora da tela ou cortados)
//
// Acessibilidade: padrão combobox "só seleção" — botão role=combobox com
// aria-activedescendant; setas, Home/End, Enter/Espaço, Esc, Tab e digitar a
// inicial da opção.

const CHECK = 'M5 13l4 4L19 7'
const SETA = 'M6 9l6 6 6-6'

export default function FormSelectField({
  id, valor, opcoes, onChange, obrigatorio, rotulo, inline, invalido, describedBy, botaoRef,
}) {
  // sem obrigatoriedade dá para voltar a "nenhuma" (como o "Selecione…" do nativo)
  const itens = obrigatorio ? opcoes : ['', ...opcoes]
  const [aberto, setAberto] = useState(false)
  const [modo, setModo] = useState('lista')
  const [ativo, setAtivo] = useState(-1)
  const raiz = useRef(null)
  const botao = useRef(null)
  const lista = useRef(null)
  const busca = useRef({ texto: '', ate: 0 })
  const listaId = `${id}-opcoes`
  const selecionado = itens.indexOf(valor || '')
  const opId = i => `${id}-op-${i}`

  function abrir(indice) {
    const folha = !inline && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 640)
    setModo(inline ? 'inline' : folha ? 'folha' : 'lista')
    setAtivo(indice ?? (selecionado >= 0 ? selecionado : 0))
    setAberto(true)
  }
  function fechar(focar = true) {
    setAberto(false)
    if (focar) botao.current?.focus()
  }
  function escolher(i) {
    if (i < 0 || i >= itens.length) return
    onChange(itens[i])
    fechar()
  }

  // digitar letras: vai para a próxima opção que começa com o texto digitado
  function digitar(tecla) {
    const agora = Date.now()
    busca.current.texto = (agora < busca.current.ate ? busca.current.texto : '') + tecla.toLowerCase()
    busca.current.ate = agora + 700
    const base = aberto ? ativo : selecionado
    // uma letra: procura a partir da próxima (repetir a letra alterna); várias: a partir da atual
    const inicio = busca.current.texto.length > 1 ? Math.max(base, 0) : base + 1
    for (let k = 0; k < itens.length; k++) {
      const i = (inicio + k) % itens.length
      if (itens[i] && itens[i].toLowerCase().startsWith(busca.current.texto)) {
        if (aberto) setAtivo(i)
        else onChange(itens[i]) // como no nativo: escolhe sem abrir
        return
      }
    }
  }

  function teclado(e) {
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir() }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) digitar(e.key)
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setAtivo(i => Math.min(itens.length - 1, i + 1)); break
      case 'ArrowUp': e.preventDefault(); setAtivo(i => Math.max(0, i - 1)); break
      case 'Home': e.preventDefault(); setAtivo(0); break
      case 'End': e.preventDefault(); setAtivo(itens.length - 1); break
      case 'Enter': case ' ': e.preventDefault(); escolher(ativo); break
      case 'Escape': e.preventDefault(); fechar(); break
      case 'Tab': setAberto(false); break
      default: if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) digitar(e.key)
    }
  }

  // clicar fora fecha (lista e inline; a folha fecha pelo fundo escuro)
  useEffect(() => {
    if (!aberto || modo === 'folha') return
    const fora = e => { if (!raiz.current?.contains(e.target)) setAberto(false) }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto, modo])

  // opção ativa sempre visível na rolagem da lista
  useEffect(() => {
    if (aberto) lista.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativo])

  // folha: foco na lista e página de fundo sem rolar
  useEffect(() => {
    if (!aberto || modo !== 'folha') return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    lista.current?.focus()
    return () => { document.body.style.overflow = antes }
  }, [aberto, modo])

  const opcoesLista = itens.map((o, i) => (
    <li
      key={o || '__vazio'} id={opId(i)} data-i={i} role="option" aria-selected={i === selecionado}
      className={`prolu-form__opcao${i === ativo ? ' prolu-form__opcao--ativa' : ''}${i === selecionado ? ' prolu-form__opcao--selecionada' : ''}${o ? '' : ' prolu-form__opcao--vazia'}`}
      onMouseDown={e => e.preventDefault()} // mantém o foco no campo
      onMouseMove={() => { if (ativo !== i) setAtivo(i) }}
      onClick={() => escolher(i)}
    >
      <span>{o || 'Nenhuma'}</span>
      {i === selecionado && <svg viewBox="0 0 24 24" aria-hidden="true"><path d={CHECK} /></svg>}
    </li>
  ))

  return (
    <div ref={raiz} className={`prolu-form__select${aberto ? ' prolu-form__select--aberto' : ''}`}>
      <button
        type="button" id={id} role="combobox" aria-haspopup="listbox" aria-expanded={aberto} aria-controls={listaId}
        aria-activedescendant={aberto && modo !== 'folha' && ativo >= 0 ? opId(ativo) : undefined}
        aria-required={obrigatorio || undefined} aria-invalid={invalido} aria-describedby={describedBy}
        ref={el => { botao.current = el; botaoRef?.(el) }}
        className="prolu-form__input prolu-form__select-botao"
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={teclado}
      >
        <span className={`prolu-form__select-valor${valor ? '' : ' prolu-form__select-valor--vazio'}`}>{valor || 'Selecione…'}</span>
        <svg className="prolu-form__select-seta" viewBox="0 0 24 24" aria-hidden="true"><path d={SETA} /></svg>
      </button>

      {aberto && modo !== 'folha' && (
        <ul ref={lista} id={listaId} role="listbox" aria-label={rotulo}
          className={`prolu-form__opcoes${modo === 'inline' ? ' prolu-form__opcoes--inline' : ''}`}>
          {opcoesLista}
        </ul>
      )}

      {aberto && modo === 'folha' && (
        <div className="prolu-form__folha-fundo" onClick={() => fechar()}>
          <div className="prolu-form__folha" role="dialog" aria-modal="true" aria-label={rotulo} onClick={e => e.stopPropagation()}>
            <div className="prolu-form__folha-titulo">{rotulo}</div>
            <ul ref={lista} id={listaId} role="listbox" aria-label={rotulo} tabIndex={-1}
              aria-activedescendant={ativo >= 0 ? opId(ativo) : undefined}
              className="prolu-form__opcoes prolu-form__opcoes--folha" onKeyDown={teclado}>
              {opcoesLista}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
