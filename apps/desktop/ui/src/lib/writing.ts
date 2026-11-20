import { readWriting } from '../api/client'
import type { Profile, Template, Writing } from '../api/types'

/**
 * The templates and workspace profiles, kept here once read so a new message can start from them at once. Settings
 * and the compose window update it whenever they save.
 */
let known: Writing = { templates: [], profiles: {} }

/** Reads the templates and profiles again. */
export async function loadWriting(): Promise<Writing> {
  known = await readWriting()
  return known
}

/** Keeps what a save returned. */
export function keepWriting(writing: Writing): Writing {
  known = writing
  return writing
}

/** A workspace's profile, if it has one. */
export function profileOf(workspace: string | null): Profile | undefined {
  return workspace === null ? undefined : known.profiles[workspace]
}

/** The templates for a workspace: its own first, then those for every workspace. */
export function templatesFor(workspace: string | null): Template[] {
  return [...known.templates.filter((template) => template.workspace !== null && template.workspace === workspace), ...known.templates.filter((template) => template.workspace === null)]
}
