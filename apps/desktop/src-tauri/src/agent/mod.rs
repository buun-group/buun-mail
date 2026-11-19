//! Agent access: an MCP server inside the app, so an AI agent (Claude Code, Cursor, any MCP client) can read, search,
//! tag, move and file mail, and manage rules, through the same mailbox the window shows.
//!
//! - Local only: it listens on 127.0.0.1 and refuses requests a web page sends (any `Origin` that is not local).
//! - Off until turned on in Settings, Agents, and every request needs the bearer token shown there.
//! - Every change is logged with the agent's name, and the window refreshes when an agent changes something.
//!
//! - `settings`: on or off, port and token, saved in the config folder
//! - `protocol`: the JSON-RPC and MCP framing
//! - `tools`: the tools an agent sees, and what each does
//! - `server`: the HTTP listener and its lifecycle
//! - `state`: the settings and the server together, for the Settings screen

mod protocol;
mod server;
mod settings;
mod state;
#[cfg(test)]
mod tests;
mod tools;

pub use state::{AgentState, AgentStatusDto};
