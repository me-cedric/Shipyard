# Guía del desarrollador

## Requisitos

- Node 24 o posterior, con pnpm 11 (`corepack enable`).
- Rust stable. En Linux, las bibliotecas del sistema de Tauri: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`.

## Estructura

| Ruta | Contenido |
|---|---|
| `crates/` | Espacio de trabajo de Rust. La lógica de dominio de `shipyard-core` no tiene entrada ni salida. |
| `crates/shipyard-app/` | Envoltorio de Tauri: `tauri.conf.json`, `capabilities/`, `icons/`, comandos en `src/commands/`. |
| `src/ui/` | Sistema de diseño: `tokens`, `icons`, `atoms`, `molecules`, `organisms`, `templates`, `gallery`. Las listas largas usan `VirtualList` y `DataTable` (TanStack Virtual y Table). |
| `src/features/<space>/` | Una carpeta por área funcional, por ejemplo `flow`, `crew` o `code`. Un lugar del menú puede mostrar partes de varias carpetas. Una funcionalidad importa solo `@/ui`, `@/lib` y su propia carpeta. |
| `src/lib/ipc/` | Los bindings generados y la capa de mock. |
| `src/lib/i18n/` | Los catálogos de inglés, francés, alemán y español. Cada uno tiene el tipo de `en.ts`. |
| `e2e/` | Pruebas de Playwright sobre el build de release de Vite, con el IPC de mock. |
| `docs/guide/` | Páginas para los usuarios, una por lugar, y esta guía. `docs/guide/fr/`, `de/` y `es/` tienen las páginas en francés, alemán y español, con los mismos nombres de archivo y los mismos encabezados. |

## Ejecutar

```bash
pnpm install
pnpm dev          # UI in a browser on http://localhost:1420, with the mock IPC
pnpm tauri dev    # desktop app
```

La galería está en `/dev/gallery`, solo en el build de desarrollo.

## IPC

1. Añade un comando en `crates/shipyard-app/src/commands/<feature>.rs` (los comandos del trabajo están en `crates/shipyard-app/src/work.rs`, junto al estado que guardan; los comandos de las ejecuciones están en `factory.rs`, `questions.rs` y `delivery.rs` de la misma carpeta) y regístralo en el builder de specta en `src/lib.rs`. Un comando es `async`, toma `app: AppHandle` y devuelve `Result<T, String>`. Pon la lógica en una función sencilla sobre `&AppState`, para que una prueba unitaria no necesite el runtime de Tauri. Una llamada de TypeScript devuelve un objeto de resultado: léelo con `unwrap` de `@/lib/ipc`.
2. Ejecuta `pnpm ipc:gen`. Ejecuta `cargo test --workspace` y escribe `src/lib/ipc/bindings.ts`. No edites ese archivo.
3. Añade el handler de mock en `src/lib/ipc/mock.ts`. Un handler recibe los argumentos en orden y devuelve los datos. `pnpm typecheck` falla hasta que cada comando tiene un handler. Las pruebas empiezan con un mock vacío (`resetMock`) y lo leen con `mockState()`.

Fuera de Tauri, `src/main.tsx` instala el mock, así que Vite, Vitest y Playwright se ejecutan sin Rust. El selector de carpetas de mock devuelve `/mock/alpha`, `/mock/beta` y `/mock/gamma` por turno. El diálogo de archivos de mock para Excel devuelve `/mock/costing.xlsx`, o una vez la ruta de `mockState().nextFile`. Una ruta con `bad` da un libro con una fila rechazada.

## Datos de la aplicación

El estado de la máquina está en la carpeta de datos de la aplicación: `prefs.json` (tema, idioma, rol), `registry.json` (proyectos, última vista, anulaciones), `connections.json` (los ajustes de cada conexión a un gestor de tickets y a una plataforma de código, sin secretos), `agents.json` (la configuración de MCP, los proveedores de modelos y los niveles de modelo de cada runner, sin secretos), `mirror.sqlite` (los tickets y las pull requests del motor de sincronización, las reservas y la bandeja de salida de eventos, reconstruido en el siguiente tick), `runs.sqlite` (el registro de ejecuciones, solo de adición, y el estado guardado de cada ejecución), `agents/<run>/<step>/` (el archivo MCP privado y el encargo de un paso en curso, eliminados cuando el paso termina), `worktrees/<project>/<run>/` (la carpeta de la ejecución y los worktrees hijos de una ejecución, fuera de la copia de trabajo), `gates/` (la salida de un comando de control mientras se ejecuta), `machine-id` (el nombre de esta instalación en un sello de reserva) y `refs/<project id>.sqlite` (el índice de refs, reconstruido bajo demanda). El repositorio contiene los archivos de `.shipyard/`: `project.yaml`, `automation.yaml`, `workflows/` y `roles/` (la aplicación crea los dos últimos en el primer uso de un proyecto). Cada secreto de conexión está en el llavero del sistema operativo en `conn:<id>`; un campo de MCP en `conn:<server>/<field>`. `prefs.json` contiene también `releaseUrl`, la dirección que lee la comprobación de actualizaciones. `.shipyard/project.yaml` puede nombrar los ids de conexión del gestor de tickets y de la plataforma de código y el alcance del gestor de tickets (`connections.trackerScope`).

La aplicación responde a `shipyard --mcp-relay <server-id>` (binario `shipyard`, crate `shipyard-cli`) en un socket en `relay/` de la carpeta de datos de la aplicación. `SHIPYARD_DATA_DIR` sustituye la carpeta.

## Importación del proyecto

`shipyard_store::project_import::import(source, root)` lee un repositorio con la estructura existente y escribe archivos de Shipyard en el proyecto (comando `project_import`, especificación `projects` REQ-014, REQ-015). Lee solo las rutas por defecto (Q-091).

| Origen | Shipyard |
|---|---|
| nombre de la carpeta y `docs/delivery/tickets.config.json` (`projectKey`) | `.shipyard/project.yaml` (nombre, clave, `connections.trackerScope` para Jira) |
| `docs/planning/team.json`, `docs/personas/personas.json` | `.shipyard/team.yaml` (el nombre de la persona es el rol) |
| `docs/costing/<name>.json` | `docs/costing/<name>.yaml` |
| `docs/decisions/`, `docs/delivery/questions/`, `docs/openspec/` | la misma ruta, el mismo texto |

La importación nunca sustituye un archivo y nunca cambia el origen. Un destino que existe es un conflicto (Q-090). Un archivo que no puede leer o convertir se omite con un motivo. Un enlace simbólico y un archivo de más de 2 MiB se omiten.

## Sidecar

La entrada del puente MCP inicia el binario `shipyard` (crate `shipyard-cli`) junto al binario de la aplicación (`cli_path` en `crates/shipyard-app/src/factory.rs`). Un build de release lo entrega como sidecar `externalBin` de Tauri:

```bash
pnpm tauri:release   # tauri build with crates/shipyard-app/tauri.release.conf.json
pnpm build:sidecar   # only the sidecar: crates/shipyard-app/binaries/shipyard-<triple>
```

`scripts/build-sidecar.ts` compila la CLI en modo release para el triple de destino y la copia a `crates/shipyard-app/binaries/` (git ignora la carpeta). `tauri.release.conf.json` lo ejecuta como `beforeBuildCommand`. `tauri.conf.json` no tiene `externalBin`, así que `pnpm build`, `pnpm tauri dev` y `cargo test` no necesitan sidecar (Q-092). Un build de desarrollo usa `shipyard` del `PATH`.

## Pruebas de extremo a extremo

`pnpm test:e2e` compila la aplicación con `VITE_MOCK_DEMO=0` y la sirve en el puerto 4174. Un archivo cubre cada área, por ejemplo `e2e/work.spec.ts`. Ejecuta un archivo con `pnpm playwright test e2e/<name>.spec.ts`.

- `e2e/a11y.spec.ts` ejecuta axe (`@axe-core/playwright`) en cada sección de cada lugar y en las páginas fuera de los selectores de sección, en el tema claro y en el oscuro, con movimiento reducido, en una ventana de 960 por 600 px. Una infracción hace fallar la prueba. Un control de menos de 44 px de alto y una página que se desplaza hacia un lado también la hacen fallar. Una sección nueva entra en la ejecución cuando la añades a `PLACES` en `src/features/shell/places.ts`. Una página fuera de los selectores entra por `OFF_SWITCH` de la prueba.
- `e2e/design-system.spec.ts` cubre la galería: una página por cada capa atómica, un anillo de foco en cada botón de capa, el cambio de tema y de idioma, y axe en cada capa en los dos temas. La galería existe solo en el build de desarrollo. La prueba inicia su propio servidor de desarrollo `vite` en el puerto 4175. Comprueba que el build de release no tiene ruta de galería.
- `pnpm test:personas` recorre la primera hora de cada perfil (jefe de proyecto, arquitecto, desarrollador, tester, analista de negocio, responsable funcional, junior) en el build de demostración. Usa `playwright.personas.config.ts` y `e2e/personas/*.persona.ts`, y `pnpm test:e2e` no lo ejecuta. Fija `PERSONAS_OUT` en una carpeta: cada perfil escribe una captura por cada paso y un registro con los clics y el resultado de cada paso (ok, confuso, sin salida, error). Un paso que la aplicación no puede hacer hace fallar la ejecución de forma suave y el recorrido continúa.

## Comprobaciones

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

`pnpm ipc:check` falla cuando los bindings confirmados difieren de los comandos de Rust. La CI ejecuta todas las comprobaciones en macOS y Linux (`.github/workflows/ci.yml`).

## Aceptación

El script de seed crea un proyecto de ejemplo con un archivo por cada tipo de artefacto que la aplicación lee. Las pruebas en vivo llaman a las funciones de comando reales de la aplicación contra GitHub.

1. Inicia sesión con la CLI de GitHub: `gh auth login`.
2. Crea o actualiza el proyecto de ejemplo y su repositorio privado `me-cedric/shipyard-acceptance`:

```bash
node scripts/acceptance/seed.ts --remote github
```

El script escribe `~/Projects/shipyard-acceptance` (usa `--dir <folder>` para otra carpeta). Es seguro ejecutarlo dos veces: la segunda ejecución no cambia nada. Sin `--remote` no crea ningún repositorio ni ningún ticket. Con `--remote github` también hace push de la rama `main` y crea la etiqueta `agent`, el hito `Release 1` y cuatro tickets. No lee ningún token. Git inicia sesión mediante `gh auth git-credential`.

3. Ejecuta las pruebas en vivo:

```bash
SHIPYARD_LIVE=1 GH_TOKEN=$(gh auth token) \
  cargo test -p shipyard-app --test it live_github -- --test-threads=1 --nocapture
```

Sin `SHIPYARD_LIVE=1`, cada prueba imprime `skipped` y pasa, así que la CI queda en verde. Nunca escribas el token en un archivo ni en un argumento de comando.

Cada prueba trabaja sobre una copia del proyecto de ejemplo en una carpeta temporal. Las pruebas cubren el proyecto de seed (todos los lectores), el gestor de tickets (listar, crear, etiqueta, asignar, comentar, mover, espejo después de una sincronización), la plataforma de código (rama, pull request, archivos, controles, comentario, solicitar cambios, cerrar), el archivo de especificaciones en una pull request, y la publicación de un proyecto local en `me-cedric/shipyard-acceptance-publish`. Una prueba cierra la pull request y elimina la rama que abrió. Los repositorios y el ticket `Live test issue` se quedan.

Una máquina detrás de un proxy que firma sus propios certificados necesita `SHIPYARD_CA_BUNDLE=<certificate file>` en el mismo comando. `SHIPYARD_SEED_DIR` nombra un proyecto de ejemplo en otra carpeta.

## Escaneo de seguridad

`.github/workflows/security.yml` se ejecuta de lunes a viernes a las 02:00 UTC y bajo demanda (`workflow_dispatch`). Tiene cuatro jobs:

- `deps`: `osv-scanner` sobre `Cargo.lock` y `pnpm-lock.yaml`, y `pnpm audit --prod`.
- `owasp`: Semgrep OSS con los conjuntos de reglas OWASP, TypeScript, React, Rust y secretos. No necesita cuenta.
- `secrets`: gitleaks sobre todo el historial. El informe oculta cada valor secreto.
- `report`: escribe una tabla en el resumen de la ejecución, y abre, actualiza o cierra el ticket «Security scan findings» (etiqueta `security`).

La ejecución falla con un hallazgo de CVSS 9.0 o más, un aviso de npm alto o crítico, un `ERROR` de Semgrep, o un secreto. También falla cuando un escaneo no da informe. Para aceptar un aviso, añade a `.osv-scanner.toml` una entrada `[[IgnoredVulns]]` con un motivo y una fecha de revisión. Ejecuta el escaneo OSV en tu máquina con `osv-scanner scan --lockfile=Cargo.lock --lockfile=pnpm-lock.yaml --config=.osv-scanner.toml`.

Renovate abre las actualizaciones de seguridad enseguida y les pone la etiqueta `security` (`renovate.json`).

## Iconos

Los iconos de la aplicación vienen de `docs/assets/logo.svg`:

```bash
pnpm tauri icon docs/assets/logo.svg -o crates/shipyard-app/icons
```

Conserva solo los archivos de escritorio que `bundle.icon` de `tauri.conf.json` lista.
