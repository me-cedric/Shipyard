# Security and dependency plan (2026-10-31)

Owner request: up-to-date Rust, React and other versions, no known CVE and no OWASP finding, and a scheduled job that checks for both, as parcus-plus does.

## Scan on 2026-10-31

Toolchain: rustc 1.99.1, Node 26.12.1 (CI uses Node 24), pnpm 11.9.0.

`osv-scanner scan --lockfile Cargo.lock`: 12 crates, 19 advisories.

| Crate | Version | Advisory | Fix |
|---|---|---|---|
| zip | 8.6.0 | GHSA-m665-v7pm-7grj (CVSS 10.0), RUSTSEC-2026-0369 (9.1), five others | direct dependency of `shipyard-store`: upgrade to 9.0.5 or later |
| glib | 0.18.5 | RUSTSEC-2024-0429 (6.9) | Linux GTK stack of Tauri: upgrade Tauri and wry; else document as not reachable |
| unsafe-libyaml, serde_yaml | 0.2.11, 0.9.34 | RUSTSEC-2024-0449 (unmaintained) | `serde_yaml` is deprecated: move `shipyard-core`, `-store`, `-engine` to a maintained fork (`serde_norway` or `serde_yml` successor) after a check of each |
| paste, proc-macro-error, rustls-pemfile | — | unmaintained | transitive: upgrade parents; else list in `.osv-scanner.toml` with a reason |
| zbus_names, zvariant, zvariant_derive | 3.x to 5.x | RUSTSEC-2026-0370 to -0372 | transitive (Linux D-Bus): upgrade parents |

`pnpm audit --prod`: 12 advisories (7 high, 4 moderate, 1 low), all under `@excalidraw/excalidraw`: `nanoid` (3.x and 5.x), `lodash-es`, `katex`. Fix: upgrade Excalidraw; else `pnpm.overrides` to the patched versions, then test the Excalidraw and Mermaid boards.

`pnpm outdated`: small updates for biome, react-virtual, @types/node, motion. `@tanstack/react-table` 9 is a major upgrade: separate task with its own tests.

## Steps

1. After the W12 stage 1 fixes are committed (they also change `Cargo.lock`): one worker upgrades Rust crates (`cargo update`, then direct dependencies to their latest compatible majors, `zip` 9), and npm packages (`pnpm update`, overrides), and runs the full suite.
2. Replace `serde_yaml` with a maintained crate in one change, with the codec tests as proof.
3. Scheduled security workflow `.github/workflows/security.yml` (Mon to Fri 02:00 UTC and on demand), next to the compass job:
   - `osv-scanner` on `Cargo.lock` and `pnpm-lock.yaml` (CVE).
   - `pnpm audit --prod --audit-level high`.
   - Semgrep OSS with the `p/owasp-top-ten`, `p/typescript`, `p/react` and `p/rust` rule sets (OWASP), with no account and no token.
   - gitleaks on the full history (secrets).
   - One tracking issue "Security scan findings" that the job creates or updates with a summary table, and closes when the scan is clean (as in parcus-plus). The job uses `GITHUB_TOKEN` with `issues: write` only.
4. Renovate already runs (`renovate.json`): add a rule that groups security updates and labels them, and lets Renovate open them at once.
5. Gate in CI: a finding with CVSS 9.0 or more fails the scheduled job; a high npm advisory fails it too.

## Rules

- No secret in the workflow. Actions are pinned to a major version, as the other workflows do.
- An accepted advisory goes in `.osv-scanner.toml` with a reason and a review date, never silently.
