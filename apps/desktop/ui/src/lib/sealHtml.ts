/** An address that would reach the internet: http, https, or protocol-relative `//host`. */
const REMOTE = /^\s*(https?:)?\/\//iu

/** CSS `url(...)` pointing at the internet. */
const REMOTE_CSS = /url\(\s*(['"]?)\s*(https?:)?\/\/[^)]*\)/giu

/** Attributes that fetch something when the page is drawn. */
const FETCHING = ['src', 'srcset', 'background', 'poster', 'data', 'lowsrc', 'dynsrc']

/**
 * A message's HTML with nothing left that could reach the internet when drawn, unless `allowRemote`: remote pictures
 * and styles lose their addresses (kept as `data-blocked-*` for the record), stylesheets and refreshes are removed, and
 * CSS `url()`s to the web are emptied. Scripts, frames and forms go whatever the choice. Parsing happens in a document
 * that loads nothing, so even this step fetches nothing.
 */
export function sealHtml(html: string, allowRemote: boolean): string {
  const page = sealDocument(html, allowRemote)
  const styles = [...page.head.querySelectorAll('style')].map((element) => element.outerHTML).join('')
  return styles + page.body.innerHTML
}

/** CSS `image-set()` with a bare web address, which fetches without `url()`. */
const REMOTE_IMAGE_SET = /(?:-webkit-)?image-set\([^)]*(['"])\s*(https?:)?\/\/[^)]*\)/giu

/** Elements that can never be drawn safely inline: scripts, frames, forms, refreshes, and SVG animation, which can rewrite a link. */
const REMOVED = 'script, iframe, frame, frameset, object, embed, form, base, meta[http-equiv], animate, animateMotion, animateTransform, set, discard'

/** CSS with nothing left that reaches the web. */
function quietCss(css: string): string {
  return css.replace(REMOTE_CSS, 'none').replace(REMOTE_IMAGE_SET, 'none').replace(/@import[^;]+;/giu, '')
}

/**
 * The parsed message, sealed: what [`sealHtml`] returns as text. Its nodes come from a document that loads nothing, so
 * they can be imported into the page (into a shadow root) without anything running or loading on the way. Links keep
 * only web and mail addresses, and nothing may open a popover over the app.
 */
export function sealDocument(html: string, allowRemote: boolean): Document {
  const page = new DOMParser().parseFromString(html, 'text/html')
  page.querySelectorAll(REMOVED).forEach((element) => element.remove())
  page.querySelectorAll('*').forEach((element) => {
    // A copy, since removing an attribute changes the live list.
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('on') || attribute.name === 'popover' || attribute.name === 'popovertarget' || attribute.name === 'ping') element.removeAttribute(attribute.name)
    }
    const link = element.getAttribute('href')
    const isAnchor = element.localName === 'a' || element.localName === 'area'
    if (link !== null && isAnchor && !/^\s*(https?:|mailto:|#)/iu.test(link)) element.removeAttribute('href')
  })
  if (!allowRemote) {
    page.querySelectorAll('link').forEach((element) => element.remove())
    page.querySelectorAll('*').forEach((element) => {
      for (const name of FETCHING) {
        const value = element.getAttribute(name)
        if (value !== null && (REMOTE.test(value) || (name === 'srcset' && /https?:|\/\//iu.test(value)))) {
          element.setAttribute(`data-blocked-${name}`, value)
          element.removeAttribute(name)
        }
      }
      // SVG pictures and uses fetch through href; only links may keep a web address there.
      if (element.localName !== 'a' && element.localName !== 'area') {
        for (const name of ['href', 'xlink:href']) {
          const value = element.getAttribute(name)
          if (value !== null && REMOTE.test(value)) {
            element.setAttribute(`data-blocked-${name.replace(':', '-')}`, value)
            element.removeAttribute(name)
          }
        }
      }
      const style = element.getAttribute('style')
      if (style !== null) {
        const quiet = quietCss(style)
        if (quiet !== style) element.setAttribute('style', quiet)
      }
    })
    page.querySelectorAll('style').forEach((element) => {
      element.textContent = quietCss(element.textContent ?? '')
    })
  }
  return page
}
