/**
 * The agent clients Settings shows setup for, and what to paste into each. The URL and token come from the running
 * server. Logos come from `AGENT_CLIENT_GLYPHS` in `icons.ts`. The words are translation keys into
 * `locales/<language>/agents.json`.
 */
import type { ParseKeys } from 'i18next'

export const AGENT_CLIENT_IDS = ['claude', 'cursor', 'vscode', 'any'] as const
export type AgentClientId = (typeof AGENT_CLIENT_IDS)[number]

/** A key in the `agents` strings. */
export type AgentsKey = ParseKeys<'agents'>

export interface AgentClient {
  id: AgentClientId
  name: AgentsKey
  /** Where the text goes, in a few words. With `file`, the words are "Add to" that file. */
  where: AgentsKey
  /** The config file the text goes in, never translated. */
  file?: string
  /** What to paste, given the server's URL and token. */
  snippet: (url: string, token: string) => string
}

/** The MCP server's name in each client's config. */
const SERVER_NAME = 'buun-mail'

const json = (value: unknown): string => JSON.stringify(value, null, 2)

export const AGENT_CLIENTS: readonly AgentClient[] = [
  {
    id: 'claude',
    name: 'clients.claude.name',
    where: 'clients.claude.where',
    snippet: (url, token) => `claude mcp add --transport http ${SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`,
  },
  {
    id: 'cursor',
    name: 'clients.cursor.name',
    where: 'connect.whereFile',
    file: '~/.cursor/mcp.json',
    snippet: (url, token) => json({ mcpServers: { [SERVER_NAME]: { url, headers: { Authorization: `Bearer ${token}` } } } }),
  },
  {
    id: 'vscode',
    name: 'clients.vscode.name',
    where: 'connect.whereFile',
    file: '.vscode/mcp.json',
    snippet: (url, token) => json({ servers: { [SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }),
  },
  {
    id: 'any',
    name: 'clients.any.name',
    where: 'clients.any.where',
    snippet: (url, token) => `URL     ${url}\nHeader  Authorization: Bearer ${token}`,
  },
]

/** How many activity entries Settings shows. */
export const ACTIVITY_SHOWN = 30
