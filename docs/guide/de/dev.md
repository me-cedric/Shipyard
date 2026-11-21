# Entwicklerhandbuch

## Voraussetzungen

- Node 24 oder neuer, mit pnpm 11 (`corepack enable`).
- Rust stable. Unter Linux die Systembibliotheken von Tauri: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `crates/` | Rust-Workspace. Die Fachlogik in `shipyard-core` hat keine Ein- und Ausgabe. |
| `crates/shipyard-app/` | Tauri-Hülle: `tauri.conf.json`, `capabilities/`, `icons/`, Befehle in `src/commands/`. |
| `src/ui/` | Design-System: `tokens`, `icons`, `atoms`, `molecules`, `organisms`, `templates`, `gallery`. Lange Listen nutzen `VirtualList` und `DataTable` (TanStack Virtual und Table). |
| `src/features/<space>/` | Ein Ordner pro Themengebiet, zum Beispiel `flow`, `crew` oder `code`. Ein Ort des Menüs kann Teile aus mehreren Ordnern zeigen. Ein Feature importiert nur `@/ui`, `@/lib` und seinen eigenen Ordner. |
| `src/lib/ipc/` | Generierte Bindings und die Mock-Schicht. |
| `src/lib/i18n/` | Die Kataloge für Englisch, Französisch, Deutsch und Spanisch. Jeder hat den Typ von `en.ts`. |
| `e2e/` | Playwright-Tests auf dem Vite-Release-Build, mit dem Mock-IPC. |
| `docs/guide/` | Seiten für Nutzer, eine pro Ort, und diese Anleitung. `docs/guide/fr/`, `de/` und `es/` haben die französischen, deutschen und spanischen Seiten, mit denselben Dateinamen und denselben Überschriften. |

## Ausführen

```bash
pnpm install
pnpm dev          # UI in a browser on http://localhost:1420, with the mock IPC
pnpm tauri dev    # desktop app
```

Die Galerie liegt unter `/dev/gallery`, nur im Dev-Build.

## IPC

1. Fügen Sie einen Befehl in `crates/shipyard-app/src/commands/<feature>.rs` hinzu (die Befehle für die Arbeit liegen in `crates/shipyard-app/src/work.rs`, neben dem Zustand, den sie halten; die Befehle für die Läufe liegen in `factory.rs`, `questions.rs` und `delivery.rs` desselben Ordners) und registrieren Sie ihn im specta-Builder in `src/lib.rs`. Ein Befehl ist `async`, nimmt `app: AppHandle` und gibt `Result<T, String>` zurück. Legen Sie die Logik in eine einfache Funktion über `&AppState`, sodass ein Unit-Test keine Tauri-Laufzeit braucht. Ein TypeScript-Aufruf gibt ein Ergebnisobjekt zurück: Lesen Sie es mit `unwrap` aus `@/lib/ipc`.
2. Führen Sie `pnpm ipc:gen` aus. Es führt `cargo test --workspace` aus und schreibt `src/lib/ipc/bindings.ts`. Bearbeiten Sie diese Datei nicht.
3. Fügen Sie den Mock-Handler in `src/lib/ipc/mock.ts` hinzu. Ein Handler erhält die Argumente der Reihe nach und gibt die Daten zurück. `pnpm typecheck` schlägt fehl, bis jeder Befehl einen Handler hat. Tests beginnen mit einem leeren Mock (`resetMock`) und lesen ihn mit `mockState()`.

Außerhalb von Tauri installiert `src/main.tsx` den Mock, sodass Vite, Vitest und Playwright ohne Rust laufen. Die Mock-Ordnerauswahl gibt der Reihe nach `/mock/alpha`, `/mock/beta` und `/mock/gamma` zurück. Der Mock-Dateidialog für Excel gibt `/mock/costing.xlsx` zurück, oder einmal den Pfad in `mockState().nextFile`. Ein Pfad mit `bad` darin gibt eine Arbeitsmappe mit einer abgelehnten Zeile.

## App-Daten

Der Zustand des Rechners liegt im App-Datenordner: `prefs.json` (Design, Sprache, Rolle), `registry.json` (Projekte, letzte Ansicht, Überschreibungen), `connections.json` (die Einstellungen jeder Verbindung zu einem Ticketsystem und einer Code-Plattform, kein Geheimnis), `agents.json` (die MCP-Konfiguration, die Modellanbieter und die Modellstufen jedes Runners, kein Geheimnis), `mirror.sqlite` (die Tickets und Pull Requests der Sync-Engine, die Claims und der Ereignis-Ausgang, beim nächsten Tick neu gebaut), `runs.sqlite` (das Lauf-Protokoll, nur anhängend, und der gespeicherte Zustand jedes Laufs), `agents/<run>/<step>/` (die private MCP-Datei und der Auftrag eines laufenden Schritts, entfernt, wenn der Schritt endet), `worktrees/<project>/<run>/` (der Lauf-Ordner und die Kind-Worktrees eines Laufs, außerhalb der Arbeitskopie), `gates/` (die Ausgabe eines Prüfbefehls, während er läuft), `machine-id` (der Name dieser Installation in einem Claim-Stempel) und `refs/<project id>.sqlite` (der Ref-Index, bei Bedarf neu gebaut). Das Repository enthält die Dateien von `.shipyard/`: `project.yaml`, `automation.yaml`, `workflows/` und `roles/` (die App legt die beiden letzten beim ersten Gebrauch eines Projekts an). Jedes Verbindungsgeheimnis liegt im Schlüsselbund des Betriebssystems unter `conn:<id>`; ein MCP-Feld unter `conn:<server>/<field>`. `prefs.json` enthält auch `releaseUrl`, die Adresse, die die Update-Prüfung liest. `.shipyard/project.yaml` kann die Verbindungs-ids des Ticketsystems und der Code-Plattform und den Bereich des Ticketsystems nennen (`connections.trackerScope`).

Die App antwortet auf `shipyard --mcp-relay <server-id>` (Binärdatei `shipyard`, Crate `shipyard-cli`) auf einem Socket in `relay/` des App-Datenordners. `SHIPYARD_DATA_DIR` ersetzt den Ordner.

## Projektimport

`shipyard_store::project_import::import(source, root)` liest ein Repository mit dem bestehenden Aufbau und schreibt Shipyard-Dateien in das Projekt (Befehl `project_import`, Spezifikation `projects` REQ-014, REQ-015). Es liest nur die Standardpfade (Q-091).

| Quelle | Shipyard |
|---|---|
| Ordnername und `docs/delivery/tickets.config.json` (`projectKey`) | `.shipyard/project.yaml` (Name, Schlüssel, `connections.trackerScope` für Jira) |
| `docs/planning/team.json`, `docs/personas/personas.json` | `.shipyard/team.yaml` (der Persona-Name ist die Rolle) |
| `docs/costing/<name>.json` | `docs/costing/<name>.yaml` |
| `docs/decisions/`, `docs/delivery/questions/`, `docs/openspec/` | derselbe Pfad, derselbe Text |

Der Import ersetzt nie eine Datei und ändert nie die Quelle. Ein Ziel, das existiert, ist ein Konflikt (Q-090). Eine Datei, die er nicht lesen oder umwandeln kann, wird mit einem Grund übersprungen. Ein Symlink und eine Datei über 2 MiB werden übersprungen.

## Sidecar

Der Eintrag der MCP-Brücke startet die Binärdatei `shipyard` (Crate `shipyard-cli`) neben der Binärdatei der App (`cli_path` in `crates/shipyard-app/src/factory.rs`). Ein Release-Build liefert sie als Tauri-Sidecar `externalBin` aus:

```bash
pnpm tauri:release   # tauri build with crates/shipyard-app/tauri.release.conf.json
pnpm build:sidecar   # only the sidecar: crates/shipyard-app/binaries/shipyard-<triple>
```

`scripts/build-sidecar.ts` baut die CLI im Release-Modus für das Ziel-Triple und kopiert sie nach `crates/shipyard-app/binaries/` (git ignoriert den Ordner). `tauri.release.conf.json` führt es als `beforeBuildCommand` aus. `tauri.conf.json` hat kein `externalBin`, sodass `pnpm build`, `pnpm tauri dev` und `cargo test` keinen Sidecar brauchen (Q-092). Ein Dev-Build nutzt `shipyard` aus dem `PATH`.

## End-to-End-Tests

`pnpm test:e2e` baut die App mit `VITE_MOCK_DEMO=0` und liefert sie auf Port 4174 aus. Eine Datei deckt jeden Bereich ab, zum Beispiel `e2e/work.spec.ts`. Führen Sie eine Datei mit `pnpm playwright test e2e/<name>.spec.ts` aus.

- `e2e/a11y.spec.ts` führt axe (`@axe-core/playwright`) auf jedem Abschnitt jedes Ortes und auf den Seiten außerhalb der Abschnittsumschalter aus, im hellen und im dunklen Design, mit reduzierter Bewegung, in einem Fenster von 960 mal 600 px. Ein Verstoß lässt den Test fehlschlagen. Ein Bedienelement unter 44 px Höhe und eine Seite, die seitwärts scrollt, lassen ihn auch fehlschlagen. Ein neuer Abschnitt wird Teil des Laufs, wenn Sie ihn in `PLACES` in `src/features/shell/places.ts` eintragen. Eine Seite außerhalb der Umschalter kommt über `OFF_SWITCH` des Tests hinzu.
- `e2e/design-system.spec.ts` deckt die Galerie ab: eine Seite für jede atomare Schicht, ein Fokusrahmen an jeder Schicht-Schaltfläche, der Design- und Sprachumschalter, und axe auf jeder Schicht in beiden Designs. Die Galerie existiert nur im Dev-Build. Der Test startet seinen eigenen `vite`-Dev-Server auf Port 4175. Er prüft, dass der Release-Build keine Galerie-Route hat.
- `pnpm test:personas` geht die erste Stunde jedes Profils durch (Projektleitung, Architekt, Entwickler, Tester, Business-Analyst, fachlicher Leiter, Junior) im Demo-Build. Es nutzt `playwright.personas.config.ts` und `e2e/personas/*.persona.ts`, und `pnpm test:e2e` führt es nicht aus. Setzen Sie `PERSONAS_OUT` auf einen Ordner: Jedes Profil schreibt einen Screenshot für jeden Schritt und ein Protokoll mit den Klicks und dem Ergebnis jedes Schritts (ok, verwirrend, Sackgasse, Fehler). Ein Schritt, den die App nicht ausführen kann, lässt den Lauf weich fehlschlagen, und der Durchgang geht weiter.

## Prüfungen

```bash
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm ipc:check
```

`pnpm ipc:check` schlägt fehl, wenn die eingecheckten Bindings von den Rust-Befehlen abweichen. Die CI führt alle Prüfungen unter macOS und Linux aus (`.github/workflows/ci.yml`).

## Abnahme

Das Seed-Skript legt ein Beispielprojekt mit einer Datei für jede Art von Artefakt an, das die App liest. Die Live-Tests rufen die echten Befehlsfunktionen der App gegen GitHub auf.

1. Melden Sie sich mit der GitHub-CLI an: `gh auth login`.
2. Legen Sie das Beispielprojekt und sein privates Repository `me-cedric/shipyard-acceptance` an oder aktualisieren Sie es:

```bash
node scripts/acceptance/seed.ts --remote github
```

Das Skript schreibt `~/Projects/shipyard-acceptance` (nutzen Sie `--dir <folder>` für einen anderen Ordner). Es ist sicher, es zweimal auszuführen: Der zweite Lauf ändert nichts. Ohne `--remote` legt es kein Repository und kein Ticket an. Mit `--remote github` pusht es auch den Branch `main` und legt das Label `agent`, den Meilenstein `Release 1` und vier Tickets an. Es liest kein Token. Git meldet sich über `gh auth git-credential` an.

3. Führen Sie die Live-Tests aus:

```bash
SHIPYARD_LIVE=1 GH_TOKEN=$(gh auth token) \
  cargo test -p shipyard-app --test it live_github -- --test-threads=1 --nocapture
```

Ohne `SHIPYARD_LIVE=1` gibt jeder Test `skipped` aus und besteht, sodass die CI grün bleibt. Schreiben Sie das Token nie in eine Datei oder in ein Befehlsargument.

Jeder Test arbeitet auf einer Kopie des Beispielprojekts in einem temporären Ordner. Die Tests decken das Seed-Projekt (alle Leser), das Ticketsystem (auflisten, anlegen, Label, zuweisen, kommentieren, verschieben, Spiegel nach einem Sync), die Code-Plattform (Branch, Pull Request, Dateien, Prüfungen, Kommentar, Änderungen anfordern, schließen), das Spezifikationsarchiv in einem Pull Request, und die Veröffentlichung eines lokalen Projekts nach `me-cedric/shipyard-acceptance-publish` ab. Ein Test schließt den Pull Request und löscht den Branch, den er geöffnet hat. Die Repositories und das Ticket `Live test issue` bleiben.

Ein Rechner hinter einem Proxy, der seine eigenen Zertifikate signiert, braucht `SHIPYARD_CA_BUNDLE=<certificate file>` im selben Befehl. `SHIPYARD_SEED_DIR` nennt ein Beispielprojekt in einem anderen Ordner.

## Sicherheitsscan

`.github/workflows/security.yml` läuft Montag bis Freitag um 02:00 UTC und bei Bedarf (`workflow_dispatch`). Es hat vier Jobs:

- `deps`: `osv-scanner` auf `Cargo.lock` und `pnpm-lock.yaml`, und `pnpm audit --prod`.
- `owasp`: Semgrep OSS mit den Regelsätzen OWASP, TypeScript, React, Rust und Secrets. Es braucht kein Konto.
- `secrets`: gitleaks auf dem ganzen Verlauf. Der Bericht verbirgt jeden geheimen Wert.
- `report`: schreibt eine Tabelle in die Zusammenfassung des Laufs, und öffnet, aktualisiert oder schließt das Ticket „Security scan findings“ (Label `security`).

Der Lauf schlägt fehl bei einem Befund mit CVSS 9.0 oder mehr, einem npm-Hinweis der Stufe hoch oder kritisch, einem Semgrep-`ERROR`, oder einem Geheimnis. Er schlägt auch fehl, wenn ein Scan keinen Bericht liefert. Um einen Hinweis zu akzeptieren, fügen Sie `.osv-scanner.toml` einen Eintrag `[[IgnoredVulns]]` mit einem Grund und einem Prüfdatum hinzu. Führen Sie den OSV-Scan auf Ihrem Rechner aus mit `osv-scanner scan --lockfile=Cargo.lock --lockfile=pnpm-lock.yaml --config=.osv-scanner.toml`.

Renovate öffnet Sicherheitsupdates sofort und versieht sie mit dem Label `security` (`renovate.json`).

## Symbole

Die App-Symbole kommen aus `docs/assets/logo.svg`:

```bash
pnpm tauri icon docs/assets/logo.svg -o crates/shipyard-app/icons
```

Behalten Sie nur die Desktop-Dateien, die `bundle.icon` in `tauri.conf.json` listet.
