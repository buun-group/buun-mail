import type { CryptFlareChoice, CryptFlareStatus, CryptFlareTarget } from './types'

/**
 * CryptFlare in the browser preview: connecting waits a moment for a pretend browser (long enough to open it again,
 * copy its link or cancel), then succeeds with one workspace and environment; saves are counted as written, so the
 * Settings panel can be worked on without the Rust side.
 */

const DISCONNECTED: CryptFlareStatus = { connected: false, organisation: null, canWrite: false, target: null, saveIdentities: false, pending: 0, lastSaved: null, problem: null }

let state: CryptFlareStatus = { ...DISCONNECTED }

/** How long the preview's pretend browser takes to approve. */
const APPROVE_AFTER_MS = 300

/** The pretend sign-in waiting for its browser, if any. */
let waiting: { link: string; cancel: () => void } | null = null

const copy = (): CryptFlareStatus => ({ ...state, target: state.target === null ? null : { ...state.target } })

const WORKSPACES: CryptFlareChoice[] = [{ id: 'ws_agents', name: 'Agents' }]
const ENVIRONMENTS: CryptFlareChoice[] = [
  { id: 'env_identities', name: 'Identities' },
  { id: 'env_production', name: 'Production' },
]

export const cryptflare = {
  status: (): CryptFlareStatus => copy(),
  connect: (): Promise<CryptFlareStatus> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting = null
        state = { ...state, connected: true, organisation: 'Buun Group', canWrite: true, problem: null }
        resolve(copy())
      }, APPROVE_AFTER_MS)
      waiting = {
        link: 'https://mcp.cryptflare.com/oauth/authorize?response_type=code&client_id=cfc_preview',
        cancel: () => {
          clearTimeout(timer)
          waiting = null
          reject(new Error('sign-in cancelled'))
        },
      }
    }),
  signInLink: (): string | null => waiting?.link ?? null,
  reopen: (): void => {
    if (waiting === null) throw new Error('no sign-in is waiting')
  },
  cancel: (): void => waiting?.cancel(),
  disconnect: (): CryptFlareStatus => {
    state = { ...DISCONNECTED }
    return copy()
  },
  workspaces: (): CryptFlareChoice[] => WORKSPACES.map((choice) => ({ ...choice })),
  environments: (workspace: string): CryptFlareChoice[] => (WORKSPACES.some((choice) => choice.id === workspace) ? ENVIRONMENTS.map((choice) => ({ ...choice })) : []),
  target: (target: CryptFlareTarget): CryptFlareStatus => {
    state = { ...state, target: { ...target } }
    return copy()
  },
  saveIdentities: (on: boolean): CryptFlareStatus => {
    state = { ...state, saveIdentities: on }
    return copy()
  },
  saveAll: (): number => {
    state = { ...state, lastSaved: new Date().toISOString() }
    return 2
  },
  flush: (): number => {
    const written = state.pending
    state = { ...state, pending: 0, lastSaved: written > 0 ? new Date().toISOString() : state.lastSaved }
    return written
  },
}
