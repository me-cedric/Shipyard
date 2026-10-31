// security-report: merge the scan reports into one Markdown table and apply the gate.
// Usage: node security-report.mjs <reports-dir> <summary-file>
// A missing or unreadable report fails the gate. It never counts as "clean".
// The table lists file, line and rule only. It never prints a secret value.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const [dir = 'reports', out = 'security-summary.md'] = process.argv.slice(2)
const MAX_ROWS = 150
const ORDER = ['CRITICAL', 'HIGH', 'ERROR', 'SECRET', 'MEDIUM', 'WARNING', 'LOW', 'INFO', 'UNKNOWN']
const rows = []
const gate = []

function load(name, tool) {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'))
  } catch {
    gate.push(`${tool}: no valid report (${name})`)
    return null
  }
}

function level(score, text) {
  if (score >= 9) return 'CRITICAL'
  if (score >= 7) return 'HIGH'
  if (score >= 4) return 'MEDIUM'
  if (score > 0) return 'LOW'
  const t = String(text ?? '').toUpperCase()
  return t === 'MODERATE' ? 'MEDIUM' : ORDER.includes(t) ? t : 'UNKNOWN'
}

const osv = load('osv.json', 'osv')
let osvCritical = 0
for (const res of osv?.results ?? []) {
  for (const p of res.packages ?? []) {
    for (const v of p.vulnerabilities ?? []) {
      const group = (p.groups ?? []).find((g) => g.ids?.includes(v.id))
      const score = Number.parseFloat(group?.max_severity)
      const fixed = (v.affected ?? [])
        .filter((a) => a.package?.name === p.package.name)
        .flatMap((a) => a.ranges ?? [])
        .flatMap((r) => r.events ?? [])
        .find((e) => e.fixed)?.fixed
      const sev = level(score, v.database_specific?.severity)
      if (score >= 9) osvCritical++
      rows.push(['osv', sev, `${p.package.name}@${p.package.version} (${v.id})`, basename(res.source?.path ?? ''), fixed ?? '-'])
    }
  }
}
if (osvCritical) gate.push(`osv: ${osvCritical} finding(s) with CVSS 9.0 or more`)

const audit = load('pnpm-audit.json', 'pnpm audit')
let auditHigh = 0
for (const a of Object.values(audit?.advisories ?? {})) {
  const sev = level(0, a.severity)
  if (sev === 'HIGH' || sev === 'CRITICAL') auditHigh++
  rows.push(['pnpm audit', sev, `${a.module_name} (${a.github_advisory_id ?? a.id})`, 'pnpm-lock.yaml', a.patched_versions || '-'])
}
if (audit && !audit.advisories && !audit.metadata) gate.push('pnpm audit: no valid report (pnpm-audit.json)')
if (auditHigh) gate.push(`pnpm audit: ${auditHigh} high or critical advisory(ies)`)

const semgrep = load('semgrep.json', 'semgrep')
let semgrepError = 0
for (const r of semgrep?.results ?? []) {
  const sev = level(0, r.extra?.severity)
  if (sev === 'ERROR') semgrepError++
  rows.push(['semgrep', sev, r.check_id, `${r.path}:${r.start?.line ?? '?'}`, r.extra?.fix ?? '-'])
}
if (semgrepError) gate.push(`semgrep: ${semgrepError} ERROR finding(s)`)

const leaks = load('gitleaks.json', 'gitleaks')
if (leaks && !Array.isArray(leaks)) gate.push('gitleaks: no valid report (gitleaks.json)')
for (const l of Array.isArray(leaks) ? leaks : []) {
  rows.push(['gitleaks', 'SECRET', l.RuleID, `${l.File}:${l.StartLine}`, 'Revoke the secret, then remove it from the history'])
}
if (Array.isArray(leaks) && leaks.length) gate.push(`gitleaks: ${leaks.length} secret(s)`)

rows.sort((a, b) => ORDER.indexOf(a[1]) - ORDER.indexOf(b[1]))
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 120)
const lines = ['## Security scan', '']
if (!rows.length && !gate.length) lines.push('No findings.')
if (gate.length) lines.push('**Gate failed:**', '', ...gate.map((g) => `- ${g}`), '')
if (rows.length) {
  lines.push('| Tool | Severity | Package or rule | File | Fix |', '|---|---|---|---|---|')
  for (const r of rows.slice(0, MAX_ROWS)) lines.push(`| ${r.map(cell).join(' | ')} |`)
  if (rows.length > MAX_ROWS) lines.push('', `${rows.length - MAX_ROWS} more finding(s) are in the run artifacts.`)
}
const md = `${lines.join('\n')}\n`
writeFileSync(out, md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
if (process.env.GITHUB_OUTPUT) {
  const clean = !rows.length && !gate.length
  appendFileSync(process.env.GITHUB_OUTPUT, `clean=${clean}\ngate=${gate.join('; ')}\n`)
}
console.log(md)
