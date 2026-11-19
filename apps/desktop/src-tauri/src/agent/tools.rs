//! The tools an agent sees. Each has a name, a description written for a model, and a JSON Schema for its input; each
//! is a thin call into the mailbox, acting as that agent.

use std::thread;
use std::time::{Duration, Instant};

use buun_mail_rules::Rule;
use buun_mail_store::Placement;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::mailbox::{Actor, Mailbox};

/// The most messages one list or search returns, so a reply stays readable for a model.
const MAX_LIMIT: usize = 100;

/// A list or search returns this many unless asked.
const DEFAULT_LIMIT: usize = 25;

/// The longest `wait_for_message` waits, in seconds.
const MAX_WAIT_SECONDS: u64 = 120;

/// How often `wait_for_message` looks again.
const WAIT_POLL: Duration = Duration::from_secs(1);

/// What the server tells an agent on connecting.
pub const INSTRUCTIONS: &str = "Buun Mail files every address a person runs into workspaces (usually one per business) and folders. \
Start with list_workspaces, then list_messages or search_messages. read_message gives the full text without marking it read. \
Tag, move and mark read to triage. Rules (list_rules, add_rule) run on every new message: when it matches workspace, from, to or subjectContains, \
its actions tag, move, markRead or quiet it. Patterns are an exact address or *@domain. Everything you change is logged under your name.";

/// Every tool, for `tools/list`.
#[must_use]
pub fn definitions() -> Value {
    let id = json!({ "type": "string", "description": "The message id, from list_messages or search_messages." });
    let limit = json!({ "type": "integer", "minimum": 1, "maximum": MAX_LIMIT, "description": "How many to return. Defaults to 25." });
    let rule = json!({
        "type": "object",
        "required": ["name", "when", "actions"],
        "properties": {
            "name": { "type": "string", "description": "What the rule is for, in a few words." },
            "enabled": { "type": "boolean" },
            "when": {
                "type": "object",
                "description": "Every condition given must hold. Give at least one.",
                "properties": {
                    "workspace": { "type": "string", "description": "Workspace id." },
                    "from": { "type": "string", "description": "Sender: an address or *@domain." },
                    "to": { "type": "string", "description": "Recipient: an address or *@domain." },
                    "subjectContains": { "type": "string", "description": "Text in the subject, any case." }
                }
            },
            "actions": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["type"],
                    "properties": {
                        "type": { "enum": ["tag", "move", "markRead", "quiet"] },
                        "tag": { "type": "string", "description": "For tag." },
                        "workspace": { "type": "string", "description": "For move: workspace id; leave out to stay in the routed one." },
                        "folder": { "type": "string", "description": "For move: folder name; leave out for the inbox." }
                    }
                }
            }
        }
    });
    json!({ "tools": [
        tool("list_workspaces", "Every workspace with its addresses, folders and unread counts.", &json!({}), &[], true),
        tool("list_messages", "Messages in one workspace folder, newest first.", &json!({ "workspace": { "type": "string" }, "folder": { "type": "string", "description": "Leave out for the inbox." }, "limit": limit }), &["workspace"], true),
        tool("search_messages", "Find messages by text in subject, sender, recipient, preview or tags, newest first.", &json!({ "query": { "type": "string", "description": "Text to find; empty matches everything." }, "workspace": { "type": "string" }, "unreadOnly": { "type": "boolean" }, "limit": limit }), &["query"], true),
        tool("read_message", "One message with its full text. Does not mark it read.", &json!({ "id": id }), &["id"], true),
        tool("mark_read", "Mark messages read.", &json!({ "ids": { "type": "array", "items": { "type": "string" }, "minItems": 1 } }), &["ids"], false),
        tool("tag_message", "Add tags to a message.", &json!({ "id": id, "tags": { "type": "array", "items": { "type": "string" }, "minItems": 1 } }), &["id", "tags"], false),
        tool("untag_message", "Remove one tag from a message.", &json!({ "id": id, "tag": { "type": "string" } }), &["id", "tag"], false),
        tool("move_message", "Move a message to another workspace or folder.", &json!({ "id": id, "workspace": { "type": "string" }, "folder": { "type": "string", "description": "Leave out for the inbox." } }), &["id", "workspace"], false),
        tool("list_tags", "Every tag in use, with how many messages carry it.", &json!({}), &[], true),
        tool("list_rules", "Every rule, in the order they run.", &json!({}), &[], true),
        tool("add_rule", "Add a rule, or replace the rule with the same id. It runs on every new message.", &json!({ "rule": rule }), &["rule"], false),
        tool("delete_rule", "Delete a rule by id.", &json!({ "id": { "type": "string" } }), &["id"], false),
        tool("apply_rules", "Run every rule over mail already stored. Adds tags, makes moves and marks read; undoes nothing.", &json!({}), &[], false),
        tool("wait_for_message", "Wait for new mail matching a filter, such as a sign-up confirmation. Returns the first match, or none after the timeout.", &json!({ "workspace": { "type": "string" }, "query": { "type": "string", "description": "Text to find, as in search_messages." }, "timeoutSeconds": { "type": "integer", "minimum": 1, "maximum": MAX_WAIT_SECONDS } }), &[], true),
        tool("recent_activity", "What people, rules and agents changed lately, newest first.", &json!({ "limit": limit }), &[], true),
    ] })
}

fn tool(name: &str, description: &str, properties: &Value, required: &[&str], read_only: bool) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": { "type": "object", "properties": properties, "required": required, "additionalProperties": false },
        "annotations": { "readOnlyHint": read_only, "destructiveHint": false },
    })
}

/// What a call changed, so the server can tell the window to refresh.
pub enum Effect {
    /// Read only.
    None,
    /// Mail, tags, rules or read state changed.
    Changed,
}

/// Runs one tool as `actor`. Errors are words the agent can act on.
pub fn call(mailbox: &Mailbox, actor: &Actor, name: &str, arguments: Value) -> (Result<Value, String>, Effect) {
    let read = |result: Result<Value, String>| (result, Effect::None);
    let change = |result: Result<Value, String>| (result, Effect::Changed);
    match name {
        "list_workspaces" => read(json_of(mailbox.workspaces())),
        "list_messages" => read(
            args::<ListArgs>(arguments)
                .and_then(|a| json_of(mailbox.messages(&Placement { workspace: a.workspace, folder: a.folder }).map(|list| limited(list, a.limit)))),
        ),
        "search_messages" => {
            read(args::<SearchArgs>(arguments).and_then(|a| json_of(mailbox.search(&a.query, a.workspace.as_deref(), a.unread_only, limit_of(a.limit)))))
        }
        "read_message" => read(args::<IdArgs>(arguments).and_then(|a| json_of(mailbox.read_message(&a.id)))),
        "mark_read" => change(args::<IdsArgs>(arguments).and_then(|a| json_of(mailbox.mark_read(&a.ids, actor).map(|changed| json!({ "changed": changed }))))),
        "tag_message" => change(args::<TagArgs>(arguments).and_then(|a| json_of(mailbox.tag(&a.id, &a.tags, actor)))),
        "untag_message" => change(args::<UntagArgs>(arguments).and_then(|a| json_of(mailbox.untag(&a.id, &a.tag, actor)))),
        "move_message" => change(
            args::<MoveArgs>(arguments).and_then(|a| json_of(mailbox.move_message(&a.id, &Placement { workspace: a.workspace, folder: a.folder }, actor))),
        ),
        "list_tags" => read(json_of(mailbox.tags())),
        "list_rules" => read(json_of(mailbox.rules())),
        "add_rule" => change(args::<RuleArgs>(arguments).and_then(|a| json_of(mailbox.save_rule(a.rule, actor)))),
        "delete_rule" => {
            change(args::<IdArgs>(arguments).and_then(|a| json_of(mailbox.delete_rule(&a.id, actor).map(|deleted| json!({ "deleted": deleted })))))
        }
        "apply_rules" => change(json_of(mailbox.apply_rules_to_stored(actor).map(|changed| json!({ "changed": changed })))),
        "wait_for_message" => read(args::<WaitArgs>(arguments).and_then(|a| wait_for_message(mailbox, &a))),
        "recent_activity" => read(args::<LimitArgs>(arguments).and_then(|a| json_of(mailbox.activity(limit_of(a.limit))))),
        other => read(Err(format!("there is no tool named {other}; call tools/list to see them"))),
    }
}

/// Polls for a message newer than the call that matches the filter.
fn wait_for_message(mailbox: &Mailbox, args: &WaitArgs) -> Result<Value, String> {
    let seen: Vec<String> = mailbox
        .search(args.query.as_deref().unwrap_or(""), args.workspace.as_deref(), false, MAX_LIMIT)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|message| message.id)
        .collect();
    let deadline = Instant::now() + Duration::from_secs(args.timeout_seconds.unwrap_or(30).clamp(1, MAX_WAIT_SECONDS));
    while Instant::now() < deadline {
        thread::sleep(WAIT_POLL);
        let found = mailbox.search(args.query.as_deref().unwrap_or(""), args.workspace.as_deref(), false, MAX_LIMIT).map_err(|error| error.to_string())?;
        if let Some(message) = found.into_iter().find(|message| !seen.contains(&message.id)) {
            return json_of(mailbox.read_message(&message.id));
        }
    }
    Ok(json!({ "message": null, "timedOut": true }))
}

fn limit_of(limit: Option<usize>) -> usize {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn limited<T>(mut list: Vec<T>, limit: Option<usize>) -> Vec<T> {
    list.truncate(limit_of(limit));
    list
}

fn args<T: DeserializeOwned>(arguments: Value) -> Result<T, String> {
    serde_json::from_value(if arguments.is_null() { json!({}) } else { arguments }).map_err(|error| format!("the arguments are not right: {error}"))
}

fn json_of<T: serde::Serialize>(result: Result<T, crate::error::AppError>) -> Result<Value, String> {
    result.map_err(|error| error.to_string()).and_then(|value| serde_json::to_value(value).map_err(|error| error.to_string()))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListArgs {
    workspace: String,
    folder: Option<String>,
    limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SearchArgs {
    query: String,
    workspace: Option<String>,
    #[serde(default)]
    unread_only: bool,
    limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdArgs {
    id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdsArgs {
    ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TagArgs {
    id: String,
    tags: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UntagArgs {
    id: String,
    tag: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MoveArgs {
    id: String,
    workspace: String,
    folder: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RuleArgs {
    rule: Rule,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WaitArgs {
    workspace: Option<String>,
    query: Option<String>,
    timeout_seconds: Option<u64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LimitArgs {
    limit: Option<usize>,
}
