#!/usr/bin/env node
/**
 * Runs a command with rustup's proxies first on PATH, so `rust-toolchain.toml` picks the compiler even when a shell
 * puts a fixed toolchain ahead of them. Used by the dev and build scripts:
 *
 *   node tools/with-rustup.mjs tauri dev
 *
 * The proxies live in $CARGO_HOME/bin, or ~/.cargo/bin when CARGO_HOME is unset. Works on Linux, macOS and Windows.
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const [command, ...args] = process.argv.slice(2)
if (command === undefined) {
  process.stderr.write('usage: node tools/with-rustup.mjs <command> [args...]\n')
  process.exit(2)
}

const proxies = join(process.env.CARGO_HOME ?? join(homedir(), '.cargo'), 'bin')
const env = { ...process.env, PATH: `${proxies}${delimiter}${process.env.PATH ?? ''}` }

const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
child.on('exit', (code, signal) => process.exit(signal === null ? (code ?? 1) : 1))
