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
  const page = new DOMParser().parseFromString(html, 'text/html')
  page.querySelectorAll('script, iframe, frame, frameset, object, embed, form, base, meta[http-equiv]').forEach((element) => element.remove())
  page.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name)
    }
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
      const style = element.getAttribute('style')
      if (style !== null && REMOTE_CSS.test(style)) element.setAttribute('style', style.replace(REMOTE_CSS, 'none'))
    })
    page.querySelectorAll('style').forEach((element) => {
      element.textContent = (element.textContent ?? '').replace(REMOTE_CSS, 'none').replace(/@import[^;]+;/giu, '')
    })
  }
  const styles = [...page.head.querySelectorAll('style')].map((element) => element.outerHTML).join('')
  return styles + page.body.innerHTML
}
