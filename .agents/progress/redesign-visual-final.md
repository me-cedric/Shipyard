# Final visual check of the redesign (2026-11-21)

Each screen of the built app (frozen demo build, mock data, 1440 px wide) was put in the state of its design picture in `docs/assets/screenshots/redesign/` and compared with it. Five agents made the captures and the verdicts. The lead read three pairs again (003, 004, 006) and found the same verdicts.

Verdicts: match (same layout, cards, controls and labels; sample data can differ), minor (small look difference, or a logical deviation that keeps each function), major (missing or extra section or control, other layout, broken page).

Result: 51 match, 49 minor, 1 major, 0 not found, of 101 screens. The one major gap (068, Leave this page with no file and no save) is fixed: the question names the file and offers Stay, Leave and Save and leave (picture `leave-page.png`, SCR-193).

| Design | Group | Verdict | Differences |
| --- | --- | --- | --- |
| 001 | today-ask-shell | minor | Top right shows 'Changed files (6)' badge, not the green 'In sync' pill; Pick chip reads "Agent's pick", design "Builder's pick"; Extra segmented 'Needs you / News / Activity' beside title and extra 'More' button; Working now rows add action text and a square; no 'Log your time for today' card (mock has time logged) |
| 002 | flow-feature | match | Extra '...' menu next to New; sample data and counts differ |
| 003 | flow-feature | match | Back link says 'Back', design says 'Flow'; agent shows recipe name 'Build', design 'Builder'; Decision chips show raw action names ('Change the status of ACME-2'), design shows plain consequences; Agent card adds age '22d 17h'; extra '...' menu |
| 004 | crew-plan | match | Sample data differs (names, agent list, recipe list); an extra Bootstrap recipe row. Layout, cards, pills and controls are the same. |
| 005 | crew-plan | match | Extra milestone diamonds and a today line on the chart; bar order of the Export tasks differs (data). |
| 006 | library | match | Opened last rows have no kind pill and no chevron; each row has a Pin button.; Top bar has back, forward and panel buttons and a project switch (shell, same on all screens). |
| 007 | code-setup | minor | Extra button row (Terminal, Files, Open pull request) under Product health.; Pull request card lists 9 rows with Draft and Checks run pills (sample data). |
| 008 | code-setup | match | Open step is 'AI tool' (mock state), design shows 'Issue tracker'; same layout, tiles, Skip and black primary button.; Scope card pills read 'Connections to make: 1' not '2 connections to make'. |
| 009 | today-ask-shell | match | Answer text and rows differ by mock data (1 feature, 'Unblock' instead of 'Open'); Go to rows are 'Flow, Flow' and 'Plan, Timeline'; Sync now shows a key hint |
| 010 | flow-feature | minor | Mock feature has no spec and no open question: shows 'No spec yet' + 'Write the spec', not the question card and requirement rows (the add-auth capture 010c shows rows, Add a requirement, Edit as text, Test plan); Design card has 'Design to code' beside Link a screen; app shows only 'Link a screen' when no screen is cited; Tickets card lacks 'Split into more tickets' when the feature has a ticket; Linked card shows an estimate, not the spec (src/features/flow/feature/brief.tsx) |
| 011 | flow-feature | match | Reviewer line shows no avatar/state when no reviewer (ACME-5); Merge button disabled-grey in design only |
| 012 | flow-feature | match | Rows without a run show an empty agent column; extra '...' menu |
| 013 | crew-plan | match | Same layout and controls; app shows top 6 features with an '8 more' link (design: all 10). |
| 014 | crew-plan | match | Test pass shows a percent stepper (25 %) and task names are blue links; Lot button reads 'Lot: MVP 1' (data and state). |
| 015 | library | match | Extra groups (Changes, Data, API) and a header overflow menu; first spec is auth, not export (sample data). |
| 016 | library | match | Default mode is Picture; design opens on Both.; Text pane has line numbers and syntax colour; Save is greyed until a change; four zoom buttons, not three. |
| 017 | flow-feature | match | Gate names and states differ (mock data); 'Set up' button on not-installed gates is an addition |
| 018 | today-ask-shell | minor | Tenth card 'Other' selected by default; design selects Developer and has nine cards; Some role icons differ; content sits higher on the page |
| 019 | today-ask-shell | minor | Same differences as 001 (Changed files badge, segmented switch, More button, Agent's pick); Dark tones, inverted Send button and flat cards match |
| 020 | today-ask-shell | minor | No 'Log your time for today' card (mock has time logged); Extra 'All 12' and 'All 6' links; rows read 'Answer a question' for all items (mock data) |
| 021 | flow-feature | minor | Mock feature cites no screen, diagram or decision, so 'Design to code', the Builder 'no screen yet' card (Not needed / Build it) and Decisions card do not show; code exists in src/features/flow/feature/design.tsx; Screens card shows one 'No screen linked' box, not two screen tiles |
| 022 | flow-feature | match | Failing checks show no first error line (mock log empty); test plan empty on the PR (ACME-5 capture 022 shows scenarios) |
| 023 | flow-feature | match | Composer is below the 940 px fold in the capture; approvals show action names with a 'Details' fold |
| 024 | flow-feature | match | 'Agent may do alone' lists 4 rows with 'Does it alone' pills (design 3 rows 'Asks first'); mock rights differ |
| 025 | flow-feature | match | Recipe preselects 'Bootstrap', design 'Feature'; Limit field has a '$' prefix; No ticket rows with 'Start an agent' (mock has no issue tracker) |
| 026 | flow-feature | minor | Fields card has own set (Issue type, Assignee, Status, Estimate in days...) and an Agent 'Start run' row; design has Kind, Owner, Estimate, no Start run; 'In sync with the issue tracker' pill not seen (mock has no issue tracker); no ticket comment from the tracker; Agent card sits lower, under the fields card |
| 027 | crew-plan | minor | Person step 'You review the plan' has no role pill (design: Tech lead); Show what changed and Save are disabled until an edit.; Recipe list has 5 recipes and scrolls under New recipe; the proposal card names a different recipe (data). All functions present. |
| 028 | crew-plan | minor | List shows all 44 sessions in the card (design: 3), so the Orca and Ended cards sit far below the fold.; Output panel button reads 'Open' (design: Take control); Orca card shows 'Open in Orca' (design: None + Connect).; Source: src/features/crew/sessions.tsx |
| 029 | crew-plan | minor | 'Approve agent actions' uses No/Yes and 'Code and merge' has an extra toggle (design: No/See/Change on all ten rows).; Role chip 'Business analyst' (design: Analyst); the same people sit in a different order (data). |
| 030 | crew-plan | minor | Section tabs sit left of the Cards/Live switch, and Cards comes first (design: switch left of the tabs).; No blue connector lines for active rows; file chips show raw names (acme_2.ts) instead of spec:/src chips.; Source: src/features/crew/live.tsx |
| 031 | crew-plan | match | Proposals differ (3 instead of 2) and the button reads 'Apply all' (design: Apply both); same layout and controls. |
| 032 | crew-plan | minor | No black Save button in the header (design has Save); 'Keep a receipt' is disabled with no edits; person is a dropdown, not a pill with avatar.; Week opens on 2 Nov and shows hours as '3h'; small warning triangles on some cells. Source: src/features/plan/time.tsx |
| 033 | library | match | Opens on auth, not the open-question spec; requirement pills say Tested / No test yet / Fail, not Built, tested / Not built.; Changes in progress row is a link with a chevron; no Archive button when no change is finished. |
| 034 | library | match | Open cards in a different order; one title is underlined (hover). |
| 035 | library | match | Opens on Login plan (sample data); long title wraps to two lines. |
| 036 | library | match | Rights list has five roles, not two; Earlier versions card is below the fold. |
| 037 | library | match | Section labels read Context and problem statement / Decision outcome; Used by shows a document, no spec or architecture row. |
| 038 | library | minor | In the open diagram card shows only Change the format and Ask for a change; Zoom and Fit the window rows are not in the card (they show in the open editor, not checked). |
| 039 | library | minor | Try it uses a server dropdown, a method dropdown and a path field plus a free text value field, not a value switch and one address field.; Extra Responses block; the contract file row is orders.yaml with version, not openapi.yaml with a chevron. |
| 040 | library | match | Four zoom buttons, not three. |
| 041 | library | match | Ends show IP ranges, not brick and host names (mock data has no names); list is longer. |
| 042 | library | match | Two screens in the grid, not six; token cards show real names (sample data). |
| 043 | library | match | Pages that link here card not shown on the opened page; changed-by line shows only on pages with an author (Getting started). |
| 044 | library | match | Extra Export row in the File card; PDF button is greyed; extra overflow menu beside Edit. |
| 045 | library | match | Extra Find a deck field in the header. |
| 046 | library | match | Add a word is a plain button, not a blue link; stage pills only on some steps; extra Learning paths card and a refresh icon on Feeds. |
| 047 | library | minor | Switch is Team / Agents / Delivery / Quality; no Reports entry (Reports is a separate chip on Library home).; Extra Everyone dropdown; milestone picker reads All releases; tiles have an overflow menu; one tile greyed (Source off: quality). |
| 048 | code-setup | minor | Extra 'More' link under the detail buttons.; Commit rows show full date and PR number (sample data). |
| 049 | code-setup | minor | Extra amber banner (default branch line, specs-changed warning with Acknowledge / Update with an agent).; Extra 'More' link at the bottom; Save button disabled (empty field). |
| 050 | flow-feature | minor | Mock change has no stale docs: action card shows 'No doc goes stale' with only 'Full impact report' (no Show the docs / Fix with an agent); middle column 'Not known yet'; 'Features that share these files' card missing; title is the PR title with '...' menu |
| 051 | code-setup | match | Tab is 'Terminal 1' with no Tests tab; file tree and output are sample data. |
| 052 | code-setup | minor | Auto-review comment block (Reviewer, Reply, Apply the fix, Solved) not shown; auto-review is off in the mock state.; Extra 'More' links under the conflict banner and in the commit card.; Diff is a plain 2-line sample; Commit button disabled grey until a message is typed. |
| 053 | flow-feature | match | Review panel preselects Comment and first row; Merged card lacks 'All merged pull requests' link (one item only); all avatars 'AL' |
| 054 | code-setup | minor | More card carries 8 extra rows (Issue tracker, Code host, Issue tracker scope, Repository, Logo, Remote, Look at the remote every, Public holidays); functions kept, design has 4 rows.; Issue tracker card is Connected with a Change button (mock state). |
| 055 | code-setup | minor | Extra 'More / Advanced' row card at the bottom.; Device sign-in button disabled (mock state). |
| 056 | code-setup | minor | Agent roles list 7 roles, each with a long description sentence (design: 3 roles, no description).; Extra 'More' row in Models and extra 'More / Codex' card at the bottom. |
| 057 | code-setup | minor | Extra 'Settings / More' row in Installed plugins.; Section switch also has an 'Automation' pill (needed for screen 76). |
| 058 | code-setup | minor | Extra 'More' rows (Updates, Tools) and a bottom 'More' card (Theme files, Language files, Each notification); functions kept.; Diagram format shows Excalidraw, role shows Other (sample data). |
| 059 | code-setup | minor | Extra 'More / Toolchain / Details' card; design opens it from the Tools tile and Details.; Three amber tiles (Tools, Skills, First setup) and '8 problems' title come from mock data. |
| 060 | today-ask-shell | match | Extra '...' menu on each card; Earlier projects show 'Website' and 'Mobile app' (mock data) |
| 061 | today-ask-shell | match | Cards are Node, Rust, Python, Java, Go, Something else instead of [STACK] placeholders; icons differ |
| 062 | today-ask-shell | minor | Extra '...' menu and per-row dismiss (x); rows show time; 'Older news' link absent (only shown with older rows); All five 'Tell me when' switches on; design has the sync one off |
| 063 | today-ask-shell | match | Card has two plain sentences less (one generic line); extra 'More' button under the ref row |
| 064 | today-ask-shell | minor | Menu matches (header with Change, Theme segment, Language, Manual F1, Shortcuts, What is new, tour, update, About, Sign out); extra 'Health (2)' row; Shortcuts and What is new open as centred dialogs with a blurred page, not side cards; Shortcuts rows: key on the left with Change button, 22 rows; What's new shows 'No notes for this version.' |
| 065 | today-ask-shell | minor | Sidebar still shows Code and Plan for Product owner; design hides Code (hidden places follow the rights level); Item 'Groom 2 ideas' not in the list (mock data); same shell differences as 001 |
| 066 | today-ask-shell | minor | Only 'I only look' hides Code; design strikes through places for six roles (Code, Plan, Crew); 'Starts on' names a section (Library, Specs) where design names a place |
| 067 | flow-feature | match | 'Who' shows recipe-step names (Build, Report, Pr, Grill) not agent names; Start again only on one failed row (mock) |
| 068 | today-ask-shell | major, fixed | 'Leave this page?' has only Close and Leave: no file list, no 'Save all' (src/ui/atoms/leave.tsx, src/lib/i18n/ui.ts); 'This file changed on the disk' not reachable in the browser mock; Permissions card shows 2 rows, no keychain row; close guard lists raw keys (ACME-8) without agent avatars; tour has 6 steps with no stage chips; rename needs a Review step first; Dialogs sit on a blurred page, not as bare bordered cards |
| 069 | crew-plan | match | Spread is one month bar (design: four week bars); Portfolio adds an All total row; the Costing tab is also present (data and small details). |
| 070 | today-ask-shell | match | Context chips are 'This screen' and 'Add' only (no 'A file', 'Spec: export'); Selection buttons disabled with no selection; Codex card adds a line 'What this writes'; Panel card sits below the fold |
| 071 | library | minor | Opens on Word with PDF greyed; design opens on PDF.; Card set differs: Complete dossier (Fill the form), Work done has Fill the form only, extra Image (PNG), Schedule and Estimate workbook open Plan or Estimates; no Export on Work done. |
| 072 | crew-plan | minor | Seal card has one Seal button and state 'Not sealed' (design: Lock and Unlock, state 'Open'); the passphrase field and note are present.; Cost and Price read 'Unrated' because the mock has unrated profiles (data). |
| 073 | flow-feature | match | Action lines have a 'Nobody' select, not an avatar chip; title wraps to two lines |
| 074 | flow-feature | match | 'Close the pull request' and 'Mark as ready' absent: no pull request exists yet in this state; Merge with preselects Merge (design Squash); Title empty; stale-doc card names 'Test plans' |
| 075 | library | minor | Stale chip is missing (only Orphans); Who calls it card hidden when the symbol has no caller. |
| 076 | code-setup | minor | Extra rows 'Per project', 'By status' (How many at once) and 'Every state' (status map), each with Edit.; 'Off means: the agent asks in Today' is plain text with an Open Today row, not a pill plus link. |
| 077 | library | minor | Not in the code chip and the denied-flow attention card (Show it, Ask for the change) appear only after Check against the code is clicked; the capture shows the state before the check.; Extra VLAN or VNET and Protocol dropdowns; rows show IP ranges and a row menu. |
| 078 | crew-plan | match | Same three cards and controls (run strip, The runs, Tree/Flame, machine bars); machine card adds AI tool bars (data). |
| 079 | today-ask-shell | match | List has more pages than the eight of the design (Projects and more); Top bar present around the page |
| 080 | crew-plan | minor | Full page with back link, four cards, Limits, Mode, Place in the recipe, Remove the step all present.; Agent, Model, Effort, Skill are dropdowns (design: pill buttons); Time limit and Budget of the step are empty inputs; 'May write' row is absent in the People card; Works in has a third option (No folder). |
| 081 | flow-feature | match | Limit card: stepper and Add budget are small and left-aligned, not full width (081c); Failed, Finished outside Shipyard and Paused cards not reachable in the mock (strings exist in src/lib/i18n/flow.ts and factory.ts); extra 'Reply on the ticket' card shows on every stop state |
| 082 | code-setup | minor | Extra 'Preview' row in Motion and focus, extra 'More' rows under Colour and More, this computer.; Dates value is a long 'As the language (10/31/2026)' button. |
| 083 | crew-plan | minor | 'Then: Stop and ask / Go on' is a per-limit dropdown inside Limits (design: one switch in 'At the limit'); extra per-person row.; Each limit still has Edit and a value; chart and Day/AI tool/Model/Project switch match. |
| 084 | crew-plan | minor | 'Ask to join' card and 'Move the roles to the team file' button do not show in the mock (conditional in src/features/work/team-rights.tsx: not-a-member, and roles in project file).; Extra yellow 'You are ada (Solo)' banner and a 'Rights of each person' link card; join request, log, Open the file are present. |
| 085 | crew-plan | minor | 'Many tasks at once' card shows only with several tasks selected (src/features/work/estimate-backlog.tsx); not shown for one task.; Best and Worst steppers are empty for this task; Ticket shows 'Choose a ticket' (no ticket in the mock); an explicit Save button was added; assumptions list empty. |
| 086 | library | match | Add a tile offers ten kinds, not seven; dashboard is named Team. |
| 087 | code-setup | minor | AI tool card lists Claude Code, Codex, VS Code; design lists Claude Code, Codex, GitHub Copilot, Gemini CLI, OpenCode. The mock wiring targets are 3 (mock-doctor.ts), so Copilot, Gemini CLI and OpenCode cannot be connected here.; Extra 'More / What they may use' row card. |
| 088 | code-setup | match | Review card is richer than the design (checkbox per line, Refused list, Review button), same Refuse and Apply controls.; Send card button reads 'Deploy to 1' not 'Send'. |
| 089 | code-setup | minor | Status rows show a 'Map' button; design shows the stage value (Idea, Spec, Build, Review, Ready).; Unit switch has a third 'None' choice; kind chip is Sub-task not Bug. |
| 090 | flow-feature | match | Mock PR has one file, so the seen count is 0 of 1; Before/After picture view not provable (no picture file); thread shown in the diff, plus a 'Whole file' link instead of 'Open' |
| 091 | code-setup | minor | Extra 'More / Skills / Show all' card.; Back link is 'Details' not 'Health of this computer'; two finding cards, not three (mock data). |
| 092 | today-ask-shell | match | No 'No time logged today' alert row (mock has time logged); Role chips, stat cards, My work, Since you were away and Panels of the other roles all present; counts and wording differ (I only look, 17 more) |
| 093 | crew-plan | minor | Mock has no existing tickets, so one 'Create, 8' card shows (no Change or No change cards); each row has a small edit icon.; Reachable from the 'Send to the issue tracker' button on People. |
| 094 | crew-plan | match | Same page: three numbered rows, Rows that the file gives, Rows that Shipyard refuses, Cancel. The 'sheet exists' choice (Replace it) shows only when the name clashes; the capture shows the new-sheet case. |
| 095 | library | match | Counts differ (sample data); Partial and Blocked cards are empty; Check of the scenarios card is below the fold. |
| 096 | library | minor | Write the report button sits below the format switch, not beside it; version fields are text inputs.; Written result card appears only after a write; Write refuses an empty form (the capture shows the refusal text). |
| 097 | flow-feature | minor | Route /spec opens on Proposal, not Spec (the same file switch exists; mock data differs); No open-marker card ('Go to it') because add-auth has no marker; all files show Draft, 0 of 5 done |
| 098 | today-ask-shell | minor | Extra Folder row with Choose a folder in step 1; brief fields are text areas with default text; Repository control shows 'Only on this computer / Existing' only; 'New repository' and Owner and name and Address rows are hidden until a code host exists; Row 'Issue tracker' with a select 'None' instead of 'Project in the issue tracker'; first move defaults to Later; Create the project disabled; Remove disabled for the only member |
| 099 | crew-plan | match | Task card appears only after a click on a task bar (Dates and days off alone shows five cards without it); Who and Release use dropdowns, Release is 'None' (data). |
| 100 | code-setup | minor | Notifications row shows 'Not asked' + Allow; 'Send a test notification' not visible in this state.; Card title is 'Personas', not 'Personas for prices'; Copy the log button sits before the All/Info switch; extra 'More' row in Feedback and a 'More / Tour' card. |
| 101 | crew-plan | minor | Day rate is a plain number field (design: Sealed pill + Unlock); Extra rights shows no chips; Accounts holds a text list.; Back link is '< Crew' (logical, since the page opens from Crew); Away rows absent because the mock has none; Available from/until show field labels, not dates. |
