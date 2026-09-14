import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import './RichEditor.css'

export default function RichEditor({ content, onChange, editable = true }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => { onChange?.(editor.getHTML()) },
  })

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

  if (!editor) return null

  function setLink() {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL do link', previousUrl || 'https://')
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className="rich-editor">
      {editable && (
        <div className="rich-editor-toolbar">
          <button type="button" className={`rich-editor-btn${editor.isActive('bold') ? ' active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito"><strong>B</strong></button>
          <button type="button" className={`rich-editor-btn${editor.isActive('italic') ? ' active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico"><em>I</em></button>
          <button type="button" className={`rich-editor-btn${editor.isActive('link') ? ' active' : ''}`}
            onClick={setLink} title="Link">🔗</button>
          <button type="button" className={`rich-editor-btn${editor.isActive('bulletList') ? ' active' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">• Lista</button>
          <button type="button" className={`rich-editor-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">H2</button>
          <button type="button" className={`rich-editor-btn${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">H3</button>
        </div>
      )}
      <EditorContent editor={editor} className="rich-editor-content" />
    </div>
  )
}
