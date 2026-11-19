//! The HTTP listener: one thread, `POST /mcp` only, local only, token required. Started and stopped from Settings.

use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use serde_json::{Value, json};
use tauri::AppHandle;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use super::protocol::{self, codes};
use super::settings::{AgentSettings, new_token};
use super::tools::{self, Effect, INSTRUCTIONS};
use crate::events;
use crate::mailbox::{Actor, Mailbox};

/// The one path the server answers.
const PATH: &str = "/mcp";

/// The header a session id travels in, both ways.
const SESSION_HEADER: &str = "Mcp-Session-Id";

/// The largest request body read, in bytes. A tool call is a few hundred bytes; this leaves room for long rules.
const MAX_BODY: u64 = 256 * 1024;

/// The agent server: runs while enabled, on its own thread.
pub struct AgentServer {
    mailbox: Arc<Mailbox>,
    app: Option<AppHandle>,
    running: Mutex<Option<Running>>,
}

struct Running {
    server: Arc<Server>,
    thread: JoinHandle<()>,
}

/// What one request needs to be answered.
struct Context {
    mailbox: Arc<Mailbox>,
    app: Option<AppHandle>,
    token: String,
    /// Client names by session id, from `initialize`.
    sessions: Mutex<HashMap<String, String>>,
}

impl AgentServer {
    /// A stopped server over this mailbox. `app` lets it tell the window when an agent changed something.
    #[must_use]
    pub fn new(mailbox: Arc<Mailbox>, app: Option<AppHandle>) -> Self {
        Self { mailbox, app, running: Mutex::new(None) }
    }

    /// Starts listening with these settings, stopping any earlier listener first. Returns the port it listens on (the
    /// settings' port, or the one the system picked for port 0).
    ///
    /// # Errors
    ///
    /// The reason in words when the port cannot be taken, such as another program holding it.
    pub fn start(&self, settings: &AgentSettings) -> Result<u16, String> {
        self.stop();
        let server = Arc::new(Server::http(("127.0.0.1", settings.port)).map_err(|error| format!("port {} is not free: {error}", settings.port))?);
        let port = server.server_addr().to_ip().map_or(settings.port, |address| address.port());
        let context = Arc::new(Context {
            mailbox: Arc::clone(&self.mailbox),
            app: self.app.clone(),
            token: settings.token.clone(),
            sessions: Mutex::new(HashMap::new()),
        });
        let listener = Arc::clone(&server);
        let thread = thread::spawn(move || {
            for request in listener.incoming_requests() {
                let context = Arc::clone(&context);
                // One thread per request, so a long wait_for_message never blocks the others.
                thread::spawn(move || answer(&context, request));
            }
        });
        if let Ok(mut running) = self.running.lock() {
            *running = Some(Running { server, thread });
        }
        Ok(port)
    }

    /// Stops listening. Requests already being answered finish.
    pub fn stop(&self) {
        let Ok(mut running) = self.running.lock() else { return };
        if let Some(Running { server, thread }) = running.take() {
            server.unblock();
            let _ = thread.join();
        }
    }

    /// True while listening.
    #[must_use]
    pub fn is_running(&self) -> bool {
        self.running.lock().is_ok_and(|running| running.is_some())
    }
}

impl Drop for AgentServer {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Answers one HTTP request.
fn answer(context: &Context, mut request: Request) {
    let response = respond(context, &mut request);
    let _ = request.respond(response);
}

fn respond(context: &Context, request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    if request.url() != PATH {
        return plain(404, "Buun Mail answers MCP at /mcp.");
    }
    if !origin_is_local(request) {
        return plain(403, "Requests from web pages are refused.");
    }
    if !authorized(request, &context.token) {
        return plain(401, "Send the token from Buun Mail, Settings, Agents, as Authorization: Bearer <token>.");
    }
    match request.method() {
        Method::Post => {}
        Method::Get => return plain(405, "This server answers POST only; it does not stream."),
        Method::Delete => return plain(200, ""),
        _ => return plain(405, "POST only."),
    }

    let mut body = String::new();
    if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
        return json_response(200, &protocol::error(&Value::Null, codes::PARSE_ERROR, "the body is not UTF-8 JSON"), None);
    }
    let Ok(message) = serde_json::from_str::<Value>(&body) else {
        return json_response(200, &protocol::error(&Value::Null, codes::PARSE_ERROR, "the body is not JSON"), None);
    };
    let session = header(request, SESSION_HEADER);
    handle(context, &message, session)
}

/// Handles one JSON-RPC message.
fn handle(context: &Context, message: &Value, session: Option<String>) -> Response<std::io::Cursor<Vec<u8>>> {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = message.get("method").and_then(Value::as_str) else {
        return json_response(200, &protocol::error(&id, codes::INVALID_REQUEST, "a request needs a method"), None);
    };
    // Notifications have no id and want no answer.
    if message.get("id").is_none() {
        return plain(202, "");
    }
    let params = message.get("params").cloned().unwrap_or(Value::Null);

    match method {
        "initialize" => {
            let client = params.pointer("/clientInfo/name").and_then(Value::as_str).unwrap_or("agent").to_owned();
            let session_id = new_token();
            if let Ok(mut sessions) = context.sessions.lock() {
                sessions.insert(session_id.clone(), client);
            }
            json_response(200, &protocol::result(&id, &protocol::initialize_result(INSTRUCTIONS)), Some(&session_id))
        }
        "ping" => json_response(200, &protocol::result(&id, &json!({})), None),
        "tools/list" => json_response(200, &protocol::result(&id, &tools::definitions()), None),
        "tools/call" => {
            let Some(name) = params.get("name").and_then(Value::as_str) else {
                return json_response(200, &protocol::error(&id, codes::INVALID_PARAMS, "tools/call needs a tool name"), None);
            };
            let client = session.and_then(|session| context.sessions.lock().ok()?.get(&session).cloned()).unwrap_or_else(|| "agent".to_owned());
            let (outcome, effect) = tools::call(&context.mailbox, &Actor::Agent(client), name, params.get("arguments").cloned().unwrap_or(Value::Null));
            if let (Effect::Changed, Some(app)) = (effect, &context.app) {
                events::mail_changed(app);
            }
            json_response(200, &protocol::result(&id, &protocol::tool_result(outcome)), None)
        }
        other => json_response(200, &protocol::error(&id, codes::METHOD_NOT_FOUND, &format!("{other} is not supported")), None),
    }
}

/// True when the request carries no `Origin`, or a local one. Guards against DNS rebinding from a web page.
fn origin_is_local(request: &Request) -> bool {
    header(request, "Origin").is_none_or(|origin| {
        ["http://127.0.0.1", "http://localhost", "tauri://localhost"].iter().any(|local| origin == *local || origin.starts_with(&format!("{local}:")))
    })
}

/// True when the bearer token matches, compared in constant time.
fn authorized(request: &Request, token: &str) -> bool {
    let Some(given) = header(request, "Authorization").and_then(|value| value.strip_prefix("Bearer ").map(str::to_owned)) else { return false };
    given.len() == token.len() && given.bytes().zip(token.bytes()).fold(0_u8, |difference, (a, b)| difference | (a ^ b)) == 0
}

fn header(request: &Request, name: &str) -> Option<String> {
    request.headers().iter().find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|header| header.value.as_str().to_owned())
}

fn plain(status: u16, text: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(text).with_status_code(StatusCode(status))
}

fn json_response(status: u16, body: &Value, session: Option<&str>) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_string(body.to_string()).with_status_code(StatusCode(status));
    if let Ok(content_type) = Header::from_bytes("Content-Type", "application/json") {
        response.add_header(content_type);
    }
    if let Some(session) = session.and_then(|session| Header::from_bytes(SESSION_HEADER, session).ok()) {
        response.add_header(session);
    }
    response
}
