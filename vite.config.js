import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O index.css sempre "venceu" as classes das telas em empate de especificidade
// (.modal, .btn-primary, .card…) porque era o último CSS do arquivo único. Com
// a divisão de código (App.jsx), o CSS de cada tela carrega depois dele e a
// ordem se inverteria. Este plugin mantém a regra de antes sem depender da
// ordem: só no index.css, cada seletor ganha "html " na frente (+1 elemento
// de especificidade). Ele continua vencendo empates de classe e continua
// perdendo para regras de tela mais específicas (ex.: .fm-x .btn-primary).
// Não mexe em :root, html, *, ::-webkit-scrollbar nem em @keyframes.
const indexPorUltimo = {
  postcssPlugin: 'prolu-index-css-por-ultimo',
  Once(root) {
    const arquivo = (root.source?.input?.file || '').replace(/\\/g, '/')
    if (!arquivo.endsWith('/src/index.css')) return
    root.walkRules(regra => {
      if (regra.parent?.type === 'atrule' && /keyframes$/i.test(regra.parent.name)) return
      regra.selectors = regra.selectors.map(s => {
        const t = s.trim()
        if (/^(html\b|:root\b|\*|::)/.test(t)) return t
        return `html ${t}`
      })
    })
  },
}

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [indexPorUltimo] } },
  server: {
    port: 5173,
  },
})
