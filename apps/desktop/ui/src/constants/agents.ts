/**
 * The agent clients Settings shows setup for, and what to paste into each. The URL and token come from the running
 * server. Logos come from `AGENT_CLIENT_GLYPHS` in `icons.ts`.
 */

export const AGENT_CLIENT_IDS = ['claude', 'cursor', 'vscode', 'any'] as const
export type AgentClientId = (typeof AGENT_CLIENT_IDS)[number]

export interface AgentClient {
  id: AgentClientId
  name: string
  /** Where the text goes, in a few words. */
  where: string
  /** What to paste, given the server's URL and token. */
  snippet: (url: string, token: string) => string
}

/** The MCP server's name in each client's config. */
const SERVER_NAME = 'buun-mail'

const json = (value: unknown): string => JSON.stringify(value, null, 2)

export const AGENT_CLIENTS: readonly AgentClient[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    where: 'Run in a terminal',
    snippet: (url, token) => `claude mcp add --transport http ${SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where: 'Add to ~/.cursor/mcp.json',
    snippet: (url, token) => json({ mcpServers: { [SERVER_NAME]: { url, headers: { Authorization: `Bearer ${token}` } } } }),
  },
  {
    id: 'vscode',
    name: 'VS Code',
    where: 'Add to .vscode/mcp.json',
    snippet: (url, token) => json({ servers: { [SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }),
  },
  {
    id: 'any',
    name: 'Any MCP client',
    where: 'Streamable HTTP, with this header',
    snippet: (url, token) => `URL     ${url}\nHeader  Authorization: Bearer ${token}`,
  },
]

/** How many activity entries Settings shows. */
export const ACTIVITY_SHOWN = 30
