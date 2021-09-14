const {client} = require('tre-client')
const Accordion = require('.')
const pull = require('pull-stream')
const h = require('mutant/html-element')
const setStyle = require('module-styles')('tre-accorion-demo')

setStyle(`
.tre-editor-accordion {
  width: 20%;
  background: rgba(255,255,255, 0.1);
}
`)


client( (err, ssb, config) => {
  if (err) return console.error(err)

  function source(opts) {
    return ssb.revisions.messagesByType('foo', opts)
  }

  function renderEditor(kvm) {
    return h('.editor', kvm.value.content.name)
  }

  const renderAccordion = Accordion(ssb, source, renderEditor, {
    rename: (kvm, newContent, newName) => {
      newContent.name = newName
      return newContent
    }
  })

  document.body.appendChild(h('.tre-accordion-demo', [
    renderAccordion()
  ]))
})

