# Shipyard constitution

These rules govern every spec, plan and task in this repository. A change that breaks a rule needs an ADR first.
Source: the owner's brief of 2026-10-29 and the principles kept in `docs/plan/MASTER-PLAN.md`.

## 1. Project-as-a-Git

1. Project artifacts live in the repository as text: diagrams, ADRs, specs, questions, workflows, team, estimates.
2. The tracker is the source of truth for tickets. The forge is the source of truth for pull requests.
3. Machine state (mirror, run logs, caches) lives in the app data folder, never in the repository.

## 2. One loop, one graph

1. Each entity has a stable ref. Each view shows the backlinks of its entity.
2. A feature that does not connect to the loop (design, spec, work, factory, code, knowledge) needs a reason in its proposal.
3. One way to do each action. One place for each setting.

## 3. Users

1. Each spec names the roles it serves: PM, architect, developer, QA, BA, functional lead, junior.
2. No role loses access to a view. Roles change the order and the home view only.

## 4. Interface

1. No taglines, no helper text, no secondary labels. When a screen needs them, the layout changes.
2. Components come from `src/ui/` atomic layers. A page does not define a new primitive.
3. Accessibility basics are mandatory: keyboard path, focus ring, labels for assistive technology, contrast, reduced motion.
4. French and English ship together.

## 5. Agents

1. Specs come before code: proposal, spec, plan, checklist, tasks (`shipyard-delivery` schema).
2. agent-compass owns the agent contract. Shipyard rules sit outside its markers.
3. An agent asks a question when a decision belongs to a person. It never guesses one.
4. Writes to a tracker, a forge or a remote need a durable permission or a person's click.
5. Each run has a budget, a stall timeout and a kill switch.

## 6. Engineering

1. Generated files are never edited by hand (IPC bindings, mocks, locks).
2. Domain logic has no I/O and has unit tests. Adapters have contract tests with fakes.
3. A secret never goes in an argument, a URL, a log or a repository file.
4. Each user-visible change has a changelog entry in English and French in the same change.
