import { StrictMode, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/geist'
import '../src/css/motion.css'
import { Loader, Logo, Mark, RouteFlow, Splash } from '../src/react'
import type { MarkMotion } from '../src/react'
import './preview.css'

const svgs = import.meta.glob('../src/svg/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const pngs = import.meta.glob('../assets/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const file = (map: Record<string, string>, name: string): string => Object.entries(map).find(([key]) => key.endsWith(`/${name}`))?.[1] ?? ''

const TONES = ['on-dark', 'on-light', 'mono', 'white', 'black'] as const
const MOTIONS: { motion: MarkMotion; words: string }[] = [
  { motion: 'arrive', words: 'Splash and first launch' },
  { motion: 'loader', words: 'Loading and syncing' },
  { motion: 'send', words: 'A reply sent' },
  { motion: 'ping', words: 'New mail' },
  { motion: 'draw', words: 'A first view, the empty state' },
]
const ROUTES = [
  { from: 'billing@acme.com', to: 'Acme' },
  { from: 'hello@globex.io', to: 'Globex' },
  { from: 'me@personal.dev', to: 'Personal' },
]

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Grounds({ children }: { children: (ground: 'dark' | 'light') => ReactNode }): ReactNode {
  return (
    <div className="grounds">
      <div className="ground ground--dark">{children('dark')}</div>
      <div className="ground ground--light">{children('light')}</div>
    </div>
  )
}

function MotionCard({ motion, words }: { motion: MarkMotion; words: string }): ReactNode {
  const [play, setPlay] = useState(0)
  return (
    <figure className="motion">
      <Grounds>{() => <Mark size={72} motion={motion} play={play} />}</Grounds>
      <figcaption>
        <code>bm-{motion}</code>
        <span>{words}</span>
        {motion !== 'loader' && (
          <button type="button" onClick={() => setPlay((n) => n + 1)}>
            Replay
          </button>
        )}
      </figcaption>
    </figure>
  )
}

function SplashDemo(): ReactNode {
  const [run, setRun] = useState(0)
  const [done, setDone] = useState(true)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRun((n) => n + 1)
          setDone(false)
          window.setTimeout(() => setDone(true), 1600)
        }}
      >
        Play the splash
      </button>
      {run > 0 && <Splash key={run} done={done} />}
    </>
  )
}

function Preview(): ReactNode {
  return (
    <main>
      <header className="top">
        <Logo size={32} motion="arrive" />
        <p>The Arrival mark: a letter in flight, two streaks behind it. Every file below is built from one geometry by <code>pnpm brand:build</code>.</p>
      </header>

      <Section title="Mark">
        <div className="row">
          {TONES.map((tone) => (
            <figure key={tone} className={`tile tile--${tone === 'on-light' || tone === 'black' || tone === 'mono' ? 'light' : 'dark'}`}>
              <img src={file(svgs, `mark-${tone}.svg`)} width={64} height={64} alt={`Mark, ${tone}`} />
              <figcaption>{tone}</figcaption>
            </figure>
          ))}
        </div>
        <Grounds>
          {() => (
            <div className="ladder">
              {[96, 64, 48, 32, 24, 20, 16].map((size) => (
                <Mark key={size} size={size} />
              ))}
            </div>
          )}
        </Grounds>
      </Section>

      <Section title="Lockups">
        <Grounds>
          {(ground) => (
            <div className="stack">
              <img src={file(svgs, `lockup-horizontal-on-${ground}.svg`)} height={40} alt="Horizontal lockup" />
              <img src={file(svgs, `lockup-stacked-on-${ground}.svg`)} width={140} alt="Stacked lockup" />
            </div>
          )}
        </Grounds>
      </Section>

      <Section title="App icons">
        <div className="row row--end">
          {['app-icon-1024.png', 'icon-512.png', 'maskable-512.png', 'icon-192.png', 'apple-touch-icon.png', 'favicon-48.png', 'favicon-32.png', 'favicon-16.png'].map((name) => {
            const size = Number(/(\d+)/.exec(name)?.[1] ?? 180)
            const shown = Math.min(size, 160)
            return (
              <figure key={name} className="icon">
                <img src={file(pngs, name)} width={shown} height={shown} alt={name} />
                <figcaption>{name}</figcaption>
              </figure>
            )
          })}
        </div>
      </Section>

      <Section title="Motion">
        <div className="motions">
          {MOTIONS.map((item) => (
            <MotionCard key={item.motion} {...item} />
          ))}
          <figure className="motion">
            <Grounds>{() => <Loader size={40} label="Syncing" showLabel />}</Grounds>
            <figcaption>
              <code>&lt;Loader&gt;</code>
              <span>The loader with its label</span>
            </figcaption>
          </figure>
        </div>
        <div className="route">
          <Grounds>{() => <RouteFlow routes={ROUTES} />}</Grounds>
          <p>
            <code>&lt;RouteFlow&gt;</code> What the app does, for onboarding, the empty state and the site.
          </p>
        </div>
        <SplashDemo />
      </Section>

      <Section title="Social and email">
        <img className="og" src={file(pngs, 'og-default.png')} alt="Social card" />
        <Grounds>{(ground) => <img src={file(pngs, `email-logo-${ground}@2x.png`)} height={32} alt="Email logo" />}</Grounds>
      </Section>
    </main>
  )
}

const root = document.getElementById('root')
if (root !== null)
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  )
