#!/usr/bin/env node
/**
 * Static audit: file bytes must never be sent over the network.
 * Fails if FormData / file body patterns appear as live code, or if fetch
 * is used outside the allowlist.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

const FETCH_ALLOW = new Set([
  'src/lib/nimiqRpc.ts',
  'src/lib/onlineLookup.ts',
  'src/lib/nimiqRpc.test.ts',
  'src/lib/onlineLookup.test.ts',
])

// Docs-only files may mention forbidden APIs as audit instructions.
const DOCS_MENTION_OK = new Set(['src/components/TrustPanel.tsx'])

const FORBIDDEN = [
  { re: /\bnew\s+FormData\b/, msg: 'new FormData() (upload pattern)' },
  { re: /\bnew\s+XMLHttpRequest\b/, msg: 'new XMLHttpRequest()' },
  { re: /\.append\s*\(\s*['"]file['"]/, msg: 'file form field' },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

let failed = false
const files = walk(SRC)

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  const text = readFileSync(file, 'utf8')

  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) {
      console.error(`FAIL ${rel}: ${rule.msg}`)
      failed = true
    }
  }

  if (/\bfetch\s*\(/.test(text) && !FETCH_ALLOW.has(rel)) {
    // Trust panel only documents the string "fetch" for auditors
    if (DOCS_MENTION_OK.has(rel) && !/await\s+fetch\s*\(|fetch\s*\(\s*['"`/]/.test(text)) {
      continue
    }
    console.error(`FAIL ${rel}: fetch() outside allowlist (${[...FETCH_ALLOW].join(', ')})`)
    failed = true
  }
}

const online = readFileSync(join(SRC, 'lib/onlineLookup.ts'), 'utf8')
if (!/JSON\.stringify\(\{\s*sha256/.test(online)) {
  console.error('FAIL onlineLookup.ts: expected JSON body { sha256 }')
  failed = true
}
if (/arrayBuffer|FormData/.test(online)) {
  console.error('FAIL onlineLookup.ts: must not reference file bytes')
  failed = true
}

const rpc = readFileSync(join(SRC, 'lib/nimiqRpc.ts'), 'utf8')
if (/arrayBuffer|FormData|File\b/.test(rpc)) {
  console.error('FAIL nimiqRpc.ts: must not reference File / arrayBuffer')
  failed = true
}

if (failed) {
  console.error('\nAudit failed.')
  process.exit(1)
}
console.log('Audit OK: no file-upload patterns; fetch limited to RPC + optional hash lookup.')
