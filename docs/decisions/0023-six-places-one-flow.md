---
status: accepted
date: 2026-11-16
decision-makers: [Cédric Meyer]
---
# Six places and one flow replace the seven spaces
## Context and problem statement
`adr:0004` set seven spaces with tabs: Home, Design, Specs, Work, Factory, Code, Knowledge, plus Settings. The app now has eight menu entries and about 45 tabs.

The owner (2026-11-16): "it feels too complex, too much data driven, not visual / simple enough". The owner asked for a new interface from the ground up that keeps every function, and added: "if anything is illogical / not good enough in the current features don't just copy it, improve on it".

A review of the same day found:

- The spaces follow the kind of file. One decision of a person can sit in Home, in Specs / Questions, on a run page or on a pull request.
- Four layers of controls stand before the content: the top bar, the sidebar, the tab bar and the page header.
- Each card shows ids, counts, costs and states with the same weight. No screen says what to do next.
- Controls for developers show for every role.

Three audits against the code listed the functions of today. A design canvas of 101 screens shows each of them in the new model.

Spec: `docs/openspec/changes/archive/2026-11-27-update-app-redesign/` (`app-redesign`).
## Decision drivers
- Easy for a person with little technical knowledge: the screen says what to do next.
- One feature is one object, from the idea to the release.
- One way to do each action, and one place for each setting (constitution 2.3).
- No function is lost, and each address of today keeps working.
- The engine, the stores, the refs and the rights of today stay.
## Considered options
- A. Six places by task, five stages for a feature, one feature page.
- B. Keep the seven spaces and remove more duplicates (the path of `spec:ux-declutter`).
- C. The new model behind a switch "New interface", with both interfaces until the end.
- D. The new model on a long branch that reaches main only when it is complete.
## Decision outcome
Chosen option: "A", because it is the only option that changes what the owner named: the app is organised by the kind of file, and a person must know where each kind lives. Option B keeps that model. Options C and D are ways to deliver A; the owner chose to replace the pages wave by wave on main (`q:Q-171`).

1. Places. The main menu shows Today, Flow, Plan, Crew, Library and Code, with Setup at the end (`q:Q-169`). A page has one section switch at most.
2. Areas stay. Design, specs, work, factory, code and knowledge stay the areas of the loop (constitution 2.2), of the refs and of the rights. A place is a view on one area or more. A role with the level `none` for an area does not see the place or the view of that area, and a right turns a control off, never a view (constitution 3.2).
3. Area to place:
   - home: Today.
   - work: Flow (backlog, board), Plan (plan, estimates, time), Crew (team, rights).
   - factory: Flow (runs), the feature page (run), Crew (recipes, live work, sessions, spend).
   - specs: the feature page (change, brief), Library (specs, questions, test plans, project rules).
   - design and knowledge: Library.
   - code: Code (changes, history, branches, terminal), the feature page (pull request), Flow / Health (quality gates).
   - settings: Setup, with the scopes this project, this computer, me.
4. One flow. A feature shows once, in one of five stages: Idea, Spec, Build, Review, Ready. The sixteen run states stay in the engine (`adr:0022`). A map in the domain code gives each state one stage and, when it applies, one mark: needs you, blocked or stopped.
5. One feature page joins the ticket, the spec change, the run, the pull request and the checks. A read model builds it from their refs. It adds no table.
6. One approval for one intent. An agent that needs several approvals for one intent asks one question that names each effect. "Do not ask again for this recipe" is a durable permission in the sense of constitution 5.4.
7. One bar, "Ask or tell Shipyard", replaces the search field, the command palette and the Ask button.
8. Words. A workflow is a "recipe". The people and the agents together are the "crew" (`q:Q-169`).
9. Addresses. Each address of today opens the new place of its page.
10. Delivery. Each wave replaces its pages on main. The old pages of a wave go when its new pages pass the inventory test (`q:Q-171`).
11. Look. Light is the default theme for a person who has not chosen one (`q:Q-168`). One attention colour means "a person must act".
### Consequences
- Good: a person opens one page to follow a feature, and one page to see what waits.
- Good: the menu has seven entries with one level under them, in place of eight entries with about 45 tabs.
- Good: the data, the engine and the rights do not change, so the risk is in the frontend.
- Bad: every screen, screenshot, guide page and test that names a space changes. The guide exists in four languages.
- Bad: between the first and the last wave a person sees new places beside old pages.
- Bad: a person who knows the app of today must learn the new names.
- Follow-up: when this decision is accepted, set the status of `adr:0004` to `superseded by 0023`.
- Follow-up: the constitution (section 2.2) lists the loop as "design, spec, work, factory, code, knowledge". This decision keeps that list as the areas. The owner decides whether the section also names the six places.
- Open: the French, German and Spanish names of the places, of "recipe" and of "crew" are not chosen.
## Pros and cons of the options
### A. Six places, five stages, one feature page
- Good: the model follows what a person does, not where a file lives.
- Good: Today, Flow and the feature page replace four lists of things that wait.
- Bad: the largest change of the interface since `adr:0004`.
### B. Keep the seven spaces, remove more duplicates
- Good: a small change, and no new names.
- Bad: the spaces still follow the kind of file, and the owner judged the result of that path still too complex. Rejected.
### C. A switch between the old and the new interface
- Good: a person can go back during the change.
- Bad: two interfaces to keep in step, to test and to translate until the end. Rejected by the owner (`q:Q-171`).
### D. A long branch
- Good: main never shows a mixed interface.
- Bad: no feedback before the end, and a large merge against a main that keeps moving. Rejected by the owner (`q:Q-171`).
## More information
- Spec: `change:update-app-redesign`, `spec:app-redesign`.
- Questions: `q:Q-168`, `q:Q-169`, `q:Q-170`, `q:Q-171`.
- Earlier decisions: `adr:0004` (the seven spaces, replaced when this one is accepted), `adr:0022` (the sixteen run states stay).
- Design source: a private design canvas of 101 screens, <https://claude.ai/artifact/1uHi9aggUnnnUDchTWGYA2>.
