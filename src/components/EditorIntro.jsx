import { useEffect, useRef } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { introParaHtml, introVazia } from '../utils/introHtml.js'
import './RichEditor.css'

// Editor rico da introdução do formulário (aba Geral). Barra só com o que a
// página pública sabe mostrar (lista em utils/introHtml.js). Grava ao sair do
// editor — mesmo padrão dos outros campos (trocar de aba também grava).

const ALINHAR = [
  { valor: 'left', titulo: 'Alinhar à esquerda', icone: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  { valor: 'center', titulo: 'Centralizar', icone: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { valor: 'right', titulo: 'Alinhar à direita', icone: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
]

// onMouseDown evita tirar o foco do editor (senão salvaria a cada clique na barra)
function Btn({ on, titulo, onClick, children }) {
  return (
    <button type="button" className={`rich-editor-btn${on ? ' active' : ''}`} title={titulo} aria-label={titulo} aria-pressed={on}
      onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
  )
}

export default function EditorIntro({ valor, onSalvar, disabled, placeholder }) {
  const salvo = useRef(valor || '')
  const onSalvarRef = useRef(onSalvar)
  onSalvarRef.current = onSalvar

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        link: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: introParaHtml(valor),
    editable: !disabled,
    editorProps: { attributes: { 'aria-label': 'Texto de introdução', 'data-placeholder': placeholder || '' } },
    onBlur: ({ editor }) => {
      // parágrafos vazios no fim virariam linhas em branco na página
      const html = introVazia(editor.getHTML()) ? '' : editor.getHTML().replace(/(<p[^>]*><\/p>)+$/, '')
      if (html === salvo.current) return
      salvo.current = html
      onSalvarRef.current(html)
    },
  })

  // valor mudou fora do editor (ex.: recarregou o formulário)
  useEffect(() => {
    if (!editor || editor.isFocused || (valor || '') === salvo.current) return
    salvo.current = valor || ''
    editor.commands.setContent(introParaHtml(valor), { emitUpdate: false })
  }, [editor, valor])

  useEffect(() => { if (editor && editor.isEditable === !!disabled) editor.setEditable(!disabled) }, [editor, disabled])

  // estado da barra (ativo/inativo) acompanhando a seleção
  const ativo = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed ? {
      bold: ed.isActive('bold'), italic: ed.isActive('italic'), underline: ed.isActive('underline'),
      h1: ed.isActive('heading', { level: 1 }), h2: ed.isActive('heading', { level: 2 }),
      bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'),
      vazio: ed.isEmpty,
      align: ['center', 'right'].find(a => ed.isActive({ textAlign: a })) || 'left',
    } : null,
  })

  if (!editor || !ativo) return null
  const cmd = () => editor.chain().focus()
  const bloco = ativo.h1 ? 'h1' : ativo.h2 ? 'h2' : 'p'
  function mudarBloco(v) {
    if (v === 'p') cmd().setParagraph().run()
    else cmd().setHeading({ level: v === 'h1' ? 1 : 2 }).run()
  }

  return (
    <div className={`rich-editor fm-intro-editor${disabled ? ' off' : ''}`}>
      {!disabled && (
        <div className="rich-editor-toolbar" role="toolbar" aria-label="Formatação da introdução">
          <select className="fm-intro-bloco" value={bloco} onChange={e => mudarBloco(e.target.value)} aria-label="Tamanho do texto">
            <option value="p">Parágrafo</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
          </select>
          <span className="fm-intro-sep" />
          <Btn on={ativo.bold} titulo="Negrito" onClick={() => cmd().toggleBold().run()}><strong>B</strong></Btn>
          <Btn on={ativo.italic} titulo="Itálico" onClick={() => cmd().toggleItalic().run()}><em>I</em></Btn>
          <Btn on={ativo.underline} titulo="Sublinhado" onClick={() => cmd().toggleUnderline().run()}><u>U</u></Btn>
          <span className="fm-intro-sep" />
          {ALINHAR.map(a => (
            <Btn key={a.valor} on={ativo.align === a.valor} titulo={a.titulo} onClick={() => cmd().setTextAlign(a.valor).run()}>
              <svg viewBox="0 0 24 24" className="fm-intro-ico"><path d={a.icone} /></svg>
            </Btn>
          ))}
          <span className="fm-intro-sep" />
          <Btn on={ativo.bullet} titulo="Lista com marcadores" onClick={() => cmd().toggleBulletList().run()}>• Lista</Btn>
          <Btn on={ativo.ordered} titulo="Lista numerada" onClick={() => cmd().toggleOrderedList().run()}>1. Lista</Btn>
        </div>
      )}
      <EditorContent editor={editor} className={`rich-editor-content${ativo.vazio ? ' vazio' : ''}`} />
    </div>
  )
}
