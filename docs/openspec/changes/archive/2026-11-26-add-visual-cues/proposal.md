# Visual cues: logos and section icons

## Why

The owner (2026-11-05): most of Shipyard is text. An AI tool, a model provider, an issue tracker or a code host shows as a word, and often as its raw id (`claude`, `azure-dev-ops`). Settings has long pages of rows, inputs and selects with few marks to find a place. A person who does not read every label gets lost. A logo or an icon is found faster than a word.

## Audit (2026-11-05)

Places that show a brand or a kind as text only:

| Kind | Where | Shown today |
|---|---|---|
| AI tools (`claude`, `codex`, `copilot`, `gemini`, `opencode`) | Settings / Connections and Agents and rules cards | A letter tile and the name |
| AI tools | Assistant model menu, Settings / Me default agent, project overrides, model tiers | The raw id |
| AI tools | Factory / Usage (by tool, budgets), Factory / Sessions, the active sessions of the shell | The raw id, or a letter avatar and the raw id |
| Model providers (OpenAI, Anthropic, Mistral, Google, Azure, OpenRouter, Ollama, LM Studio, vLLM, LiteLLM) | Settings / Connections, Agents and rules | A letter tile and the name |
| Issue trackers and code hosts (Jira, GitHub, GitLab, Azure DevOps, Linear) | Settings / Connections cards, the add form | A letter tile; the product is a tooltip only |
| Pull request refs (`pr:github:42`) | Every ref chip | A generic document icon |
| MCP servers (Figma, Playwright, Context7, Semgrep, …) | Settings / Connections | A letter tile and the name |
| Scanners, terminal apps, file types | Code / Quality, Settings / Me, Code file rows | Text only |

Long Settings pages:

| Page | Size | Marks today |
|---|---|---|
| Project | About 15 panels, many with no icon | A page icon |
| Connections | 4 groups and an advanced part, with small text headings | A page icon |
| Me | About 30 rows in 5 sections | Some row icons |

The shared parts already take an icon: the panel heading, the settings row and the settings template. The connection card draws the first letter of the product. One logo atom in that card reaches AI tools, providers, issue trackers, code hosts and MCP servers.

## What Changes

- One logo atom shows the logo of a known product, in the text colour by default and in the brand colour on request. An unknown product shows its first letter. The logos come from Simple Icons (CC0); a product that Simple Icons does not ship (OpenAI, Azure DevOps, OpenCode, LM Studio, LiteLLM, Semgrep) shows its first letter.
- The connection cards show the logo of the AI tool, the provider, the issue tracker, the code host or the MCP server.
- Each place that names an AI tool shows its logo and its name, not its raw id.
- A pull request ref shows the logo of its code host.
- Settings / Project, Connections and Me show a sticky list of their sections, each with an icon; a click scrolls to the section. Each section heading of those pages has an icon.
- State stays as a chip with a shape, a colour and a word (Connected, Signed in, Off): the cards already show it.

Proposed later, not in this change:

- File type icons in the Code file rows.
- Icons in the tab bar of each space.
- Logos for the scanners when a permissive logo exists.

## Impact

- Affected capability: `visual-cues` (new). It touches the screens of `connections`, `assistant`, `factory`, `shell`, `projects` and `refs`.
- Affected code/docs: `src/ui/atoms/brand-icon.tsx` (new), `src/ui/atoms/brands.ts` (new), `src/ui/molecules/connection-row.tsx`, `src/ui/molecules/ref-chip.tsx`, `src/ui/molecules/section-nav.tsx` (new), the Settings pages, the AI tool lists of Assistant, Factory and the shell, `docs/designs/screens.json`, `docs/delivery/test-plans/visual-cues.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
