# Redesign: design source

These are the screens of the change `update-app-redesign` (decision 0023 in `docs/decisions/`). They are static mockups, not the product.

- Pictures: `docs/assets/screenshots/redesign/`, one picture for each screen, 1440 px wide.
- Sources: `canvas-source.tar.gz` in this folder. It holds one HTML file for each screen in `project/`, the index `project/canvas.json` and the stylesheet `shared.css`.
- Live canvas: <https://claude.ai/artifact/1uHi9aggUnnnUDchTWGYA2>. It is private to the owner.

## Open a source file

1. Extract the archive: `tar -xzf canvas-source.tar.gz`.
2. In the HTML file, replace the stylesheet address `/_blob/b20004de102502bf4277a5a27aa4db41` with `../shared.css`, and remove the line that loads `./support.js`.
3. Open the file in a browser.

## Limits

- The text in square brackets is a placeholder. Other sample values are invented.
- The pictures come from local copies of the sources, not from the live canvas.
- The names of the places are the English names. French, German and Spanish translate them (`docs/delivery/questions/Q-172.md`, option 1).

## Screens

| No. | Screen | Source file | Picture |
| --- | ------ | ----------- | ------- |
| 1 | Today | `Main.dc.html` | [picture](../../assets/screenshots/redesign/001-main.jpg) |
| 2 | Flow | `Flow.dc.html` | [picture](../../assets/screenshots/redesign/002-flow.jpg) |
| 3 | One feature | `Feature.dc.html` | [picture](../../assets/screenshots/redesign/003-feature.jpg) |
| 4 | Crew | `Crew.dc.html` | [picture](../../assets/screenshots/redesign/004-crew.jpg) |
| 5 | Plan | `Plan.dc.html` | [picture](../../assets/screenshots/redesign/005-plan.jpg) |
| 6 | Library | `Library.dc.html` | [picture](../../assets/screenshots/redesign/006-library.jpg) |
| 7 | Code | `Code.dc.html` | [picture](../../assets/screenshots/redesign/007-code.jpg) |
| 8 | Setup | `Setup.dc.html` | [picture](../../assets/screenshots/redesign/008-setup.jpg) |
| 9 | Ask bar, open | `Ask.dc.html` | [picture](../../assets/screenshots/redesign/009-ask.jpg) |
| 10 | Feature, Brief | `Brief.dc.html` | [picture](../../assets/screenshots/redesign/010-brief.jpg) |
| 11 | Feature, Changes | `Changes.dc.html` | [picture](../../assets/screenshots/redesign/011-changes.jpg) |
| 12 | Flow, List | `FlowList.dc.html` | [picture](../../assets/screenshots/redesign/012-flowlist.jpg) |
| 13 | Crew, Spend | `Spend.dc.html` | [picture](../../assets/screenshots/redesign/013-spend.jpg) |
| 14 | Plan, Estimates | `Estimates.dc.html` | [picture](../../assets/screenshots/redesign/014-estimates.jpg) |
| 15 | Library, Map | `Map.dc.html` | [picture](../../assets/screenshots/redesign/015-map.jpg) |
| 16 | Library, Architecture | `Reader.dc.html` | [picture](../../assets/screenshots/redesign/016-reader.jpg) |
| 17 | Flow, Health | `Quality.dc.html` | [picture](../../assets/screenshots/redesign/017-quality.jpg) |
| 18 | First run | `Welcome.dc.html` | [picture](../../assets/screenshots/redesign/018-welcome.jpg) |
| 19 | Today, dark | `TodayDark.dc.html` | [picture](../../assets/screenshots/redesign/019-todaydark.jpg) |
| 20 | Menu bar panel | `Tray.dc.html` | [picture](../../assets/screenshots/redesign/020-tray.jpg) |
| 21 | Feature, Design | `FDesign.dc.html` | [picture](../../assets/screenshots/redesign/021-fdesign.jpg) |
| 22 | Feature, Checks | `FChecks.dc.html` | [picture](../../assets/screenshots/redesign/022-fchecks.jpg) |
| 23 | Feature, Chat | `FChat.dc.html` | [picture](../../assets/screenshots/redesign/023-fchat.jpg) |
| 24 | Feature, plan review | `FPlan.dc.html` | [picture](../../assets/screenshots/redesign/024-fplan.jpg) |
| 25 | New feature | `NewFeature.dc.html` | [picture](../../assets/screenshots/redesign/025-newfeature.jpg) |
| 26 | Ticket | `Ticket.dc.html` | [picture](../../assets/screenshots/redesign/026-ticket.jpg) |
| 27 | Crew, Recipes | `Recipes.dc.html` | [picture](../../assets/screenshots/redesign/027-recipes.jpg) |
| 28 | Crew, Sessions | `Sessions.dc.html` | [picture](../../assets/screenshots/redesign/028-sessions.jpg) |
| 29 | Crew, Rights | `Rights.dc.html` | [picture](../../assets/screenshots/redesign/029-rights.jpg) |
| 30 | Crew, live work | `Live.dc.html` | [picture](../../assets/screenshots/redesign/030-live.jpg) |
| 31 | Plan, People | `People.dc.html` | [picture](../../assets/screenshots/redesign/031-people.jpg) |
| 32 | Plan, Time | `Time.dc.html` | [picture](../../assets/screenshots/redesign/032-time.jpg) |
| 33 | Library, Specs | `Specs.dc.html` | [picture](../../assets/screenshots/redesign/033-specs.jpg) |
| 34 | Library, Questions | `Questions.dc.html` | [picture](../../assets/screenshots/redesign/034-questions.jpg) |
| 35 | Library, Test plan | `TestPlan.dc.html` | [picture](../../assets/screenshots/redesign/035-testplan.jpg) |
| 36 | Library, Project rules | `Rules.dc.html` | [picture](../../assets/screenshots/redesign/036-rules.jpg) |
| 37 | Library, Decisions | `Decision.dc.html` | [picture](../../assets/screenshots/redesign/037-decision.jpg) |
| 38 | Library, Diagrams | `Diagrams.dc.html` | [picture](../../assets/screenshots/redesign/038-diagrams.jpg) |
| 39 | Library, API | `Api.dc.html` | [picture](../../assets/screenshots/redesign/039-api.jpg) |
| 40 | Library, Data | `Data.dc.html` | [picture](../../assets/screenshots/redesign/040-data.jpg) |
| 41 | Library, Network flows | `Flows.dc.html` | [picture](../../assets/screenshots/redesign/041-flows.jpg) |
| 42 | Library, Screens | `Screens.dc.html` | [picture](../../assets/screenshots/redesign/042-screens.jpg) |
| 43 | Library, Handbook | `Handbook.dc.html` | [picture](../../assets/screenshots/redesign/043-handbook.jpg) |
| 44 | Library, Documents | `Documents.dc.html` | [picture](../../assets/screenshots/redesign/044-documents.jpg) |
| 45 | Library, Slides | `Slides.dc.html` | [picture](../../assets/screenshots/redesign/045-slides.jpg) |
| 46 | Library, Learn | `Learn.dc.html` | [picture](../../assets/screenshots/redesign/046-learn.jpg) |
| 47 | Library, Dashboards | `Dashboards.dc.html` | [picture](../../assets/screenshots/redesign/047-dashboards.jpg) |
| 48 | Code, History | `History.dc.html` | [picture](../../assets/screenshots/redesign/048-history.jpg) |
| 49 | Code, Branches | `Branches.dc.html` | [picture](../../assets/screenshots/redesign/049-branches.jpg) |
| 50 | Feature, Impacts | `Impacts.dc.html` | [picture](../../assets/screenshots/redesign/050-impacts.jpg) |
| 51 | Code, Terminal | `Terminal.dc.html` | [picture](../../assets/screenshots/redesign/051-terminal.jpg) |
| 52 | Code, local changes | `LocalChanges.dc.html` | [picture](../../assets/screenshots/redesign/052-localchanges.jpg) |
| 53 | Code, Pull requests | `PullRequests.dc.html` | [picture](../../assets/screenshots/redesign/053-pullrequests.jpg) |
| 54 | Setup, this project | `SProject.dc.html` | [picture](../../assets/screenshots/redesign/054-sproject.jpg) |
| 55 | Setup, this computer | `SConnections.dc.html` | [picture](../../assets/screenshots/redesign/055-sconnections.jpg) |
| 56 | Setup, models and rules | `SAgents.dc.html` | [picture](../../assets/screenshots/redesign/056-sagents.jpg) |
| 57 | Setup, extensions | `SExtensions.dc.html` | [picture](../../assets/screenshots/redesign/057-sextensions.jpg) |
| 58 | Setup, me | `SMe.dc.html` | [picture](../../assets/screenshots/redesign/058-sme.jpg) |
| 59 | Setup, health of this computer | `SHealth.dc.html` | [picture](../../assets/screenshots/redesign/059-shealth.jpg) |
| 60 | Projects | `Projects.dc.html` | [picture](../../assets/screenshots/redesign/060-projects.jpg) |
| 61 | New project | `NewProject.dc.html` | [picture](../../assets/screenshots/redesign/061-newproject.jpg) |
| 62 | Today, all news | `Inbox.dc.html` | [picture](../../assets/screenshots/redesign/062-inbox.jpg) |
| 63 | Explain a link | `Inspector.dc.html` | [picture](../../assets/screenshots/redesign/063-inspector.jpg) |
| 64 | Account menu and help | `Account.dc.html` | [picture](../../assets/screenshots/redesign/064-account.jpg) |
| 65 | Today, product owner | `TodayPO.dc.html` | [picture](../../assets/screenshots/redesign/065-todaypo.jpg) |
| 66 | Role views | `Roles.dc.html` | [picture](../../assets/screenshots/redesign/066-roles.jpg) |
| 67 | Flow, Done | `Done.dc.html` | [picture](../../assets/screenshots/redesign/067-done.jpg) |
| 68 | System moments | `Dialogs.dc.html` | [picture](../../assets/screenshots/redesign/068-dialogs.jpg) |
| 69 | Plan, estimate sheets | `EstSheets.dc.html` | [picture](../../assets/screenshots/redesign/069-estsheets.jpg) |
| 70 | Ask, full assistant | `Assistant.dc.html` | [picture](../../assets/screenshots/redesign/070-assistant.jpg) |
| 71 | Library, Reports | `Reports.dc.html` | [picture](../../assets/screenshots/redesign/071-reports.jpg) |
| 72 | Plan, Costing | `Costing.dc.html` | [picture](../../assets/screenshots/redesign/072-costing.jpg) |
| 73 | Feature, impact report | `ImpactPlan.dc.html` | [picture](../../assets/screenshots/redesign/073-impactplan.jpg) |
| 74 | Code, new pull request | `NewPull.dc.html` | [picture](../../assets/screenshots/redesign/074-newpull.jpg) |
| 75 | Library, Map of the code | `CodeMap.dc.html` | [picture](../../assets/screenshots/redesign/075-codemap.jpg) |
| 76 | Setup, automation | `Automation.dc.html` | [picture](../../assets/screenshots/redesign/076-automation.jpg) |
| 77 | Library, flow matrix | `FlowMatrix.dc.html` | [picture](../../assets/screenshots/redesign/077-flowmatrix.jpg) |
| 78 | Crew, how agents do | `SpendMore.dc.html` | [picture](../../assets/screenshots/redesign/078-spendmore.jpg) |
| 79 | Manual | `Manual.dc.html` | [picture](../../assets/screenshots/redesign/079-manual.jpg) |
| 80 | Crew, recipe step | `RecipeStep.dc.html` | [picture](../../assets/screenshots/redesign/080-recipestep.jpg) |
| 81 | Feature, when an agent stops | `RunActions.dc.html` | [picture](../../assets/screenshots/redesign/081-runactions.jpg) |
| 82 | Setup, look and layout | `Appearance.dc.html` | [picture](../../assets/screenshots/redesign/082-appearance.jpg) |
| 83 | Crew, budgets | `Budgets.dc.html` | [picture](../../assets/screenshots/redesign/083-budgets.jpg) |
| 84 | Crew, team file | `Team.dc.html` | [picture](../../assets/screenshots/redesign/084-team.jpg) |
| 85 | Plan, one estimate | `EstimateRow.dc.html` | [picture](../../assets/screenshots/redesign/085-estimaterow.jpg) |
| 86 | Library, edit a dashboard | `DashEdit.dc.html` | [picture](../../assets/screenshots/redesign/086-dashedit.jpg) |
| 87 | Setup, share Shipyard with other tools | `McpWiring.dc.html` | [picture](../../assets/screenshots/redesign/087-mcpwiring.jpg) |
| 88 | Setup, plugins and rule packs | `Plugins.dc.html` | [picture](../../assets/screenshots/redesign/088-plugins.jpg) |
| 89 | Setup, tickets | `TicketsSetup.dc.html` | [picture](../../assets/screenshots/redesign/089-ticketssetup.jpg) |
| 90 | Feature, changed files | `PullFiles.dc.html` | [picture](../../assets/screenshots/redesign/090-pullfiles.jpg) |
| 91 | Setup, health of this project | `ProjectHealth.dc.html` | [picture](../../assets/screenshots/redesign/091-projecthealth.jpg) |
| 92 | Today, panels by role | `TodayRoles.dc.html` | [picture](../../assets/screenshots/redesign/092-todayroles.jpg) |
| 93 | Plan, send to the issue tracker | `ApplyPlan.dc.html` | [picture](../../assets/screenshots/redesign/093-applyplan.jpg) |
| 94 | Plan, import from Excel | `ExcelImport.dc.html` | [picture](../../assets/screenshots/redesign/094-excelimport.jpg) |
| 95 | Library, what is tested | `Coverage.dc.html` | [picture](../../assets/screenshots/redesign/095-coverage.jpg) |
| 96 | Library, report forms | `ChangeRequest.dc.html` | [picture](../../assets/screenshots/redesign/096-changerequest.jpg) |
| 97 | Feature, files of the change | `ChangeFiles.dc.html` | [picture](../../assets/screenshots/redesign/097-changefiles.jpg) |
| 98 | New project, all steps | `NewProjectSteps.dc.html` | [picture](../../assets/screenshots/redesign/098-newprojectsteps.jpg) |
| 99 | Plan, dates and days off | `PlanSettings.dc.html` | [picture](../../assets/screenshots/redesign/099-plansettings.jpg) |
| 100 | Setup, logs and feedback | `HealthPanels.dc.html` | [picture](../../assets/screenshots/redesign/100-healthpanels.jpg) |
| 101 | Crew, one person | `Member.dc.html` | [picture](../../assets/screenshots/redesign/101-member.jpg) |
