---
status: proposed
date: 2026-10-29
decision-makers: [Cédric Meyer]
---
# Excel crates and seal primitives for the Work space
## Context and problem statement
The Work space reads and writes the CGI costing workbook (REQ-012, REQ-013) and seals the estimate sheets and the day rates (REQ-005, REQ-014). The workspace holds no Excel crate. The plan says to raise an ADR before adding one.
## Considered options
- Excel: `calamine` (read) with `rust_xlsxwriter` (write).
- Excel: `umya-spreadsheet` (one crate, read and write, larger and slower).
- Excel: call a JavaScript library from the webview (no Rust test, no round trip in a unit test).
- Seal: `ring` (AES-256-GCM, PBKDF2-HMAC-SHA256).
- Seal: RustCrypto (`aes-gcm`, `pbkdf2`, `sha2`): three new crates and their trait crates.
## Decision outcome
Chosen options: `calamine` and `rust_xlsxwriter`, because each does one job, both are maintained, and the round trip runs in a Rust test. `ring`, because the workspace already builds it for `rustls`, so the seal adds no new compiled code. PBKDF2 uses 600,000 rounds. A salt and a nonce are random for each seal.
### Consequences
- `shipyard-store` depends on `calamine`, `rust_xlsxwriter`, `ring`, `base64` and `thiserror`.
- A sealed text is one line: `SHIPYARD-SEALED-v1:<salt>:<nonce>:<ciphertext>`. It stops a person who reads the file. It does not stop a person who has the passphrase. Sealing does not rewrite history, and a sealed file cannot merge.
- Argon2 is not used. Move to it when the OWASP guidance for PBKDF2 changes.
