import type { CryptFlareChoice, CryptFlareStatus, CryptFlareTarget } from './types'

/**
 * CryptFlare in the browser preview: connecting succeeds at once with one workspace and environment, and saves are
 * counted as written, so the Settings panel can be worked on without the Rust side.
 */

const DISCONNECTED: CryptFlareStatus = { connected: false, organisation: null, canWrite: false, target: null, saveIdentities: false, pending: 0, lastSaved: null, problem: null }

let state: CryptFlareStatus = { ...DISCONNECTED }

const copy = (): CryptFlareStatus => ({ ...state, target: state.target === null ? null : { ...state.target } })

const WORKSPACES: CryptFlareChoice[] = [{ id: 'ws_agents', name: 'Agents' }]
const ENVIRONMENTS: CryptFlareChoice[] = [
  { id: 'env_identities', name: 'Identities' },
  { id: 'env_production', name: 'Production' },
]

export const cryptflare = {
  status: (): CryptFlareStatus => copy(),
  connect: (): CryptFlareStatus => {
    state = { ...state, connected: true, organisation: 'Buun Group', canWrite: true, problem: null }
    return copy()
  },
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
