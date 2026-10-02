/*
 * Prolu — incorporação de formulários em sites de escritórios.
 * Snippets gerados na tela "Incorporar" do formulário (IncorporarFormulario.jsx).
 *
 * Dois modos, mesmo formulário e mesma Edge Function `formulario-publico`:
 *
 *  1. Com estilo do Prolu — <iframe data-prolu-form src=".../f/:slug?embed=1">
 *     Este script ajusta a altura do iframe (mensagens prolu-form:altura da
 *     página), traz o formulário para a tela depois do envio e, se o
 *     formulário redireciona após o envio, troca a página do site pela URL.
 *
 *  2. Cru — <div data-prolu-form="slug" data-api="https://.../functions/v1/formulario-publico">
 *     Este script monta o formulário direto no DOM do site, com as mesmas
 *     classes prolu-form__* da página pública, e envia pela Edge Function.
 *     Estilo base mínimo com :where() (especificidade zero: qualquer CSS do
 *     site vence); data-estilo-base="nao" desliga até esse mínimo.
 *
 * Sem dependências, sem innerHTML com dados do formulário (só textContent).
 * Pode ser incluído mais de uma vez na página: roda uma vez só.
 */
(function () {
  'use strict'
  if (window.ProluForm) { window.ProluForm.montar(); return }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  // redirecionamento pós-envio (página de obrigado do escritório): só http(s)
  var URL_RE = /^https?:\/\/[^\s]+$/i
  var IMG_RE = /^https:\/\/[^\s]+$/i
  var YT_ID_RE = /^[A-Za-z0-9_-]{11}$/

  // apresentação (logo, capa, introdução, vídeo) — já validada pela função; revalida o formato
  function apresentacao(form) {
    var a = form.apresentacao && typeof form.apresentacao === 'object' ? form.apresentacao : {}
    return {
      logo: typeof a.logo === 'string' && IMG_RE.test(a.logo) ? a.logo : null,
      capa: typeof a.capa === 'string' && IMG_RE.test(a.capa) ? a.capa : null,
      intro: typeof a.intro === 'string' && a.intro.trim() ? a.intro : null,
      videoId: typeof a.video_id === 'string' && YT_ID_RE.test(a.video_id) ? a.video_id : null,
      videoAntes: a.video_posicao === 'antes'
    }
  }

  function video(id, titulo) {
    var box = el('div', 'prolu-form__video')
    var fr = document.createElement('iframe')
    fr.src = 'https://www.youtube.com/embed/' + id
    fr.title = 'Vídeo — ' + titulo
    fr.loading = 'lazy'
    fr.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share'
    fr.referrerPolicy = 'strict-origin-when-cross-origin'
    fr.allowFullscreen = true
    box.appendChild(fr)
    return box
  }

  function imagem(classe, src, alt) {
    var img = el('img', classe)
    img.src = src
    img.alt = alt || ''
    return img
  }

  // ── modo iframe: altura automática ──────────────────────────────────────
  function iframeDaMensagem(ev) {
    var frames = document.querySelectorAll('iframe[data-prolu-form]')
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow !== ev.source) continue
      try { if (new URL(frames[i].src, location.href).origin !== ev.origin) return null } catch (e) { return null }
      return frames[i]
    }
    return null
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data
    if (!d || typeof d.tipo !== 'string' || d.tipo.indexOf('prolu-form:') !== 0) return
    var frame = iframeDaMensagem(ev)
    if (!frame) return
    if (d.tipo === 'prolu-form:altura' && typeof d.altura === 'number' && d.altura > 0) {
      frame.style.height = Math.min(Math.ceil(d.altura), 20000) + 'px'
    } else if (d.tipo === 'prolu-form:enviado') {
      trazerParaTela(frame)
    } else if (d.tipo === 'prolu-form:redirecionar' && typeof d.url === 'string' && URL_RE.test(d.url)) {
      window.location.href = d.url
    }
  })

  function trazerParaTela(el) {
    var r = el.getBoundingClientRect()
    if (r.top < 0 || r.top > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── modo cru: formulário no DOM do site ─────────────────────────────────
  var CSS_BASE = [
    ':where(.prolu-form){display:block}',
    ':where(.prolu-form__texto){white-space:pre-line}',
    ':where(.prolu-form__campos){display:flex;flex-direction:column;gap:1em;margin:1em 0}',
    ':where(.prolu-form__campo){display:flex;flex-direction:column;gap:.35em}',
    ':where(.prolu-form__input){width:100%;box-sizing:border-box;font:inherit}',
    ':where(textarea.prolu-form__input){resize:vertical}',
    ':where(.prolu-form__asterisco,.prolu-form__erro,.prolu-form__erro-geral){color:#c62828}',
    ':where(.prolu-form__erro,.prolu-form__legenda){font-size:.85em}',
    ':where(.prolu-form__input[aria-invalid="true"]){border-color:#c62828;outline-color:#c62828}',
    ':where(.prolu-form__enviar){cursor:pointer;font:inherit}',
    ':where(.prolu-form__enviar:disabled){opacity:.6;cursor:wait}',
    ':where(.prolu-form__capa){display:block;width:100%;height:auto;max-height:320px;object-fit:cover}',
    ':where(.prolu-form__logo){display:block;width:80px;height:80px;border-radius:50%;object-fit:cover;margin:1em auto}',
    ':where(.prolu-form__intro){white-space:pre-line}',
    ':where(.prolu-form__video){aspect-ratio:16/9;width:100%;margin:1em 0}',
    ':where(.prolu-form__video iframe){display:block;width:100%;height:100%;border:0}',
    ':where(.prolu-form__obrigado-botao){display:inline-block;margin-top:1em}'
  ].join('\n')

  function estiloBase() {
    if (document.getElementById('prolu-form-base')) return
    var s = document.createElement('style')
    s.id = 'prolu-form-base'
    s.textContent = CSS_BASE
    // primeiro no <head>: o CSS do site, que vem depois, vence no empate
    var head = document.head || document.documentElement
    head.insertBefore(s, head.firstChild)
  }

  function el(tag, classe, texto) {
    var n = document.createElement(tag)
    if (classe) n.className = classe
    if (texto != null) n.textContent = texto
    return n
  }

  function validar(campo, valor) {
    var v = (valor || '').trim()
    if (!v) return campo.obrigatorio ? 'Campo obrigatório.' : null
    if (campo.tipo === 'email' && !EMAIL_RE.test(v)) return 'E-mail inválido.'
    if (campo.tipo === 'phone') {
      var d = v.replace(/\D/g, '')
      if (d.length < 8 || d.length > 15) return 'Telefone inválido.'
    }
    if (campo.tipo === 'number' && !isFinite(Number(v.replace(',', '.')))) return 'Informe um número.'
    return null
  }

  function chamar(api, body) {
    return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {} }).then(function (j) { return r.ok ? { data: j } : { error: j } })
      })
      .catch(function () { return { error: { error: 'Não foi possível conectar. Tente novamente.' } } })
  }

  function mensagem(raiz, tipo, titulo, texto, botao) {
    raiz.textContent = ''
    raiz.setAttribute('data-estado', tipo === 'sucesso' ? 'enviado' : 'indisponivel')
    var box = el('div', 'prolu-form__mensagem prolu-form__mensagem--' + tipo)
    if (tipo === 'sucesso') box.setAttribute('role', 'status')
    box.appendChild(el('h2', 'prolu-form__titulo', titulo))
    box.appendChild(el('p', 'prolu-form__texto', texto))
    // botão opcional do agradecimento (abre em nova aba)
    if (botao && typeof botao.texto === 'string' && typeof botao.url === 'string' && URL_RE.test(botao.url)) {
      var a = el('a', 'prolu-form__obrigado-botao', botao.texto)
      a.href = botao.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      box.appendChild(a)
    }
    raiz.appendChild(box)
  }

  function montarCru(host) {
    var slug = (host.getAttribute('data-prolu-form') || '').trim().toLowerCase()
    var api = host.getAttribute('data-api')
    if (!slug || !api) { console.warn('[Prolu] data-prolu-form e data-api são obrigatórios'); return }
    if (host.getAttribute('data-estilo-base') !== 'nao') estiloBase()

    var raiz = el('div', 'prolu-form')
    raiz.setAttribute('data-estado', 'carregando')
    raiz.appendChild(el('p', 'prolu-form__status', 'Carregando…'))
    host.textContent = ''
    host.appendChild(raiz)

    chamar(api, { acao: 'carregar', slug: slug }).then(function (res) {
      if (res.error || !res.data || !res.data.formulario) {
        mensagem(raiz, 'indisponivel', 'Formulário indisponível', 'Este formulário não existe ou não está mais recebendo respostas.')
        return
      }
      renderizar(raiz, api, slug, res.data.formulario, res.data.campos || [])
    })
  }

  function renderizar(raiz, api, slug, form, campos) {
    raiz.textContent = ''
    raiz.setAttribute('data-estado', 'pronto')
    var f = el('form', 'prolu-form__form')
    f.noValidate = true

    var ap = apresentacao(form)
    if (ap.capa) f.appendChild(imagem('prolu-form__capa', ap.capa, ''))
    if (ap.logo) f.appendChild(imagem('prolu-form__logo', ap.logo, form.escritorio ? 'Logo ' + form.escritorio : ''))
    // título visível: titulo_pagina ou nome do escritório (resolvido na função); nome/descrição são internos
    var titulo = form.titulo || form.nome
    if (form.escritorio && form.escritorio !== titulo) f.appendChild(el('div', 'prolu-form__escritorio', form.escritorio))
    f.appendChild(el('h2', 'prolu-form__titulo', titulo))
    if (ap.videoId && ap.videoAntes) f.appendChild(video(ap.videoId, titulo))
    if (ap.intro) f.appendChild(el('p', 'prolu-form__intro', ap.intro))
    if (ap.videoId && !ap.videoAntes) f.appendChild(video(ap.videoId, titulo))

    // honeypot — escondido por estilo inline (o CSS do site não deve revelá-lo)
    var hp = el('div', 'prolu-form__hp')
    hp.setAttribute('aria-hidden', 'true')
    hp.style.cssText = 'position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important'
    var hpLabel = el('label', null, 'Site')
    var hpInput = el('input')
    hpInput.tabIndex = -1
    hpInput.autocomplete = 'off'
    hpLabel.appendChild(hpInput)
    hp.appendChild(hpLabel)
    f.appendChild(hp)

    var lista = el('div', 'prolu-form__campos')
    var itens = {} // campo.id → { campo, wrap, input, erro }
    campos.forEach(function (c) {
      var id = 'prolu-' + slug + '-' + c.id
      var wrap = el('div', 'prolu-form__campo prolu-form__campo--' + c.tipo + (c.obrigatorio ? ' prolu-form__campo--obrigatorio' : ''))
      wrap.setAttribute('data-campo', c.id)
      wrap.setAttribute('data-tipo', c.tipo)

      var label = el('label', 'prolu-form__label', c.label || 'Pergunta')
      label.htmlFor = id
      if (c.obrigatorio) {
        var ast = el('span', 'prolu-form__asterisco', ' *')
        ast.setAttribute('aria-hidden', 'true')
        label.appendChild(ast)
      }
      wrap.appendChild(label)

      var input
      if (c.tipo === 'textarea') {
        input = el('textarea', 'prolu-form__input')
        input.rows = 4
        input.maxLength = 5000
      } else if (c.tipo === 'select') {
        input = el('select', 'prolu-form__input')
        input.appendChild(el('option', null, 'Selecione…')).value = ''
        ;(c.opcoes || []).forEach(function (o) { input.appendChild(el('option', null, o)).value = o })
      } else {
        input = el('input', 'prolu-form__input')
        input.type = c.tipo === 'email' ? 'email' : c.tipo === 'phone' ? 'tel' : 'text'
        if (c.tipo === 'number') input.inputMode = 'decimal'
        if (c.tipo === 'phone') { input.inputMode = 'tel'; input.autocomplete = 'tel' }
        if (c.tipo === 'email') input.autocomplete = 'email'
        input.maxLength = c.tipo === 'text' ? 300 : 254
      }
      input.id = id
      input.name = c.id
      if (c.obrigatorio) input.required = true
      wrap.appendChild(input)

      var item = { campo: c, wrap: wrap, input: input, erro: null }
      input.addEventListener(c.tipo === 'select' ? 'change' : 'input', function () { mostrarErro(item, null) })
      itens[c.id] = item
      lista.appendChild(wrap)
    })
    f.appendChild(lista)

    // entra no DOM só quando há erro (atributo hidden perderia para um display do CSS do site)
    var erroGeral = el('p', 'prolu-form__erro-geral')
    erroGeral.setAttribute('role', 'alert')

    // texto do botão configurável (estilo.botao_texto — conteúdo; as cores do painel Estilo não valem aqui)
    var est = form.estilo && typeof form.estilo === 'object' ? form.estilo : {}
    var textoBotao = (typeof est.botao_texto === 'string' && est.botao_texto.trim().slice(0, 40)) || 'Enviar'
    var botao = el('button', 'prolu-form__enviar', textoBotao)
    botao.type = 'submit'
    f.appendChild(botao)
    f.appendChild(el('p', 'prolu-form__legenda', '* campos obrigatórios'))

    function mostrarErro(item, msg) {
      if (item.erro) { item.erro.remove(); item.erro = null }
      item.wrap.classList.toggle('prolu-form__campo--erro', !!msg)
      if (msg) {
        item.erro = el('div', 'prolu-form__erro', msg)
        item.erro.id = item.input.id + '-erro'
        item.wrap.appendChild(item.erro)
        item.input.setAttribute('aria-invalid', 'true')
        item.input.setAttribute('aria-describedby', item.erro.id)
      } else {
        item.input.removeAttribute('aria-invalid')
        item.input.removeAttribute('aria-describedby')
      }
    }

    function aplicarErros(erros) {
      var primeiro = null
      campos.forEach(function (c) {
        var msg = erros[c.id] || null
        mostrarErro(itens[c.id], msg)
        if (msg && !primeiro) primeiro = itens[c.id].input
      })
      if (primeiro) primeiro.focus()
      return !!primeiro
    }

    var enviando = false
    f.addEventListener('submit', function (ev) {
      ev.preventDefault()
      if (enviando) return
      erroGeral.remove()
      var respostas = {}
      var erros = {}
      campos.forEach(function (c) {
        var v = itens[c.id].input.value
        respostas[c.id] = v
        var m = validar(c, v)
        if (m) erros[c.id] = m
      })
      if (aplicarErros(erros)) return

      enviando = true
      botao.disabled = true
      botao.textContent = 'Enviando…'
      chamar(api, { acao: 'enviar', slug: slug, respostas: respostas, _site: hpInput.value }).then(function (res) {
        enviando = false
        botao.disabled = false
        botao.textContent = textoBotao
        if (res.error) {
          if (res.error.erros) aplicarErros(res.error.erros)
          erroGeral.textContent = res.error.error || 'Não foi possível enviar. Tente novamente.'
          f.insertBefore(erroGeral, botao)
          return
        }
        var d = res.data || {}
        if (typeof d.redirecionar === 'string' && URL_RE.test(d.redirecionar)) {
          raiz.setAttribute('data-estado', 'redirecionando')
          raiz.textContent = ''
          raiz.appendChild(el('p', 'prolu-form__status', 'Enviado! Redirecionando…'))
          window.location.href = d.redirecionar
          return
        }
        // textos do escritório ou os padrões (mesmos de utils/formularioEstilo.js)
        var suc = d.sucesso || {}
        mensagem(raiz, 'sucesso', suc.titulo || 'Recebemos suas informações!',
          suc.texto || (form.escritorio ? 'A equipe do ' + form.escritorio + ' vai entrar em contato em breve.' : 'Em breve entraremos em contato.'),
          suc.botao)
        trazerParaTela(raiz)
      })
    })

    raiz.appendChild(f)
  }

  function montar() {
    var hosts = document.querySelectorAll('div[data-prolu-form]:not([data-prolu-montado])')
    for (var i = 0; i < hosts.length; i++) {
      hosts[i].setAttribute('data-prolu-montado', '')
      montarCru(hosts[i])
    }
  }

  // sites que inserem o <div> depois (SPA, construtores de página) podem chamar ProluForm.montar()
  window.ProluForm = { montar: montar }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar)
  else montar()
})()
