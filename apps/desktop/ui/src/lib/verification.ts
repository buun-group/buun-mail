/**
 * Verification codes and sign-in links in a message, ranked by confidence. Ported from dissolve.email's extractor
 * (`packages/shared/src/verification-extractor.ts` in dissolve-app), so a code reads the same here as on the website.
 * Every pattern is linear and only the head of each body is read, so a hostile message costs nothing.
 */

export interface VerificationInput {
  bodyText: string | null
  bodyHtml: string | null
  subject: string | null
  fromAddress: string
}

export interface VerificationMatch {
  type: 'code' | 'link'
  value: string
  confidence: number
}

// ── Bounds (pentest H1) ──────────────────────────────────────────────
//
// The extractor runs at delivery on bodies up to 2M chars. Every pattern below is linear: each quantifier is bounded,
// no two unbounded quantifiers sit next to each other or nest, and no character class that skips a tag also matches
// '<'. On top of that only the head of each body is read: a code or link sits near the top of a real verification mail.

/** Characters of the text body, and of the HTML once its tags are stripped, that are scanned. */
export const VERIFICATION_SCAN_CHARS = 64 * 1024
/** Characters of the raw HTML scanned by the tag-aware patterns (markup is wordier than the text it carries). */
export const VERIFICATION_HTML_SCAN_CHARS = 256 * 1024
const SUBJECT_SCAN_CHARS = 1000
/** At most this many candidates are looked at per pattern, so a body made of a million tiny matches costs nothing. */
const MAX_MATCHES_PER_PATTERN = 100

function* capped<T>(it: Iterable<T>): Generator<T> {
  let n = 0
  for (const value of it) {
    if (++n > MAX_MATCHES_PER_PATTERN) return
    yield value
  }
}

// ── Subject / sender heuristics ──────────────────────────────────────

const SUBJECT_KEYWORDS =
  /verif|confirm|activate|one.?time|otp|security.?code|sign.?in|log.?in|2fa|mfa|passcode|magic|authenticat/i

/** Senders that strongly signal a verification email */
const VERIFICATION_SENDER =
  /^(?:no-?reply|verify|security|auth|confirm|noreply|account|support)@/i

// ── Code patterns ────────────────────────────────────────────────────

/**
 * Labeled numeric codes:
 *   'verification code is 847293'
 *   'Your code: 847293'
 *   'passcode is: 5819'
 *   'magic code: 738461'
 */
const CODE_LABEL_NUMERIC =
  /(?:verification|confirmation|security|sign.?in|log.?in|otp|one.?time|2fa|mfa|passcode|magic|temporary|access)\s{0,5}(?:(?:code|pin|number|token|key)\s{0,5})?(?:is[:\s]{0,5}|:\s{0,5}|–\s{0,5})(\d{4,8})/gi

/**
 * Labeled alphanumeric codes:
 *   'Your code is A3K-9X2'
 *   'confirmation code: ABC-123-DEF'
 */
const CODE_LABEL_ALPHANUM =
  /(?:verification|confirmation|security|sign.?in|log.?in|otp|one.?time|2fa|mfa|passcode|magic|temporary|access)\s{0,5}(?:(?:code|pin|number|token|key)\s{0,5})?(?:is[:\s]{0,5}|:\s{0,5}|–\s{0,5})([A-Z0-9][A-Z0-9-]{2,11}[A-Z0-9])/gi

/**
 * Prefixed codes: G-847293, MSFT-123456
 */
const PREFIXED_CODE =
  /\b([A-Z]{1,6}-\d{4,8})\b/g

/** Standalone 4-8 digit code on its own line */
const STANDALONE_DIGITS = /(?:^|\n)[ \t\r]{0,20}(\d{4,8})[ \t\r]{0,20}(?=\n|$)/g

/**
 * Spaced digits of any length 4–8: '8 4 7 2 9 3' or '5 8 1 9'
 * We capture as a single group and collapse spaces.
 */
const SPACED_DIGITS =
  /(?:^|[\s>])(\d(?:[ \t\u00a0]{1,3}\d){3,7})(?=[\s<]|$)/g

/** Hyphenated/dashed digits: '847-293' or '84-72-93' */
const DASHED_DIGITS =
  /(?:^|\s)(\d{2,4}(?:-\d{2,4}){1,3})(?=\s|$)/g

// ── HTML code patterns ───────────────────────────────────────────────

/** Bold/strong/em wrapped numeric codes */
const HTML_EMPHASIS_CODE =
  /<(?:b|strong|em)[^<>]{0,500}>\s{0,50}(\d{4,8})\s{0,50}<\/(?:b|strong|em)>/gi

/**
 * Large-font or specially-styled codes in HTML:
 *   <span style='font-size:32px'>847293</span>
 *   <td style='font-size:24px; letter-spacing:8px'>847293</td>
 *   <div class='code'>847293</div>
 */
const HTML_STYLED_CODE =
  /<(?:span|div|td|p)([^<>]{0,1000})>\s{0,50}(\d{4,8})\s{0,50}<\/(?:span|div|td|p)>/gi

/** The attributes (group 1 of HTML_STYLED_CODE) that mark a code: a large font, letter spacing, or a code-ish class. */
const STYLED_ATTRS =
  /font-size\s{0,5}:\s{0,5}(?:2[0-9]|[3-9][0-9])|letter-spacing|class\s{0,5}=\s{0,5}["'][^"']{0,200}(?:code|otp|pin|token|verification)/i

/**
 * Alphanumeric codes in bold/strong/em:
 *   <strong>A3K-9X2</strong>
 */
const HTML_EMPHASIS_ALPHANUM =
  /<(?:b|strong|em)[^<>]{0,500}>\s{0,50}([A-Z0-9][A-Z0-9-]{2,11}[A-Z0-9])\s{0,50}<\/(?:b|strong|em)>/gi

// ── Link patterns ────────────────────────────────────────────────────

const LINK_KEYWORDS_URL =
  /verif|confirm|activate|validate|auth|token|magic.?link|passwordless/i

const LINK_KEYWORDS_TEXT =
  /verif|confirm|activate|validate|sign.?in|log.?in|click.?here|get.?started|complete.?registration|reset.?password/i

/** Links that are NOT verification - filter these out */
const LINK_EXCLUDE =
  /unsubscribe|manage.?preference|opt.?out|email.?settings|notification.?settings|privacy.?policy|terms/i

/** URL query params that carry tokens: ?token=, ?code=, ?otp= */
const TOKEN_QUERY_PARAM =
  /[?&](?:token|code|otp|verify|confirmation_token|magic_link_token|auth_token)=/i

/** An anchor's opening tag, closed or not. */
const ANCHOR_OPEN = /<a\s([^<>]{0,2000})>/gi
/** The href inside an anchor's attributes. */
const HREF = /(?:^|\s)href=["']([^"']{1,4096})["']/i
/** A tag, for stripping: the class stops at '<' as well as '>', so an unclosed '<' costs one scan to the next one. */
const TAG = /<[^<>]{0,10000}>/g

/** Anchors looked at per message: a newsletter has many links, a million-link body must not cost a million. */
const MAX_ANCHORS = 500
/** Characters of an anchor's content read for its link text. */
const MAX_ANCHOR_TEXT = 4000

/**
 * Each anchor with an href, and its content up to the next `</a>` ('' when unclosed). Linear: the next close is found
 * with one forward indexOf that is reused until passed, and once none is left no anchor scans for one again.
 */
function anchorsOf(html: string): Array<{ url: string; content: string }> {
  const out: Array<{ url: string; content: string }> = []
  const lower = html.toLowerCase()
  let close = -2; // -2: not looked yet; -1: none left
  for (const m of html.matchAll(ANCHOR_OPEN)) {
    if (out.length >= MAX_ANCHORS) break
    const url = HREF.exec(m[1] ?? '')?.[1]
    if (!url) continue
    const start = (m.index ?? 0) + m[0].length
    if (close !== -1 && close < start) close = lower.indexOf('</a>', start)
    const content = close === -1 ? '' : html.slice(start, Math.min(close, start + MAX_ANCHOR_TEXT))
    out.push({ url, content })
  }
  return out
}

// ── Main extraction ──────────────────────────────────────────────────

/**
 * Extract verification codes and links from email content.
 * Returns matches sorted by confidence descending.
 */
export function extractVerification(input: VerificationInput): VerificationMatch[] {
  const matches: VerificationMatch[] = []
  const seen = new Set<string>()

  const subjectBoost = input.subject && SUBJECT_KEYWORDS.test(input.subject) ? 0.05 : 0
  const senderBoost = VERIFICATION_SENDER.test(input.fromAddress) ? 0.03 : 0
  const boost = subjectBoost + senderBoost

  const text = (input.bodyText || '').slice(0, VERIFICATION_SCAN_CHARS)
  const html = (input.bodyHtml || '').slice(0, VERIFICATION_HTML_SCAN_CHARS)
  const subject = (input.subject || '').slice(0, SUBJECT_SCAN_CHARS)
  const stripped = html.replace(TAG, ' ').slice(0, VERIFICATION_SCAN_CHARS)

  // ── 1. Labeled numeric codes (0.95) ──
  for (const source of [text, stripped]) {
    for (const m of capped(source.matchAll(CODE_LABEL_NUMERIC))) {
      addMatch(matches, seen, 'code', m[1] ?? '', 0.95 + boost)
    }
  }
  for (const m of capped(subject.matchAll(CODE_LABEL_NUMERIC))) {
    addMatch(matches, seen, 'code', m[1] ?? '', 1.0)
  }

  // ── 2. Labeled alphanumeric codes (0.93) ──
  for (const source of [text, stripped]) {
    for (const m of capped(source.matchAll(CODE_LABEL_ALPHANUM))) {
      addMatch(matches, seen, 'code', m[1] ?? '', 0.93 + boost)
    }
  }
  for (const m of capped(subject.matchAll(CODE_LABEL_ALPHANUM))) {
    addMatch(matches, seen, 'code', m[1] ?? '', 0.98)
  }

  // ── 3. Prefixed codes: G-847293, MSFT-123456 (0.90) ──
  for (const source of [text, stripped]) {
    for (const m of capped(source.matchAll(PREFIXED_CODE))) {
      addMatch(matches, seen, 'code', m[1] ?? '', 0.90 + boost)
    }
  }

  // ── 4. HTML emphasis codes - numeric (0.85) ──
  for (const m of capped(html.matchAll(HTML_EMPHASIS_CODE))) {
    addMatch(matches, seen, 'code', m[1] ?? '', 0.85 + boost)
  }

  // ── 5. HTML emphasis codes - alphanumeric (0.83) ──
  for (const m of capped(html.matchAll(HTML_EMPHASIS_ALPHANUM))) {
    addMatch(matches, seen, 'code', m[1] ?? '', 0.83 + boost)
  }

  // ── 6. HTML large-font / styled codes (0.82) ──
  for (const m of capped(html.matchAll(HTML_STYLED_CODE))) {
    if (!STYLED_ATTRS.test(m[1] ?? '')) continue
    addMatch(matches, seen, 'code', m[2] ?? '', 0.82 + boost)
  }

  // ── 7. Dashed digit codes: 847-293 (0.80) ──
  for (const source of [text, stripped]) {
    for (const m of capped(source.matchAll(DASHED_DIGITS))) {
      const clean = (m[1] ?? '').replace(/-/g, "")
      if (clean.length >= 4 && clean.length <= 8) {
        addMatch(matches, seen, 'code', m[1] ?? '', 0.80 + boost)
      }
    }
  }

  // ── 8. Spaced digits: '8 4 7 2 9 3' (0.80) ──
  for (const m of capped(text.matchAll(SPACED_DIGITS))) {
    const code = (m[1] ?? '').replace(/\s+/g, "")
    if (code.length >= 4 && code.length <= 8) {
      addMatch(matches, seen, 'code', code, 0.80 + boost)
    }
  }

  // ── 9. Standalone 4-8 digit on own line (0.55–0.65) ──
  for (const m of capped(text.matchAll(STANDALONE_DIGITS))) {
    const digits = m[1] ?? ''
    // 6-digit is most common OTP length → higher confidence
    const base = digits.length === 6 ? 0.65 : digits.length >= 4 && digits.length <= 8 ? 0.55 : 0.45
    addMatch(matches, seen, 'code', digits, base + boost)
  }

  // ── 10. Verification links from HTML <a href> (0.90) ──
  const anchors = anchorsOf(html)
  for (const { url, content } of anchors) {
    const linkText = content.replace(TAG, '').trim()

    // Skip unsubscribe / preference links
    if (LINK_EXCLUDE.test(url) || LINK_EXCLUDE.test(linkText)) continue

    const urlMatch = LINK_KEYWORDS_URL.test(url)
    const textMatch = LINK_KEYWORDS_TEXT.test(linkText)
    const tokenMatch = TOKEN_QUERY_PARAM.test(url)

    if (urlMatch && textMatch) {
      addMatch(matches, seen, 'link', url, 0.95 + boost)
    } else if (urlMatch || tokenMatch) {
      addMatch(matches, seen, 'link', url, 0.90 + boost)
    } else if (textMatch) {
      addMatch(matches, seen, 'link', url, 0.85 + boost)
    }
  }

  // ── 11. URLs with token query params (HTML, not already caught, including unclosed anchors) (0.88) ──
  for (const { url } of anchors) {
    if (LINK_EXCLUDE.test(url)) continue
    if (TOKEN_QUERY_PARAM.test(url)) {
      addMatch(matches, seen, 'link', url, 0.88 + boost)
    }
  }

  // ── 12. Plain-text URLs near verification keywords (0.85) ──
  const textLinkPattern =
    /(?:verif|confirm|activate|click|follow|visit|open|go\s{1,3}to)[^\n]{0,200}?(https?:\/\/[^\s<>"]{1,2048})/gi
  for (const m of capped(text.matchAll(textLinkPattern))) {
    if (!LINK_EXCLUDE.test(m[1] ?? '')) {
      addMatch(matches, seen, 'link', m[1] ?? '', 0.85 + boost)
    }
  }

  // ── 13. Standalone URLs on their own line (if subject is verification-related) (0.70) ──
  if (subjectBoost > 0) {
    const standaloneUrl = /(?:^|\n)[ \t\r]{0,20}(https?:\/\/[^\s<>"]{1,2048})[ \t\r]{0,20}(?=\n|$)/g
    for (const m of capped(text.matchAll(standaloneUrl))) {
      if (!LINK_EXCLUDE.test(m[1] ?? '')) {
        addMatch(matches, seen, 'link', m[1] ?? '', 0.70 + senderBoost)
      }
    }
  }

  // Sort by confidence desc
  matches.sort((a, b) => b.confidence - a.confidence)
  return matches
}

function addMatch(
  matches: VerificationMatch[],
  seen: Set<string>,
  type: 'code' | 'link',
  value: string,
  confidence: number
) {
  if (seen.has(value)) return
  seen.add(value)
  matches.push({ type, value, confidence: Math.min(confidence, 1.0) })
}
