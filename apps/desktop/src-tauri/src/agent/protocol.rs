//! The MCP framing: JSON-RPC 2.0 requests in, results or errors out, over HTTP POST (the streamable HTTP transport,
//! answering with plain JSON).

use serde_json::{Value, json};

/// The MCP version this server speaks.
pub const PROTOCOL_VERSION: &str = "2025-06-18";

/// JSON-RPC error codes this server uses.
pub mod codes {
    /// The body is not JSON.
    pub const PARSE_ERROR: i64 = -32_700;
    /// The JSON is not a request.
    pub const INVALID_REQUEST: i64 = -32_600;
    /// No such method.
    pub const METHOD_NOT_FOUND: i64 = -32_601;
    /// The parameters are wrong.
    pub const INVALID_PARAMS: i64 = -32_602;
}

/// A JSON-RPC success.
#[must_use]
pub fn result(id: &Value, result: &Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// A JSON-RPC error.
#[must_use]
pub fn error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// The answer to `initialize`: what this server is and that it offers tools.
#[must_use]
pub fn initialize_result(instructions: &str) -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": "buun-mail", "title": "Buun Mail", "version": env!("CARGO_PKG_VERSION") },
        "instructions": instructions,
    })
}

/// A tool's answer: its data as pretty JSON text, or an error the agent can read and correct.
#[must_use]
pub fn tool_result(outcome: Result<Value, String>) -> Value {
    match outcome {
        Ok(data) => {
            json!({ "content": [{ "type": "text", "text": serde_json::to_string_pretty(&data).unwrap_or_default() }], "structuredContent": wrap(data), "isError": false })
        }
        Err(message) => json!({ "content": [{ "type": "text", "text": message }], "isError": true }),
    }
}

/// Structured content must be an object, so lists are wrapped.
fn wrap(data: Value) -> Value {
    if data.is_object() { data } else { json!({ "result": data }) }
}
