# Gaps between the built app and the accepted design, group A

Design pictures: `docs/assets/screenshots/redesign/`. App captures: this folder (`*.jpg`). Capture scripts: `run.cjs` with `s1.cjs` to `s4.cjs`.
Tags: `look`, `missing`, `extra`. Source paths are the likely place of the change.

Result: 0 screens match, 15 screens have gaps, 2 screens not found (63 as a panel, 66). Part of 68 is not reachable in the browser mock.

## Shared shell

Design pictures: `001-main.jpg`, `060-projects.jpg`, `062-inbox.jpg`. App captures: `today.jpg`, `projects.jpg`, `news.jpg`, `project-switch.jpg`.

1. `extra` Top bar. The design has no full-width top bar. The app shows a white bar across the window with: Hide sidebar, Back, Forward, project name, branch select `main`, `Changed files (5)` badge, `Sync` split button, Files, Terminal, Account. Source: `src/features/shell/context-bar.tsx`, `src/features/shell/app-shell.tsx`.
2. `look` Ask bar. The design puts the bar `Ask or tell Shipyard` at the top left of the content column (about 560 px wide, 48 px high, white card, search icon on the left). The app puts a narrow field at the top right of the top bar, with no search icon. Source: `src/features/shell/context-bar.tsx`, `src/features/shell/palette-host.tsx`.
3. `missing` Sync mark. The design shows one green pill `In sync` at the top right of the content. The app shows a `Sync` split button in the top bar and a warning triangle in the status bar. Source: `src/features/shell/context-bar.tsx`, `src/features/sync/`.
4. `look` Project switch. The design puts the project mark (blue square) and the name `alpha` with a chevron at the top of the sidebar. The app puts the name in the top bar and the Shipyard logo alone at the top of the sidebar. Source: `src/features/shell/sidebar.tsx`, `src/features/shell/context-bar.tsx`.
5. `look` Sidebar surface. The design sidebar has no card: the items sit on the page background, and only the active item is a white pill. The app wraps the sidebar in a white card with a border and a shadow. Source: `src/features/shell/sidebar.tsx`.
6. `look` Sidebar counts. The design shows one count, on Today, as an orange round badge (`3`). The app shows a blue dot plus `10` on Today, and plain counts on Flow (`6`) and Code (`5`). Source: `src/features/shell/sidebar.tsx`, `src/features/shell/counts.ts`.
7. `missing` Account row. The design ends the sidebar with the avatar and the full name (`AL Ada Lovelace`) under Setup; it opens the account menu. The app has no such row; the account is an icon in the top bar. Source: `src/features/shell/sidebar.tsx`, `src/features/shell/account-menu.tsx`.
8. `extra` Status bar. The design has no status bar. The app shows a bottom bar: `Commit`, changed-file counts, `+5 −2`, version `v0.1.0`, sync mark. Source: `src/features/shell/status-bar.tsx`.
9. `extra` Section switch. The design shows no tab strip above the page title on Today (`001`); News (`062`) has the switch `Needs you / News / Activity` on the right of the title row. The app shows a tab strip above the title on each place. Source: `src/features/shell/section-bar.tsx`.
10. `look` Page title. The design title is plain text, about 40 px, bold, with no icon. The app title is about 20 px with a purple gradient icon tile on its left and, on some pages, a count chip. Source: `src/ui/molecules/page-header.tsx`.
11. `look` Background. The design background is flat light grey-blue (`#F0F3F8` range). The app shows a purple gradient wash and a dot grid. Source: `src/ui/tokens/tokens.css`, `src/features/shell/app-shell.tsx`.
12. `look` Primary button. The design primary button is flat near-black with white text. The app uses a blue-to-purple gradient (`bg-accent-gradient`). Source: `src/ui/atoms/button.tsx`, `src/ui/tokens/tokens.css`.
13. `look` Type and scale. The design uses a geometric grotesque with heavy headings, 16 px body, 44 px controls and cards with a radius near 20 px and no border. The app uses Inter-like 14 px text, 28 to 36 px controls, 8 px radius and 1 px borders. Source: `src/ui/tokens/tokens.css`.
14. `look` Sidebar icons. Today uses a check-circle icon in the design and a house icon in the app. Flow, Library and Setup icons differ too. Source: `src/features/shell/places.ts` (`PLACE_ICON`).
15. `look` Navigation buttons. `001` keeps Hide sidebar, Back and Forward as three 44 px white square buttons on the left of the Ask bar. The other pictures show none. The app shows them as small flat icons in the top bar. Source: `src/features/shell/context-bar.tsx`.

## 1 Today

Design: `001-main.jpg`. App: `/today/today`, captures `today.jpg`, `today-tall.jpg`.

1. `extra` The app opens with a large `Get started` checklist card (6 rows, selects, 8 buttons) above the questions. The design shows setup as one small card on the right: progress ring, `Connect the issue tracker`, `Setup, 3 of 11`, `Continue`. Source: `src/features/home/today.tsx`, `src/features/onboarding/checklist.tsx`.
2. `look` Question card. The design shows: agent avatar and name, feature name, `1 of 3`, the question as a large heading, large option buttons (56 px) with the pick chip `Builder's pick`, then one row `Another answer` field, `Later`, `Send`. The app shows a card with an orange border, a kind chip `bug`, the ticket title as heading, a nested bordered box with a ref chip, an `Open` badge, small radio rows, `Send` inside the box and `Later` under it. Source: `src/features/home/inbox/inbox.tsx`, question card in `src/features/home/inbox/`.
3. `missing` Field `Another answer` on the question card. Source: `src/features/home/inbox/inbox.tsx`.
4. `look` The other items. The design rows show an agent avatar, a bold action (`Approve the pull request`), the feature name and a chevron. The app rows show a kind word (`bug`, `feature`, `build.t2`), a raw sentence and the ticket key with title on the right. Source: `src/features/home/inbox/inbox.tsx`, `src/features/home/event-sentence.ts`.
5. `look` Working now. The design lists each working agent: avatar, feature name, 5-segment step bar, the current act (`Writes tests`), then the link `Open the flow`. The app shows a header with a count chip, a sparkline and a spend chip `$5.80`, and the text `No active run`. Source: `src/features/home/working-now.tsx`.
6. `look` Time reminder. The design shows a slim card on the right: `Log your time for today` and `Log`. The app shows a full-width card with an orange border, a chip `You`, the heading `No time logged today` and `Log time`. Source: `src/features/home/time-reminder.tsx`.
7. `missing` Link `Panels for my role` under the right column. The app shows a select `Pick a role` at the bottom of the page. Source: `src/features/home/role-panels.tsx`.
8. `extra` Menu `...` (`More`, only item `Refresh`) on the title row. Source: `src/features/home/today.tsx`.

## 9 Ask bar, open

Design: `009-ask.jpg`. App: click `Ask or tell Shipyard`, type `what blocks`. Captures `ask-empty.jpg`, `ask.jpg`.

1. `look` Place and size. The design opens a centred column about 760 px wide: a 64 px input with a blue border and an `esc` hint, and the content of the page is hidden. The app keeps the small field in the top bar and drops a 510 px popover over the page. Source: `src/features/shell/palette-host.tsx`, `src/ui/organisms/command-palette.tsx`.
2. `look` Answer card. The design shows the avatar `S Shipyard`, a heading sentence (`2 features block MVP 1.`), then one grey row per feature with a state chip and one action button. The app shows a group label `Blocked`, a plain row and an `Unblock` gradient button. Source: `src/features/shell/ask-answer.ts`, `src/features/shell/palette-host.tsx`.
3. `missing` Field `Reply` with `Send` inside the answer card. Source: `src/features/shell/palette-host.tsx`.
4. `missing` Second card with the groups `Go to` (places, Enter hint) and `Do` (`New feature`, `Start an agent on a ticket`, `Sync now`) under the answer. The app shows no such groups for this text. Source: `src/ui/organisms/command-palette.tsx`, `src/features/shell/actions.ts`.
5. `look` `Open the full assistant` is a blue link in the design and a plain list row in the app. Source: `src/features/shell/palette-host.tsx`.

## 18 First run

Design: `018-welcome.jpg`. App: first load of `/`, capture `welcome.jpg`.

1. `extra` The app shows the full shell (top bar, sidebar, tabs `Today / News / Activity`, status bar) around the first run. The design shows a bare centred page. Source: `src/features/projects/first-run.tsx`, `src/features/shell/app-shell.tsx`.
2. `look` Heading. The design shows the app mark, a 3-segment progress bar and the question `What is your job?` (40 px, centred). The app shows a logo with `Welcome` and a numbered heading `1 Role`. Source: `src/features/projects/first-run.tsx`.
3. `look` Role cards. The design shows a 3 by 3 grid of tall cards (250 by 120 px), each with an icon tile above the label. The app shows a 4-column grid of 44 px rows with an inline icon. Source: `src/features/projects/first-run.tsx`, `src/features/projects/personas.tsx`.
4. `extra` Tenth choice `Other` (selected by default). The design has nine choices; the ninth is `I only look` (app: `Viewer`), and `Developer` is the selected one. Source: `src/features/projects/personas.tsx`.
5. `look` `Continue` is a 220 px near-black centred button in the design, and a small gradient button on the right in the app. Source: `src/features/projects/first-run.tsx`.

## 19 Today, dark

Design: `019-todaydark.jpg`. App: Account, `Theme: Dark`, capture `today-dark.jpg`.

1. All gaps of "Shared shell" and "1 Today" apply.
2. `look` Primary buttons. The design inverts them to white with dark text (`Send`). The app keeps a light purple gradient. Source: `src/ui/tokens/tokens.css`, `src/ui/atoms/button.tsx`.
3. `look` Cards. The design cards are a flat lighter navy with no border. The app cards have 1 px borders, and the question card keeps an orange border. Source: `src/ui/tokens/tokens.css`.
4. The dark background tone (near-black navy) matches.

## 20 Menu bar panel

Design: `020-tray.jpg`. App: `/tray` at 380 by 620, captures `tray.jpg`, `tray2.jpg`. The mock tray has no open project, so the lists of items and runs are empty; the code has them.

1. `look` Header. The design shows the project mark, the name and the `In sync` pill. The app shows a project select. Source: `src/features/tray/tray.tsx`.
2. `extra` Card `Spend today` with a 7-day bar chart and `Month $216.60`. The design shows the spend as one figure on the `Agents` row. Source: `src/features/tray/tray.tsx`.
3. `look` Agents switch. The design row is `Agents  $16.09` with a large green switch on the right, in a card. The app row is a small blue switch with the label `Agents on`. Source: `src/features/tray/tray.tsx`.
4. `missing` Button `Sync` beside `Open Shipyard`. Source: `src/features/tray/tray.tsx`.
5. `look` `Open Shipyard` is near-black in the design and gradient, full width, in the app. Source: `src/features/tray/tray.tsx`.
6. Not verified: the cards `3 things need you`, `Working now` with `Stop`, and `Log your time for today`. The code has these sections (`tray.tsx` lines 173 to 232) but the mock shows none.

## 60 Projects

Design: `060-projects.jpg`. App: `/projects`, capture `projects.jpg`.

1. `extra` Project card: chips `example.com`, `main`, `2 ahead`, the line `feat: first commit · 21/09/2026`, and the buttons `Remove from list`, `Details`, `Open remote`. The design card of the open project shows three chips (`3 need you`, `6 agents at work`, `Open`) and two buttons (`Open`, `Close`). Source: `src/features/projects/projects-page.tsx`, `src/features/projects/project-details.tsx`.
2. `missing` Section `Opened before` with one card per earlier project (`Open`, `Remove from the list`). The mock has one project, so the section is not verified; the app shows no heading. Source: `src/features/projects/projects-page.tsx`.
3. `look` Chips. The design chips are sentences (`3 need you`). The app chips are label and value (`Need you: 10`). Source: `src/features/projects/projects-page.tsx`.
4. `look` Header buttons. The design shows 4 text buttons with no icon (`Import projects`, `Open a folder`, `Clone from the code host`, `New project`). The app adds icons, other labels (`Import a project`, `Open a local folder`, `Clone a repository`) and a count chip beside the title. Source: `src/features/projects/projects-page.tsx`.
5. `look` The project mark is a solid colour square in the design, and a letter tile `A` in the app. Source: `src/features/projects/projects-page.tsx`.
6. The drop zone `Drop a folder here` matches, apart from its height.

## 61 New project

Design: `061-newproject.jpg`. App: `/projects`, `New project`, `Next`. Captures `newproject-1.jpg`, `newproject-2.jpg`.

1. `look` Frame. The design is a bare centred page with no window chrome. The app is a full-window dialog with the title `New project`, content pinned to the top left in a 580 px column, and a footer row. Source: `src/features/projects/new-project/new-project-dialog.tsx`.
2. `missing` Step 2 `Kind of product`: the question `What do you build?` with six icon cards (five stacks and `Something else`). The app step 2 is `Brief`: two language selects and three text areas with no labels. Source: `src/features/projects/new-project/steps.tsx`.
3. `look` Step names. Design: `Name, Kind of product, Tools, Team, Ready`, joined by lines, centred. App: `Project, Brief, Team, Remote, Start`, left-aligned, no lines. Source: `src/features/projects/new-project/steps.tsx`, `src/lib/i18n/workspace.ts`.
4. `look` Buttons. The design shows `Back`, `All steps`, `Continue` centred under the cards, `Continue` wide and near-black. The app spreads `Back` (left), `All steps` (centre), `Next` (right), then a second row `Close`, `Create`. Source: `src/features/projects/new-project/new-project-dialog.tsx`.
5. `extra` `Close` and `Create` on each step. The design creates the project at the last step only. Source: `src/features/projects/new-project/new-project-dialog.tsx`.

## 62 Today, all news

Design: `062-inbox.jpg`. App: `/today/news`, capture `news.jpg`. The mock has no notification.

1. `missing` Right card `Tell me when` with five switches and the link `More in Setup`. The app shows the link `More in Setup` alone. Source: `src/features/home/news.tsx`.
2. `look` Title. The design title is the count (`4 news`). The app title is `News` with an icon tile. Source: `src/features/home/news.tsx`.
3. `look` Section switch. The design shows `Needs you / News / Activity` as a segmented control on the right of the title row, beside `Mark all as read`. The app shows `Today / News / Activity` as a strip above the title. Source: `src/features/shell/section-bar.tsx`, `src/lib/i18n/en.ts` (`tabs.home.today`).
4. `extra` Button `Clear`. Source: `src/features/home/news.tsx`.
5. Not verified: the groups `Today` and `Earlier`, the row layout (avatar, title, feature, one action button) and `Older news`. The mock list is empty (`No notification`). Source: `src/features/home/news.tsx`, `src/lib/ipc/mock*.ts`.

## 63 Explain a link

Design: `063-inspector.jpg`. Result: `not found` as a panel.

Tried: the ref chip `ACME-1, run:…` on Today (it opens the page `/flow/runs/<id>`, capture `inspector.jpg`); `/library/questions` and `/library/capabilities` (no ref chip on the cards, capture `questions.jpg`). The panel code exists: `src/ui/organisms/inspector.tsx`, `src/features/shell/ref-detail.tsx`.

1. `missing` (from the code and the tries) A click on a link opens the page of the item. The design opens a card on the right over a dimmed page: kind chip, name, two plain sentences, `Linked to` rows with kind chips, `Open`, `Explain with an agent`, and the ref with `Copy the ref`. Source: `src/features/shell/ref-detail.tsx`, `src/app/ref-actions.ts`.
2. `missing` No string `Explain with an agent` or `Copy the ref` exists in `src/lib/i18n/`.

## 64 Account menu and help

Design: `064-account.jpg`. App: `Account` button, then each item. Captures `account.jpg`, `shortcuts.jpg`, `whatsnew.jpg`, `tour.jpg`.

1. `look` Trigger and place. The design opens the menu from the avatar row at the bottom of the sidebar, as a 376 px card with 60 px rows. The app opens a 240 px menu from an icon at the top right. Source: `src/features/shell/account-menu.tsx`, `src/features/shell/sidebar.tsx`.
2. `missing` Header row: avatar, name, role and `Change`. The app shows the item `Setup / Me`. Source: `src/features/shell/account-menu.tsx`.
3. `look` Theme. The design is one row `Theme` with a segmented control `Light / Dark / System`. The app shows three menu items `Theme: Light`, `Theme: Dark`, `Theme: System`. Source: `src/features/shell/account-menu.tsx`.
4. `missing` Rows `Language` (with the language button), `Check for an update`, `About Shipyard`, `Sign out` (red). Source: `src/features/shell/account-menu.tsx`, `src/features/shell/actions.ts`.
5. `look` Labels. Design: `Manual`, `Shortcuts`, `What is new`, `Show the tour again`. App: `Open the manual for this page`, `Keyboard shortcuts`, `What's new`, `Replay the tour`. Source: `src/lib/i18n/en.ts`.
6. `look` Shortcuts. The design shows a card beside the menu: 8 rows, key cap on the left (`1` to `6`, `⌘K`, `F1`), name on the right. The app opens a modal with a blurred page, 22 rows, the key on the right and a `Change` button on each row. Source: `src/features/shell/shortcut-help.tsx`.
7. `look` What is new. The design shows a card: rows with a chip (`New`, `Fixed`) and a note, then the version and `All versions`. The app opens a modal `What's new in 0.1.0` with the text `No notes for this version.` and `Close`. Source: `src/features/shell/whats-new.tsx`.
8. `missing` Button `All versions`. Source: `src/features/shell/whats-new.tsx`.

## 65 Today, product owner

Design: `065-todaypo.jpg`. App: `/today/today`, select `Pick a role`, `Product owner`. Capture `today-po.jpg`.

1. `missing` Card `MVP 1 ends 17 Nov` with a progress bar, `1 of 12 features ready` and the link `Plan`. The app shows no panel for the product owner in the mock. Source: `src/features/home/role-panels.tsx`.
2. `missing` Alert card `3 people have too much work` with avatars and `Show` (orange border). Source: `src/features/home/role-panels.tsx`.
3. `missing` Item `Groom 2 ideas` in the list of things that need you. Source: `src/features/home/inbox/routing.ts`.
4. `look` The design hides `Code` in the sidebar for the product owner. The role select of the app page does not change the sidebar; the sidebar follows the role in Setup / Me. Not verified with the real role. Source: `src/features/shell/sidebar.tsx`, `src/features/shell/places.ts`.
5. All gaps of "1 Today" apply. The role panels sit at the bottom of the page in the app, and in the right column in the design.

## 66 Role views

Design: `066-roles.jpg`. Result: `not found`.

Tried: the string search `Role views`, `Starts on`, `My view` in `src/` (no hit); `/setup/me` (a `Role` select, capture `setupme.jpg`); `/crew/rights` (the matrix `Rights of each role`, capture `rights.jpg`).

1. `missing` The page `Role views`: nine role cards, each with `Starts on <section>` and the places as chips (hidden places struck through), the chip `My view`, and the button `Rights of each role`. Source: new page under `src/features/settings/`, data in `src/features/shell/spaces.ts` (`firstPath`, `hiddenTab`).

## 68 System moments

Design: `068-dialogs.jpg`. Seven moments. App captures: `noproject.jpg`, `permissions.jpg`, `tour.jpg`.

1. `look` No project is open. The design shows one centred card: mark, `No project is open`, `New project`, `Open a project`. The app shows `Welcome`, `2 Project` and three large tiles (`Open a local folder`, `Clone a repository`, `Create a project`), inside the full shell. Source: `src/features/shell/no-project.tsx`, `src/features/projects/first-run.tsx`.
2. `missing` Permissions as one moment. The design shows the card `Shipyard needs 3 permissions` with three rows, `Later` and `Allow all`. The app shows a section of `/setup/computer` with two permission rows and a `Tour` row. No `Allow all`, no `Passwords in the keychain` row. Source: `src/features/onboarding/permissions.tsx`.
3. `look` Tour. The design card has a 5-segment bar at the top, a heading sentence (`Flow shows each feature on its way`), the stage chips, and `Skip the tour`, `Back`, `Next`. The app modal has a small title, a drawing of the seven places, body text, dots under the text, and `Close`, `Next`. Source: `src/features/onboarding/tour.tsx`, `src/features/onboarding/pictures.tsx`.
4. `missing` Tour button `Back`; `Skip the tour` reads `Close`. Source: `src/features/onboarding/tour.tsx`.
5. Not captured: `2 agents still work` (`Cancel`, `Stop them`, `Keep them working`). It needs a window close, which the browser mock does not send. Code: `src/features/shell/close-guard.tsx`.
6. Not captured: `This file changed on the disk`, `Leave this page? 2 files are not saved`, `Rename: 4 links change too`. They need an open editor with unsaved files. Code: `src/ui/organisms/editor-frame.tsx`, `src/features/design/frame.tsx`, `src/features/knowledge/pages.tsx`.
7. `look` Dialog look, seen on every captured modal. The design moments are cards with a 2 px blue or orange border, a 28 px heading and 44 px buttons, primary on the right in near-black. The app modals have a 14 px title, small buttons and a blurred page behind. Source: `src/ui/organisms/dialog.tsx`.

## 70 Ask, full assistant

Design: `070-assistant.jpg`. App: Ask bar, `Open the full assistant`. Capture `assistant.jpg`.

1. `look` Frame. The design is a full page titled `Ask` with three columns: threads, conversation, tools; a `Small bar` button goes back. The app opens a 400 px side panel titled `Assistant` over the right of the current page. Source: `src/features/assistant/panel.tsx`, `src/features/shell/app-shell.tsx`.
2. `missing` Thread column: `New thread` (primary), the thread cards, `Rename` and `Delete` as text buttons. The app shows one thread name (`Untitled`) with three icon buttons. Source: `src/features/assistant/threads.tsx`.
3. `missing` Right column cards: `On a selection` (quote, `Explain`, `Fix`, `Send to an agent`), `The assistant may` (switches `Edit files alone`, `Run commands alone`), `Panel` (`Side`, `Width`). The app shows `Explain` and the side arrow as small icons. Source: `src/features/assistant/selection-actions.tsx`, `src/features/assistant/panel.tsx`.
4. `look` Composer. The design shows context chips (`This screen`, `A file`, `Spec: export`, `Add`), the field `Message`, two segmented controls (`Ask / Plan / Do`, `Read only / Asks first / Alone`), buttons `Model: Standard`, `Effort: Normal`, `Send to an agent`, `Send`, and two bars `Context` and `Quota`. The app shows a chip `View /today/today`, `Ask / Plan / Agent`, a text area, a `+` icon, `Claude Code`, a select `Edit with approval`, a ring `0 %` and `Send`. Source: `src/features/assistant/composer.tsx`, `src/features/assistant/model-menu.tsx`, `src/features/assistant/gauge.tsx`.
5. `missing` Bar `Quota`. Source: `src/features/assistant/gauge.tsx`.
6. `look` Labels. Design `Do`, app `Agent`. Design `Send to an agent`, app `Send to factory`. Source: `src/lib/i18n/assistant.ts`.
7. Not verified: the answer card (`How I found this`, the changed file with `Undo` and `Keep`) and the card `Codex asks: trust this folder?`. The mock thread is empty. Code: `src/features/assistant/messages.tsx`, `src/features/assistant/codex-trust.tsx`.

## 79 Manual

Design: `079-manual.jpg`. App: `/library/manual` or F1. Captures `manual.jpg`, `manual-f1.jpg`.

1. `look` Page list. The design shows one white card per page, 60 px high, the selected one with a blue border, in a 336 px column. The app shows a plain text list in a 224 px column. Source: `src/features/knowledge/pages.tsx` (manual view).
2. `look` Page names. The design lists the new places: `Start, Today, Flow, Plan, Crew, Library, Code, Setup`. The app lists the old spaces: `Getting started, Home, Design, Specs, Work, Team and rights, Factory, Code, Knowledge, Settings, Theming`. Source: the manual pages under `docs/` that the app loads, `src/features/knowledge/pages.tsx`.
3. `look` Reader. The design shows the page in one white card with a picture of the screen. The app shows long text on the page background, with no card and no picture. Source: `src/features/knowledge/pages.tsx`.
4. `missing` Buttons `Ask about this page`, `Shortcuts`, `Handbook of the project` under the page. Source: `src/features/knowledge/pages.tsx`.
5. `extra` Back link `Library` above the title and a count chip `11` beside it. The design shows the key cap `F1` on the right of the title. Source: `src/features/library/`, `src/ui/molecules/page-header.tsx`.

## 92 Today, panels by role

Design: `092-todayroles.jpg`. App: `/today/today`, select `Pick a role`, `Tech lead`. Capture `today-techlead.jpg`.

1. `look` Role choice. The design shows nine chips in one row under the title, the chosen one blue, and the title `Today, for a tech lead`. The app shows one select at the bottom of Today, under all the other cards, and no title change. Source: `src/features/home/role-panels.tsx`.
2. `missing` Button `All role views` (it opens screen 66). Source: `src/features/home/role-panels.tsx`.
3. `look` Panels. The design shows three small stat cards in a row (`Agents at work`, `Failing checks`, `Pull requests to review`), each with a state and `Open`. The app shows two full-width lists (`Runs 7`, `Pull requests to review 7`) with five text rows each and `Open`. Source: `src/features/home/role-panels.tsx`.
4. `missing` Panel `Failing checks`. Source: `src/features/home/role-panels.tsx`.
5. `missing` Card `My work` (`In progress`, `To do`, `Done in 7 days` with counts) and card `Since you were away` with `All news`. The code has `src/features/home/my-work.tsx` and `src/features/home/away.tsx`; the page does not show them in this state.
6. `missing` Card `Panels of the other roles`: one row per role with its panels as chips. Source: `src/features/home/role-panels.tsx`.
7. `look` Time alert. The design puts `No time logged today` in one slim row at the top with `Log your time` on the right. The app puts a tall card near the bottom. Source: `src/features/home/time-reminder.tsx`.

## 98 New project, all steps

Design: `098-newprojectsteps.jpg`. App: `/projects`, `New project`, `All steps`. Capture `newproject-all.jpg`.

1. `look` Frame. The design is a centred 820 px column: title `New project`, a 5-segment bar, then one white card per step with a numbered round badge. The app keeps the dialog, the stepper at the top left, and the steps as plain headings in a 580 px column with no cards. Source: `src/features/projects/new-project/new-project-dialog.tsx`, `src/features/projects/new-project/steps.tsx`.
2. `look` Rows. The design uses settings rows: label on the left, control on the right, a divider between rows. The app stacks fields with no visible label (placeholder only). Source: `src/features/projects/new-project/steps.tsx`.
3. `look` Technology. The design is one row of six chips, the chosen one blue. The app is a 3 by 2 grid of cards. Source: `src/features/projects/new-project/steps.tsx`.
4. `extra` Field `Folder` with `Choose a folder` in step 1. The design step 1 has `Name`, `Short key for tickets`, `Technology`. Source: `src/features/projects/new-project/steps.tsx`.
5. `missing` Step 3: button `Remove` on the member row. Source: `src/features/projects/new-project/steps.tsx`.
6. `look` Step 4. Design title `Where the code lives`, a 3-way control `Only on this computer / Existing / New repository`, rows `Owner and name`, `Address`, `Code host` with the chip `Needs a code host`, `Project in the issue tracker`. App title `Remote`, a 2-way control `Local only / Existing`, `Add a code host` and a select `None`. Source: `src/features/projects/new-project/steps.tsx`, `src/lib/i18n/workspace.ts`.
7. `missing` Choice `New repository`. Source: `src/features/projects/new-project/steps.tsx`.
8. `look` Step 5. Design: row `First move` with `Start an agent / Create the tickets / Later`, the first tickets with `Remove`, the row `Files that Shipyard writes` with a count and `Read them`. App: three cards `Run / Issues / Later` (two greyed), then a file list and a large text editor shown inline. Source: `src/features/projects/new-project/steps.tsx`.
9. `look` Buttons. The design ends step 5 with `Create the project` and has `Back` under the cards. The app footer shows `Back`, `All steps`, `Next`, `Close`, `Create`. Source: `src/features/projects/new-project/new-project-dialog.tsx`.
