/**
 * The brand colours for files that cannot read CSS (SVG files, PNGs, the OG image). They mirror
 * `apps/desktop/ui/src/styles/tokens.css`; a test holds the shared ones equal.
 */
export const colors = {
  /** Buun orange, the letter's middle stop. */
  brand: '#f18707',
  /** The letter's light and deep stops. */
  markLight: '#ffc35c',
  markDeep: '#b45309',
  /** The flap line, and the ink of every dark ground. */
  ink: '#16141c',
  /** Text and streaks on a dark ground. */
  paper: '#f5f5f4',
  /** Muted text on a dark ground. */
  paperMuted: '#a3a09a',
  /** The page ground of the app, light and dark. */
  bodyLight: '#f9f9f9',
  bodyDark: '#0a0a0a',
  white: '#ffffff',
  black: '#000000',
} as const
