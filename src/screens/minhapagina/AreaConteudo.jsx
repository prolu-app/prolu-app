// Área "Conteúdo" do editor da Minha Página v2: perfil (foto, nome,
// subtítulo, bio) e a lista de itens. O destaque (no máximo 1) fica fixo no
// topo da lista, com o selo "Destaque" e sem arrastar — como na página.

import { useState } from 'react'
import { Linha, Segmentos } from '../FormularioAparencia.jsx'
import { IconPlus } from '../../components/Icons.jsx'
import { comprimirFoto } from '../../utils/comprimirImagem.js'
import { LIMITES } from '../../utils/pagina/modelo.js'
import { TIPOS_ITEM } from '../../utils/pagina/itens.js'
import { UploadImagem } from './comum.jsx'
import ItemEditor from './ItemEditor.jsx'

const FORMATO_FOTO = [{ value: 'quadrado', label: 'Quadrado' }, { value: 'arredondado', label: 'Arredondado' }, { value: 'redondo', label: 'Redondo' }]
const ROTULO_CAPA = { nenhuma: 'Sem capa', banner: 'Banner', capa: 'Capa', hero: 'Hero' }

const ehDestaque = it => it.tipo !== 'secao' && it.estilo?.destaque === true

export default function AreaConteudo({ doc, docNormal, alterar, alterarDoc, empresa, empresaId, formularios, off, toast, irParaCapa }) {
  const perfil = docNormal.perfil
  const itens = Array.isArray(doc.itens) ? doc.itens : []
  const destaque = itens.find(ehDestaque) || null
  const lista = itens.filter(it => it !== destaque)
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

  // no máximo 1 destaque: marcar um desmarca o anterior
  function destacar(id, ligar) {
    const anterior = itens.find(it => ehDestaque(it) && it.id !== id)
    mudarItens(arr => arr.map(it => {
      if (it.id === id) return { ...it, estilo: { ...(it.estilo || {}), v: 1, destaque: ligar } }
      if (ligar && ehDestaque(it)) return { ...it, estilo: { ...it.estilo, destaque: false } }
      return it
    }))
    if (ligar && anterior) toast('Destaque movido para este item')
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
    const i = lista.findIndex(it => it.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= lista.length) return
    mover(id, lista[j].id, delta > 0 ? 'after' : 'before')
  }

  const props = (it, indice, total) => ({
    item: it, indice, total, formularios, off, empresaId, botaoPagina: docNormal.aparencia.botao,
    focar: foco === it.id, onFocado: () => setFoco(null),
    onMudar: fn => mudarItem(it.id, fn), onRemover: () => remover(it.id),
    onMover: d => moverUm(it.id, d), onDestacar: ligar => destacar(it.id, ligar),
  })

  return (
    <>
      <section className="fm-publico mpe-bloco" aria-labelledby="mpe-perfil">
        <h2 className="mpe-titulo" id="mpe-perfil">Perfil</h2>
        <Linha rotulo="Foto" dica="Logo ou foto. Até 10 MB — reduzida no envio.">
          <UploadImagem
            url={perfil.foto} rotulo="Foto de perfil" empresaId={empresaId} prefixo="foto" comprimir={comprimirFoto}
            redonda={perfil.foto_formato === 'redondo'} off={off} onMudar={v => alterar(['perfil', 'foto'], v)}
          />
        </Linha>
        <Linha rotulo="Formato da foto">
          <Segmentos rotulo="Formato da foto de perfil" valor={perfil.foto_formato} opcoes={FORMATO_FOTO} disabled={off} onChange={v => alterar(['perfil', 'foto_formato'], v)} />
        </Linha>
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
        <Linha rotulo="Capa">
          <span className="fm-status-texto">{ROTULO_CAPA[docNormal.capa.estilo]}</span>
          <button type="button" className="fm-link-btn" onClick={irParaCapa}>Ajustar em Aparência</button>
        </Linha>
      </section>

      <section className="mpe-bloco" aria-labelledby="mpe-itens">
        <h2 className="mpe-titulo" id="mpe-itens">Itens <span className="fm-count">{itens.length}</span></h2>
        {itens.length === 0 && <p className="fm-empty mp-links-vazio">Nenhum item ainda. Adicione o primeiro abaixo.</p>}
        <div className="mp-links-lista">
          {destaque && <ItemEditor key={destaque.id} {...props(destaque, 0, 1)} ehDestaque />}
          {lista.map((it, i) => (
            <ItemEditor
              key={it.id} {...props(it, i, lista.length)} ehDestaque={false}
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
