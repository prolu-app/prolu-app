// Área "Conteúdo" do editor da Minha Página v2: perfil (nome, subtítulo, bio)
// e a lista de itens, na ordem manual (arrastar ou setas). Foto e capa ficam
// em Aparência > Cabeçalho.

import { useState } from 'react'
import { Linha } from '../FormularioAparencia.jsx'
import { IconPlus } from '../../components/Icons.jsx'
import { LIMITES } from '../../utils/pagina/modelo.js'
import { TIPOS_ITEM } from '../../utils/pagina/itens.js'
import ItemEditor from './ItemEditor.jsx'

export default function AreaConteudo({ doc, docNormal, alterar, alterarDoc, empresa, empresaId, formularios, off, toast }) {
  const itens = Array.isArray(doc.itens) ? doc.itens : []
  const [foco, setFoco] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null) // { id, pos: 'before' | 'after' }

  const mudarItens = fn => alterarDoc(d => ({ ...d, itens: fn(Array.isArray(d.itens) ? d.itens : []) }))
  const mudarItem = (id, fn) => mudarItens(arr => arr.map(it => (it.id === id ? fn(it) : it)))
  const remover = id => mudarItens(arr => arr.filter(it => it.id !== id))

  function adicionar(tipo) {
    if (itens.length >= LIMITES.itens) { toast(`Máximo de ${LIMITES.itens} itens`); return }
    const form = tipo === 'formulario' ? (formularios.find(f => f.ativo) || formularios[0]) : null
    const novo = TIPOS_ITEM[tipo].criar(form)
    mudarItens(arr => [...arr, novo])
    setFoco(novo.id)
  }

  function mover(deId, paraId, pos) {
    mudarItens(arr => {
      const nova = [...arr]
      const de = nova.findIndex(it => it.id === deId)
      if (de < 0) return arr
      const [item] = nova.splice(de, 1)
      let para = nova.findIndex(it => it.id === paraId)
      if (para < 0) return arr
      if (pos === 'after') para += 1
      nova.splice(para, 0, item)
      return nova
    })
  }
  function moverUm(id, delta) {
    const i = itens.findIndex(it => it.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= itens.length) return
    mover(id, itens[j].id, delta > 0 ? 'after' : 'before')
  }

  return (
    <>
      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-perfil">
        <h2 className="mpe-titulo" id="mpe-perfil">Perfil</h2>
        <Linha rotulo="Nome" dica="Vazio = nome do escritório.">
          <input
            className="fm-pos-input" value={doc.perfil?.nome ?? ''} disabled={off} maxLength={LIMITES.nome}
            placeholder={empresa.nome} aria-label="Nome exibido na página" onChange={e => alterar(['perfil', 'nome'], e.target.value)}
          />
        </Linha>
        <Linha rotulo="Subtítulo" dica={`Opcional, entre o nome e a bio. ${(doc.perfil?.subtitulo ?? '').length}/${LIMITES.subtitulo}`}>
          <input
            className="fm-pos-input" value={doc.perfil?.subtitulo ?? ''} disabled={off} maxLength={LIMITES.subtitulo}
            placeholder="Ex.: Arquitetura de interiores" aria-label="Subtítulo" onChange={e => alterar(['perfil', 'subtitulo'], e.target.value)}
          />
        </Linha>
        <Linha rotulo="Bio" dica={`${(doc.perfil?.bio ?? '').length}/${LIMITES.bio}`}>
          <textarea
            className="fm-pos-input" rows={3} value={doc.perfil?.bio ?? ''} disabled={off} maxLength={LIMITES.bio}
            placeholder="Ex.: Transformamos espaços em experiências" aria-label="Bio" onChange={e => alterar(['perfil', 'bio'], e.target.value)}
          />
        </Linha>
      </section>

      <section className="mpe-bloco" aria-labelledby="mpe-itens">
        <h2 className="mpe-titulo" id="mpe-itens">Itens <span className="fm-count">{itens.length}</span></h2>
        {itens.length === 0 && <p className="fm-empty mp-links-vazio">Nenhum item ainda. Adicione o primeiro abaixo.</p>}
        <div className="mp-links-lista">
          {itens.map((it, i) => (
            <ItemEditor
              key={it.id} item={it} indice={i} total={itens.length} formularios={formularios} off={off} empresaId={empresaId}
              botaoPagina={docNormal.aparencia.botao} focar={foco === it.id} onFocado={() => setFoco(null)}
              onMudar={fn => mudarItem(it.id, fn)} onRemover={() => remover(it.id)} onMover={d => moverUm(it.id, d)}
              arrastando={arrastando === it.id}
              sobre={sobre?.id === it.id ? sobre.pos : null}
              onDragStart={e => { setArrastando(it.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={e => {
                if (!arrastando || arrastando === it.id) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setSobre({ id: it.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
              }}
              onDrop={e => { e.preventDefault(); if (arrastando && sobre) mover(arrastando, sobre.id, sobre.pos); setArrastando(null); setSobre(null) }}
              onDragEnd={() => { setArrastando(null); setSobre(null) }}
            />
          ))}
        </div>
        {!off && (
          <div className="mp-links-add">
            <button type="button" className="btn-primary" onClick={() => adicionar('link')}><IconPlus /> Link</button>
            <button type="button" className="fm-embed-btn" onClick={() => adicionar('formulario')} disabled={!formularios.length}
              title={formularios.length ? undefined : 'Crie um formulário primeiro'}>
              <IconPlus /> Formulário
            </button>
            <button type="button" className="fm-embed-btn" onClick={() => adicionar('secao')}><IconPlus /> Título de seção</button>
          </div>
        )}
      </section>
    </>
  )
}
