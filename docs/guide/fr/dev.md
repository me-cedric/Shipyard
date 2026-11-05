# Guide du développeur

## Prérequis

- Node 24 ou plus récent, avec pnpm 11 (`corepack enable`).
- Rust stable. Sous Linux, les bibliothèques système de Tauri : `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`.

## Organisation

| Chemin | Contenu |
|---|---|
| `crates/` | Espace de travail Rust. La logique métier de `shipyard-core` n'a pas d'entrées-sorties. |
| `crates/shipyard-app/` | Coque Tauri : `tauri.conf.json`, `capabilities/`, `icons/`, commandes dans `src/commands/`. |
| `src/ui/` | Système de design : `tokens`, `icons`, `atoms`, `molecules`, `organisms`, `templates`, `gallery`. Les longues listes utilisent `VirtualList` et `DataTable` (TanStack Virtual et Table). |
| `src/features/<space>/` | Un dossier par espace. Une fonctionnalité importe seulement `@/ui`, `@/lib` et son propre dossier. |
| `src/lib/ipc/` | Les liaisons générées et la couche de simulation. |
| `src/lib/i18n/` | Les catalogues anglais et français. `fr.ts` a le type de `en.ts`. |
| `e2e/` | Tests Playwright sur la version de production de Vite, avec l'IPC simulé. |
| `docs/guide/` | Les pages pour les utilisateurs, une par espace, et ce guide. `docs/guide/fr/` a les pages françaises, avec les mêmes noms de fichier. |

## Lancer

```bash
pnpm install
pnpm dev          # UI in a browser on http://localhost:1420, with the mock IPC
pnpm tauri dev    # desktop app
```

La galerie est à `/dev/gallery`, dans la version de développement seulement.

## IPC

1. Ajoutez une commande dans `crates/shipyard-app/src/commands/<feature>.rs` (les commandes de Travail sont dans `crates/shipyard-app/src/work.rs`, à côté de l'état qu'elles gardent ; les commandes de l'Usine sont dans `factory.rs`, `questions.rs` et `delivery.rs` du même dossier) et enregistrez-la dans le constructeur specta de `src/lib.rs`. Une commande est `async`, prend `app: AppHandle` et renvoie `Result<T, String>`. Mettez la logique dans une fonction simple sur `&AppState`, pour qu'un test unitaire n'ait pas besoin de Tauri. Un appel TypeScript renvoie un objet résultat : lisez-le avec `unwrap` de `@/lib/ipc`.
2. Lancez `pnpm ipc:gen`. Il lance `cargo test --workspace` et écrit `src/lib/ipc/bindings.ts`. Ne modifiez pas ce fichier.
3. Ajoutez le gestionnaire simulé dans `src/lib/ipc/mock.ts`. Un gestionnaire reçoit les arguments dans l'ordre et renvoie les données. `pnpm typecheck` échoue tant que chaque commande n'a pas de gestionnaire. Les tests partent d'une simulation vide (`resetMock`) et la lisent avec `mockState()`.

Hors de Tauri, `src/main.tsx` installe la simulation, donc Vite, Vitest et Playwright tournent sans Rust. Le sélecteur de dossier simulé renvoie tour à tour `/mock/alpha`, `/mock/beta` et `/mock/gamma`. La boîte de dialogue de fichier Excel simulée renvoie `/mock/costing.xlsx`, ou une fois le chemin de `mockState().nextFile`. Un chemin qui contient `bad` donne un classeur avec une ligne refusée.

## Données de l'application

L'état de la machine est dans le dossier de données de l'application : `prefs.json` (thème, langue, rôle), `registry.json` (projets, dernière vue, surcharges), `connections.json` (les réglages de chaque connexion à un outil de suivi des tickets et à un hébergeur de code, sans secret), `agents.json` (la configuration MCP, les fournisseurs de modèles et les niveaux de modèle de chaque exécuteur, sans secret), `mirror.sqlite` (les tickets et les pull requests du moteur de synchronisation, les réservations et la file d'événements, reconstruits au prochain cycle), `runs.sqlite` (le journal des exécutions, en ajout seul, et l'état enregistré de chaque exécution), `agents/<run>/<step>/` (le fichier MCP privé et la consigne d'une étape en cours, supprimés à la fin de l'étape), `worktrees/<project>/<run>/` (le dossier d'exécution et les copies de travail enfants d'une exécution, hors de la copie de travail), `gates/` (la sortie d'une commande de contrôle pendant qu'elle tourne), `machine-id` (le nom de cette installation dans un cachet de réservation) et `refs/<project id>.sqlite` (l'index des réfs, reconstruit à la demande). Le dépôt contient les fichiers `.shipyard/` : `project.yaml`, `automation.yaml`, `workflows/` et `roles/` (l'application crée les deux derniers à la première utilisation d'un projet). Chaque secret de connexion vit dans le trousseau du système sous `conn:<id>` ; un champ MCP sous `conn:<server>/<field>`. `prefs.json` contient aussi `releaseUrl`, l'adresse que la recherche de mises à jour lit. `.shipyard/project.yaml` peut nommer les identifiants des connexions à l'outil de suivi des tickets et à l'hébergeur de code, et la portée de l'outil de suivi des tickets (`connections.trackerScope`).

L'application répond à `shipyard --mcp-relay <server-id>` (binaire `shipyard`, crate `shipyard-cli`) sur un socket dans `relay/` du dossier de données. `SHIPYARD_DATA_DIR` remplace le dossier.

## Import de projet

`shipyard_store::project_import::import(source, root)` lit un dépôt avec l'organisation existante et écrit des fichiers Shipyard dans le projet (commande `project_import`, spécification `projects` REQ-014, REQ-015). Il lit seulement les chemins par défaut (Q-091).

| Source | Shipyard |
|---|---|
| nom du dossier et `docs/delivery/tickets.config.json` (`projectKey`) | `.shipyard/project.yaml` (nom, clé, `connections.trackerScope` pour Jira) |
| `docs/planning/team.json`, `docs/personas/personas.json` | `.shipyard/team.yaml` (le nom du persona est le rôle) |
| `docs/costing/<name>.json` | `docs/costing/<name>.yaml` |
| `docs/decisions/`, `docs/delivery/questions/`, `docs/openspec/` | même chemin, même texte |

L'import ne remplace jamais un fichier et ne change jamais la source. Une cible qui existe est un conflit (Q-090). Un fichier qu'il ne peut ni lire ni convertir est ignoré, avec une raison. Un lien symbolique et un fichier de plus de 2 Mio sont ignorés.

## Sidecar

L'entrée du pont MCP lance le binaire `shipyard` (crate `shipyard-cli`) à côté du binaire de l'application (`cli_path` dans `crates/shipyard-app/src/factory.rs`). Une version de production le livre comme sidecar `externalBin` de Tauri :

```bash
pnpm tauri:release   # tauri build with crates/shipyard-app/tauri.release.conf.json
pnpm build:sidecar   # only the sidecar: crates/shipyard-app/binaries/shipyard-<triple>
```

`scripts/build-sidecar.ts` compile la CLI en mode production pour le triplet cible et la copie dans `crates/shipyard-app/binaries/` (git ignore le dossier). `tauri.release.conf.json` le lance comme `beforeBuildCommand`. `tauri.conf.json` n'a pas d'`externalBin`, donc `pnpm build`, `pnpm tauri dev` et `cargo test` n'ont pas besoin du sidecar (Q-092). Une version de développement utilise `shipyard` du `PATH`.

## Tests de bout en bout

`pnpm test:e2e` compile l'application avec `VITE_MOCK_DEMO=0` et la sert sur le port 4174. Un fichier couvre chaque espace, par exemple `e2e/work.spec.ts`. Lancez un seul fichier avec `pnpm playwright test e2e/<name>.spec.ts`.

- `e2e/a11y.spec.ts` lance axe (`@axe-core/playwright`) sur chaque onglet de chaque espace, en thème clair et sombre, avec un mouvement réduit. Une violation fait échouer le test. Un nouvel onglet entre dans le lot quand vous l'ajoutez à `SPACES` dans `src/features/shell/spaces.ts`.
- `e2e/design-system.spec.ts` couvre la galerie : une page pour chaque couche atomique, un anneau de focus sur chaque bouton de couche, le changement de thème et de langue, et axe sur chaque couche dans les deux thèmes. La galerie existe seulement dans la version de développement. Le test lance son propre serveur `vite` de développement sur le port 4175. Il vérifie que la version de production n'a pas de route de galerie.
- `pnpm test:personas` parcourt la première heure de chaque profil (chef de projet, architecte, développeur, testeur, analyste métier, responsable fonctionnel, débutant) dans la version de démonstration. Il utilise `playwright.personas.config.ts` et `e2e/personas/*.persona.ts`, et `pnpm test:e2e` ne le lance pas. Fixez `PERSONAS_OUT` sur un dossier : chaque profil écrit une capture d'écran pour chaque étape et un journal avec les clics et le résultat de chaque étape (ok, confus, impasse, erreur). Une étape que l'application ne peut pas faire fait échouer le parcours en douceur, et le parcours continue.

## Vérifications

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

`pnpm ipc:check` échoue quand les liaisons enregistrées diffèrent des commandes Rust. La CI lance toutes les vérifications sur macOS et Linux (`.github/workflows/ci.yml`).

## Recette

Le script de départ crée un projet d'exemple avec un fichier pour chaque type d'artefact que l'application lit. Les tests en direct appellent les vraies fonctions de commande de l'application sur GitHub.

1. Connectez-vous avec la CLI GitHub : `gh auth login`.
2. Créez ou actualisez le projet d'exemple et son dépôt privé `me-cedric/shipyard-acceptance` :

```bash
node scripts/acceptance/seed.ts --remote github
```

Le script écrit `~/Projects/shipyard-acceptance` (utilisez `--dir <folder>` pour un autre dossier). Il est sûr de le lancer deux fois : le second passage ne change rien. Sans `--remote`, il ne crée ni dépôt ni ticket. Avec `--remote github`, il envoie aussi la branche `main` et crée l'étiquette `agent`, le jalon `Release 1` et quatre tickets. Il ne lit aucun jeton. Git se connecte par `gh auth git-credential`.

3. Lancez les tests en direct :

```bash
SHIPYARD_LIVE=1 GH_TOKEN=$(gh auth token) \
  cargo test -p shipyard-app --test it live_github -- --test-threads=1 --nocapture
```

Sans `SHIPYARD_LIVE=1`, chaque test affiche `skipped` et réussit, donc la CI reste verte. N'écrivez jamais le jeton dans un fichier ni dans un argument de commande.

Chaque test travaille sur une copie du projet d'exemple dans un dossier temporaire. Les tests couvrent le projet d'exemple (tous les lecteurs), l'outil de suivi des tickets (lister, créer, étiqueter, assigner, commenter, déplacer, miroir après une synchronisation), l'hébergeur de code (branche, pull request, fichiers, vérifications, commentaire, demande de changements, fermeture), l'archive de spécification dans une pull request, et la publication d'un projet local vers `me-cedric/shipyard-acceptance-publish`. Un test ferme la pull request et supprime la branche qu'il a ouverte. Les dépôts et le ticket `Live test issue` restent.

Une machine derrière un proxy qui signe ses propres certificats a besoin de `SHIPYARD_CA_BUNDLE=<certificate file>` dans la même commande. `SHIPYARD_SEED_DIR` nomme un projet d'exemple dans un autre dossier.

## Analyse de sécurité

`.github/workflows/security.yml` tourne du lundi au vendredi à 02:00 UTC et à la demande (`workflow_dispatch`). Il a quatre tâches :

- `deps` : `osv-scanner` sur `Cargo.lock` et `pnpm-lock.yaml`, et `pnpm audit --prod`.
- `owasp` : Semgrep OSS avec les jeux de règles OWASP, TypeScript, React, Rust et secrets. Il ne demande aucun compte.
- `secrets` : gitleaks sur tout l'historique. Le rapport masque chaque valeur de secret.
- `report` : écrit un tableau dans le résumé de l'exécution, et ouvre, met à jour ou ferme le ticket « Security scan findings » (étiquette `security`).

L'exécution échoue sur un résultat de CVSS 9.0 ou plus, un avis npm élevé ou critique, un `ERROR` de Semgrep, ou un secret. Elle échoue aussi quand une analyse ne donne aucun rapport. Pour accepter un avis, ajoutez une entrée `[[IgnoredVulns]]` avec une raison et une date de revue à `.osv-scanner.toml`. Lancez l'analyse OSV sur votre machine avec `osv-scanner scan --lockfile=Cargo.lock --lockfile=pnpm-lock.yaml --config=.osv-scanner.toml`.

Renovate ouvre aussitôt les mises à jour de sécurité et les étiquette `security` (`renovate.json`).

## Icônes

Les icônes de l'application viennent de `docs/assets/logo.svg` :

```bash
pnpm tauri icon docs/assets/logo.svg -o crates/shipyard-app/icons
```

Gardez seulement les fichiers de bureau que `bundle.icon` de `tauri.conf.json` liste.
