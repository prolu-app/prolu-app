// Aba "Fundo" da Minha Página: Cor | Padrões | Texturas | Luz Natural.
// Escolher uma miniatura define fundo_tipo; a cor de fundo vale para todos
// (padrões e imagens ficam por cima dela). Miniatura de textura/luz cujo
// arquivo ainda não existe mostra só o nome, sobre um cinza.

import { useState } from 'react'
import { Cor, Linha } from '../../screens/FormularioAparencia.jsx'
import { CATEGORIAS_PATTERN, patternsDaCategoria } from '../../utils/pagePatterns.js'
import { OPACIDADE, SOMBRAS, TEXTURAS, urlSombra, urlTextura } from '../../utils/paginaConfig.js'

const ABAS = [
  { id: 'cor', label: 'Cor' },
  { id: 'pattern', label: 'Padrões' },
  { id: 'textura', label: 'Texturas' },
  { id: 'sombra', label: 'Luz Natural' },
]

function Miniatura({ rotulo, selecionada, onClick, disabled, style, children }) {
  return (
    <button
      type="button" role="radio" aria-checked={selecionada} aria-label={rotulo} title={rotulo}
      className={`mp-mini${selecionada ? ' on' : ''}`} onClick={onClick} disabled={disabled}
    >
      <span className="mp-mini-img" style={style}>{children}</span>
      <span className="mp-mini-nome">{rotulo}</span>
    </button>
  )
}

function Opacidade({ valor, onChange, disabled, rotulo }) {
  const [min, max] = OPACIDADE
  return (
    <div className="fm-raio">
      <input
        type="range" min={min * 100} max={max * 100} step={1} value={Math.round(valor * 100)}
        disabled={disabled} aria-label={rotulo} onChange={e => onChange(Number(e.target.value) / 100)}
      />
      <span>{Math.round(valor * 100)}%</span>
    </div>
  )
}

function GradeImagens({ itens, tipo, urlDe, config, mudar, off }) {
  return (
    <div className="mp-minis" role="radiogroup" aria-label={tipo === 'textura' ? 'Texturas' : 'Luz natural'}>
      {itens.map(t => (
        <Miniatura
          key={t.id} rotulo={t.label} disabled={off}
          selecionada={config.fundo_tipo === tipo && config.fundo_imagem === t.id}
          onClick={() => mudar({ fundo_tipo: tipo, fundo_imagem: t.id })}
          style={{ backgroundImage: `url("${urlDe(t.id)}")` }}
        />
      ))}
    </div>
  )
}

export default function FundoSelector({ config, mudar, off }) {
  const [aba, setAba] = useState(config.fundo_tipo)

  const corDeFundo = (
    <Linha rotulo="Cor de fundo">
      <Cor rotulo="Cor de fundo da página" valor={config.fundo_cor} disabled={off} onChange={v => mudar({ fundo_cor: v })} />
    </Linha>
  )
  const opacidadeImagem = (
    <Linha rotulo="Intensidade">
      <Opacidade rotulo="Intensidade da imagem de fundo" valor={config.fundo_imagem_opacity} disabled={off} onChange={v => mudar({ fundo_imagem_opacity: v })} />
    </Linha>
  )

  return (
    <div className="mp-fundo">
      <div className="fm-seg mp-fundo-abas" role="tablist" aria-label="Tipo de fundo">
        {ABAS.map(a => (
          <button
            key={a.id} type="button" role="tab" aria-selected={aba === a.id}
            className={`fm-seg-opcao${aba === a.id ? ' on' : ''}`} onClick={() => setAba(a.id)}
          >{a.label}</button>
        ))}
      </div>

      {aba === 'cor' && (
        <>
          <div className="mp-minis" role="radiogroup" aria-label="Fundo liso">
            <Miniatura rotulo="Só a cor" selecionada={config.fundo_tipo === 'cor'} disabled={off}
              onClick={() => mudar({ fundo_tipo: 'cor' })} style={{ background: config.fundo_cor }} />
          </div>
          {corDeFundo}
        </>
      )}

      {aba === 'pattern' && (
        <>
          {CATEGORIAS_PATTERN.map(cat => (
            <div key={cat} className="mp-minis-grupo">
              <div className="mp-minis-titulo">{cat}</div>
              <div className="mp-minis" role="radiogroup" aria-label={`Padrões: ${cat}`}>
                {patternsDaCategoria(cat).map(p => (
                  <Miniatura
                    key={p.id} rotulo={p.label} disabled={off}
                    selecionada={config.fundo_tipo === 'pattern' && config.fundo_pattern === p.id}
                    onClick={() => mudar({ fundo_tipo: 'pattern', fundo_pattern: p.id })}
                    style={{ backgroundColor: '#ffffff', backgroundImage: p.fn('#555555', 0.15) }}
                  />
                ))}
              </div>
            </div>
          ))}
          {config.fundo_tipo === 'pattern' && (
            <>
              <Linha rotulo="Cor do padrão">
                <Cor rotulo="Cor do padrão" valor={config.fundo_pattern_cor} disabled={off} onChange={v => mudar({ fundo_pattern_cor: v })} />
              </Linha>
              <Linha rotulo="Intensidade">
                <Opacidade rotulo="Intensidade do padrão" valor={config.fundo_pattern_opacity} disabled={off} onChange={v => mudar({ fundo_pattern_opacity: v })} />
              </Linha>
              {corDeFundo}
            </>
          )}
        </>
      )}

      {aba === 'textura' && (
        <>
          <GradeImagens itens={TEXTURAS} tipo="textura" urlDe={urlTextura} config={config} mudar={mudar} off={off} />
          {config.fundo_tipo === 'textura' && <>{corDeFundo}{opacidadeImagem}</>}
        </>
      )}

      {aba === 'sombra' && (
        <>
          <GradeImagens itens={SOMBRAS} tipo="sombra" urlDe={urlSombra} config={config} mudar={mudar} off={off} />
          {config.fundo_tipo === 'sombra' && <>{corDeFundo}{opacidadeImagem}</>}
        </>
      )}
    </div>
  )
}
