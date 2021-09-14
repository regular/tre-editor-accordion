const pull = require('pull-stream')
const Shell = require('tre-editor-shell')
const setStyle = require('module-styles')('tre-editor-accordion')

const h = require('mutant/html-element')
const MutantMap = require('mutant/map')
const MutantArray = require('mutant/array')
const Value = require('mutant/value')
const computed = require('mutant/computed')

const collectMutations = require('collect-mutations')
const ResolvePrototypes = require('tre-prototypes')

module.exports = function(ssb, source, renderEditor, opts) {
  opts = opts || {}
  const resolvePrototypes = ResolvePrototypes(ssb)

  const renderShell = Shell(ssb, {
    save: (kv, cb) => {
      ssb.publish(kv.value.content, cb)
    }
  })

  return function() {
    const sheets = MutantArray()
    const o = {sync: true, live: true}
    let drain
    function stream() {
      sheets.clear()
      pull(
        source(o),
        drain = collectMutations(sheets, o, err => {
          if (!err) return
          const delay = err.pleaseRetryIn
          if (delay !== undefined) {
            return setTimeout(stream, delay)
          }
          console.error('tre-editor-accordion error: %s', err.message)
        })
      )
    }
    stream()
    const abort = ()=>drain.abort()
    const resolved = MutantMap(sheets, resolvePrototypes, {comparer})

    return h('.tre-editor-accordion', {
      hooks: [el => abort],
    }, MutantMap(resolved, kvm => {
      if (!kvm) return []
      const ignored = computed(kvm, kvm => opts.isIgnored && opts.isIgnored(kvm))
      const isOpen = Value(false)
      const isRenaming = Value(false)
      return computed(ignored, i => i ? [] : h('details', {
        'ev-click': ev => {
          if (isRenaming()) {
            ev.preventDefault()
          }
        },
        'ev-toggle': ev => isOpen.set(!isOpen())
      }, [
        computed(kvm, kvm => renderSummary(kvm, isOpen, isRenaming)),
        computed(isOpen, o => !o ? renderEditor(kvm(), {where: 'stage'}) : renderEditMode(kvm()))
      ]))
    }, {comparer}))

  }

  function renderEditMode(kv) {
    if (!kv) return
    if (opts.isIgnored && opts.isIgnored(kv)) return
    const contentObs = Value(Object.assign({}, kv.value.content))
    return renderShell(kv, {
      renderEditor,
      contentObs,
      where: 'compact-editor'
    })
  }

  function renderSummary(kvm, isOpen, isRenaming) {
    if (!kvm || !kvm.value) return h('summary', 'n/a')
    const {content} = kvm.value
    let nameSpan

    function doRename() {
      isRenaming.set(false)
      const newName = nameSpan.innerText
      nameSpan.innerHTML='...'
      const content = opts.rename(kvm, makeRevision(kvm), newName)
      console.log('%O', content)
      ssb.publish(content, err=>{
        if (err) console.error(err.message)
      })
    }
    return h('summary', [
      h('span.disclosure', {
        classList: computed(isOpen, open => open ? ['open'] : []),
      }, '>'),
      nameSpan = h('span.name', {
        attributes: {
          'contenteditable': isRenaming
        },
        'ev-blur': ev=>{
          if (isRenaming()) doRename()
        },
        'ev-keydown': ev=>{
          if (ev.code == 'Enter') {
            doRename()
            ev.preventDefault()
          }
        }
      }, content.name) || h('span.no-name', 'no name'),
      computed(isRenaming, r=>r || !opts.rename ? [] : h('button', {
        'ev-click': ev => {
          isRenaming.set(true)
          nameSpan.focus()
          const range = document.createRange()
          range.selectNodeContents(nameSpan)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }, 'rename'))
    ])
  }
}

setStyle(`
.tre-editor-accordion > details > summary {
  user-select: none;
  display: grid;
  grid-template-columns: 2ch 1fr auto;
}
.tre-editor-accordion details > summary > button {
  font-size: 60%;
  padding: 0px 5px;
  background: transparent;
  border: 1px solid #aaa;
  color: #aaa;
  border-radius: 2px;
  visibility: hidden;
}
.tre-editor-accordion details > summary:hover > button {
  visibility: visible;
}
.tre-editor-accordion details > summary > button:hover {
  background-color: rgba(255,255,255,0.2);
}
.tre-editor-accordion details > summary > .disclosure {
  color: #eee;
  transition: transform 0.25s;
  transform-origin: 25% 50%;
}
.tre-editor-accordion details > summary > .disclosure.open {
  transform: rotate(90deg);
}
`)

function makeRevision(kvm) {
  const {content} = kvm.value
  const revisionRoot = content.revisionRoot || kvm.key
  const revisionBranch = content.revisionBranch || revisionRoot
  return Object.assign({}, content, {revisionRoot, revisionBranch})
}

function comparer(a, b) {
  // NOTE: a and b might be observables 
  /*
  It might be beneficial to overall perofrmance to make a slightly deeper comparison of
  - keys
  - meta (wihtout prototype-chain)
  - keys of prototype chain

  It's not enough to just compare akey to b.key because changes in
  prototypes would slip through.
  */
  return a === b
}

