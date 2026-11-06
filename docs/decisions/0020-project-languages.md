---
status: proposed
date: 2026-11-06
decision-makers: [Cédric Meyer]
---
# Project languages: the project file sets the language of the docs and of the pull requests
## Context and problem statement
The owner wants to choose, for each project, the language of the specs, the diagrams and the documents, and the language of the pull requests, while the code and the comments stay as they are (2026-11-06). A team of a French client writes its specs in French and its code in English. Today no setting says this, and each agent writes in the language of its ticket or in English.

The interface language and the prompt language of the assistant are personal preferences of each machine. The language of the docs belongs to the project: each member and each agent must use the same one.

Spec: `docs/openspec/changes/add-project-creator/` (`project-creator` REQ-004, REQ-005, REQ-006, REQ-014; `projects` REQ-007).
## Decision drivers
- One source for the team, reviewed as code (constitution 1.1).
- One place for each setting (constitution 2.3): the creator sets it, Settings / Project changes it.
- The agents follow it with no extra step from a person.
- The code stays readable for any developer.
## Considered options
- A. Two fields in `.shipyard/project.yaml`: `languages.docs` and `languages.pulls`. The engine adds one language text to each agent brief, and the pull request step uses the pull request language.
- B. A rule in `AGENTS.md` only.
- C. A personal preference of each machine, as the prompt language.
## Decision outcome
Chosen option: "A", because the language is a fact of the project, and the engine must say it to every agent of every runner, not only to the tools that read `AGENTS.md`.

1. Fields. `languages: {docs, pulls}` in the project file, each a two-letter code from a closed list (Q-153). An unknown code is an invalid value that Settings / Health shows. No field: no language text, as before.
2. Briefs. Each agent brief of a run gets one paragraph after the notice: the docs language for specs, diagrams and documents; the pull request language for pull request text and review comments; code, identifiers, code comments and commit messages in English.
3. Pull requests. The fixed text of a pull request (opening line, headings) has an English and a French version. Another language keeps the English text; the agent text of the run follows the brief.
4. The creator writes the same rules in `AGENTS.md` of a new project, so an AI tool outside Shipyard follows them too.
5. A change applies to the next brief only. Shipyard translates no existing doc (Q-157).
### Consequences
- Good: one setting for the team and for every runner. A new member gets the same rules from the repository.
- Good: no change for a project with no `languages`.
- Bad: an older Shipyard refuses a project file with `languages` (`deny_unknown_fields`) and keeps its last valid file.
- Bad: the agents can still write in another language. The review step and a person catch it.
- Follow-up: the impacts digest of a pull request is still asked in English.
## Pros and cons of the options
### A. Fields in the project file
- Good: read by the engine for every runner; reviewed through pull requests.
- Bad: a new field in a strict file.
### B. A rule in `AGENTS.md` only
- Good: no code.
- Bad: a runner that does not read `AGENTS.md`, or a run in a worktree with an old copy, misses it. Shipyard cannot show or check the setting.
### C. A personal preference
- Good: no change of the project file.
- Bad: two members get two languages in the same repository.
## More information
- Spec: `spec:project-creator`, `change:add-project-creator`.
- Questions: Q-153, Q-157.
