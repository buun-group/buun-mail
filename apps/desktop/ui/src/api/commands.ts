/** The Tauri command names. `apps/desktop/src-tauri/src/lib.rs` registers the same ones. */
export const COMMANDS = {
  listWorkspaces: 'list_workspaces',
  listMessages: 'list_messages',
  openMessage: 'open_message',
  markAllRead: 'mark_all_read',
  importFiles: 'import_files',
  routingPath: 'routing_path',
  tagMessage: 'tag_message',
  untagMessage: 'untag_message',
  listTags: 'list_tags',
  listRules: 'list_rules',
  saveRule: 'save_rule',
  deleteRule: 'delete_rule',
  applyRules: 'apply_rules',
  listActivity: 'list_activity',
  agentStatus: 'agent_status',
  setAgentEnabled: 'set_agent_enabled',
  regenerateAgentToken: 'regenerate_agent_token',
  gatewayStatus: 'gateway_status',
  connectGateway: 'connect_gateway',
  disconnectGateway: 'disconnect_gateway',
  checkGateway: 'check_gateway',
  gatewayDomains: 'gateway_domains',
  gatewayAvailableDomains: 'gateway_available_domains',
  addGatewayDomain: 'add_gateway_domain',
  removeGatewayDomain: 'remove_gateway_domain',
} as const

/** The files the import picker offers. */
export const IMPORT_EXTENSIONS = ['eml', 'mbox'] as const
