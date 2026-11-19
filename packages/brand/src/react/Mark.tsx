import { useId } from 'react'
import type { ReactNode } from 'react'

import { FLAP, GRID, LETTER, STREAKS } from '../geometry'
import { colors } from '../tokens'

export type MarkMotion = 'still' | 'arrive' | 'loader' | 'send' | 'ping' | 'draw'

export interface MarkProps {
  size?: number
  /** `colour` keeps the orange letter and draws the streaks in the text colour; `mono` draws it all in the text colour. */
  tone?: 'colour' | 'mono'
  motion?: MarkMotion
  /** The accessible name. Leave it out where "Buun Mail" is written beside the mark. */
  label?: string
  className?: string
  /** Restart a one-shot motion by changing this. */
  play?: number
}

const TILT = `rotate(${LETTER.tilt} ${LETTER.cx} ${LETTER.cy})`

/**
 * The Arrival mark drawn inline, each part tagged so `motion.css` can move it on its own. Import
 * `@buun-mail/brand/motion.css` once for the motions.
 */
export function Mark({ size = 24, tone = 'colour', motion = 'still', label, className, play }: MarkProps): ReactNode {
  const id = useId().replaceAll(':', '')
  const fill = tone === 'colour' ? `url(#${id}-g)` : 'currentColor'
  const flapStroke = tone === 'colour' ? colors.ink : 'var(--bm-cutout, #fff)'
  const classes = ['bm', motion === 'still' ? '' : `bm-${motion}`, className ?? ''].filter(Boolean).join(' ')
  const rect = { x: LETTER.x, y: LETTER.y, width: LETTER.width, height: LETTER.height, rx: LETTER.radius }

  return (
    <svg
      key={play}
      className={classes}
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {tone === 'colour' && (
        <defs>
          <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="29" y2="29">
            <stop offset="0" stopColor={colors.markLight} />
            <stop offset="0.55" stopColor={colors.brand} />
            <stop offset="1" stopColor={colors.markDeep} />
          </linearGradient>
        </defs>
      )}
      <g className="bm-letter">
        <g transform={TILT}>
          <rect className="bm-fill" {...rect} fill={fill} />
          {motion === 'draw' && <rect className="bm-outline" {...rect} fill="none" stroke={tone === 'colour' ? colors.brand : 'currentColor'} strokeWidth="1.6" pathLength={1} />}
          <path className="bm-flap" d={FLAP.d} fill="none" stroke={flapStroke} strokeWidth={FLAP.width} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
        </g>
      </g>
      {STREAKS.map((streak) => (
        <path
          key={streak.d}
          className="bm-streak"
          d={streak.d}
          stroke="currentColor"
          strokeWidth={streak.width}
          strokeLinecap="round"
          opacity={streak.opacity}
          pathLength={1}
          style={{ ['--bm-streak-opacity' as string]: streak.opacity }}
        />
      ))}
    </svg>
  )
}
