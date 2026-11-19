import type { Attachment, Contact, Draft, Message, Recipients, Sendable, Workspace } from '../api/types'
import { canSendAs, domainOf, signatureFor } from './sending'
import { formatFull } from './time'

/** How a compose window started: a new message, or an answer to or forward of one. */
export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

/** A message being written: what will be sent, how it started, and its draft id. */
export interface Composing {
  id: string
  mode: ComposeMode
  draft: Draft
  /** When it was last changed, for the drafts list. ISO time. */
  updatedAt: string
}

/** The message being answered or forwarded, as the reader holds it. */
export interface Original {
  message: Message
  body: string
  recipients: Recipients | null
  /** Its attachments, carried into a forward. */
  attachments?: Attachment[]
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u

/** True for something that looks like an email address. */
export function isAddress(text: string): boolean {
  return ADDRESS.test(text.trim())
}

/** A contact from what a person typed: `Name <a@b.com>`, `"Name" <a@b.com>` or `a@b.com`; null when it is not one. */
export function parseContact(text: string): Contact | null {
  const typed = text.trim().replace(/[,;]$/u, '')
  const named = /^"?([^"<]*?)"?\s*<([^>]+)>$/u.exec(typed)
  const address = (named?.[2] ?? typed).trim().toLowerCase()
  if (!isAddress(address)) return null
  const name = named?.[1]?.trim()
  return { name: name === undefined || name === '' ? null : name, address }
}

/** A contact as one line: `Name <address>` or the address. */
export function contactLine(contact: Contact): string {
  return contact.name === null ? contact.address : `${contact.name} <${contact.address}>`
}

/** `Re: subject`, without stacking `Re: Re:`. */
export function replySubject(subject: string): string {
  return /^re:/iu.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`
}

/** `Fwd: subject`, without stacking. */
export function forwardSubject(subject: string): string {
  return /^(fwd?|fw):/iu.test(subject.trim()) ? subject.trim() : `Fwd: ${subject.trim()}`
}

/** The original quoted under a reply: a line saying who wrote it and when, then each line marked with `>`. */
export function quote(original: Original, wrote: (when: string, who: string) => string): string {
  const who = contactLine({ name: original.message.fromName === original.message.from ? null : original.message.fromName, address: original.message.from })
  const lines = original.body.split('\n').map((line) => (line === '' ? '>' : `> ${line}`))
  return `${wrote(formatFull(original.message.receivedAt), who)}\n${lines.join('\n')}`
}

/** The original carried in a forward: its headers, then its text. */
export function forwardBlock(original: Original, labels: { title: string; from: string; date: string; subject: string; to: string }): string {
  const message = original.message
  return [`---------- ${labels.title} ----------`, `${labels.from}: ${contactLine({ name: message.fromName, address: message.from })}`, `${labels.date}: ${formatFull(message.receivedAt)}`, `${labels.subject}: ${message.subject}`, `${labels.to}: ${message.to}`, '', original.body].join('\n')
}

/** The text a new compose window starts with: room to write, the signature, then any quote or forward. */
export function startingText(signature: string, carried: string): string {
  const parts = ['', signature.trim() === '' ? '' : `-- \n${signature.trim()}`, carried].filter((part, index) => index === 0 || part !== '')
  return parts.join('\n\n')
}

/**
 * The addresses a message can be sent from, most fitting first: the address an answered message was sent to, then
 * each exact workspace address on a domain a sender covers. Each carries its workspace's name.
 */
export function fromChoices(workspaces: readonly Workspace[], sendable: readonly Sendable[], original: Original | null): Contact[] {
  const choices: Contact[] = []
  const nameFor = (address: string): string | null => workspaces.find((workspace) => workspace.addresses.some((pattern) => pattern === address || pattern === `*@${domainOf(address)}`))?.name ?? null
  const add = (address: string): void => {
    const clean = address.trim().toLowerCase()
    if (isAddress(clean) && canSendAs(clean, sendable) && !choices.some((choice) => choice.address === clean)) choices.push({ name: nameFor(clean), address: clean })
  }
  if (original !== null) add(original.message.to)
  workspaces.forEach((workspace) => workspace.addresses.filter((pattern) => !pattern.includes('*')).forEach(add))
  return choices
}

/** Everyone a Reply all goes to besides the sender: the original's To and Cc, without the person's own address. */
export function replyAllCc(original: Original, own: string): Contact[] {
  const everyone = [...(original.recipients?.to ?? []), ...(original.recipients?.cc ?? [])]
  const seen = new Set([own.toLowerCase(), original.message.from.toLowerCase()])
  return everyone.filter((person) => {
    const address = person.address.toLowerCase()
    if (seen.has(address)) return false
    seen.add(address)
    return true
  })
}

/** Where a reply goes: the original's Reply-To when it has one, otherwise its sender. */
export function replyTarget(original: Original): Contact[] {
  const replyTo = original.recipients?.replyTo ?? []
  return replyTo.length > 0 ? replyTo : [{ name: original.message.fromName === original.message.from ? null : original.message.fromName, address: original.message.from }]
}

export { signatureFor }
