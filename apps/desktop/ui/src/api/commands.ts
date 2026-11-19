/** The Tauri command names. `apps/desktop/src-tauri/src/lib.rs` registers the same ones. */
export const COMMANDS = {
  listWorkspaces: 'list_workspaces',
  listMessages: 'list_messages',
  openMessage: 'open_message',
  markAllRead: 'mark_all_read',
  importFiles: 'import_files',
  routingPath: 'routing_path',
} as const

/** The files the import picker offers. */
export const IMPORT_EXTENSIONS = ['eml', 'mbox'] as const
