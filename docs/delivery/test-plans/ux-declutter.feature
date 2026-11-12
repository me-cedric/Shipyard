Feature: ux-declutter

  @spec:ux-declutter#REQ-001
  Scenario: One checklist: One card
    Given a project with nothing set up
    When the person opens Home / Today
    Then one checklist shows the eleven items in order

  @spec:ux-declutter#REQ-002
  Scenario: One rule for done: Same state in both places
    Given the project is linked to an issue tracker connection
    When the person opens Today and then Settings / Me
    Then the issue tracker item is done in both

  @spec:ux-declutter#REQ-002
  Scenario: One rule for done: Label follows the state
    Given the default AI tool is installed and signed out
    When the checklist shows
    Then the AI tool action says Sign in

  @spec:ux-declutter#REQ-003
  Scenario: Where the checklist shows: All done
    Given no item is to do
    When the person opens Home / Today
    Then the checklist does not show

  @spec:ux-declutter#REQ-004
  Scenario: Tour after the first project: Fresh install
    Given a fresh install with no project
    When the app starts
    Then the first-run page shows and the tour does not

  @spec:ux-declutter#REQ-004
  Scenario: Tour after the first project: First project
    Given the tour was never seen
    When the first project opens
    Then the tour opens at step 1

  @spec:ux-declutter#REQ-004
  Scenario: Tour after the first project: Left by a setup action
    Given the tour is open
    When the person clicks a setup action in a step
    Then the tour does not open at the next launch

  @spec:ux-declutter#REQ-005
  Scenario: Continue on the role step: Continue
    Given the role step
    When the person picks a role and clicks Continue
    Then the open-a-project step shows

  @spec:ux-declutter#REQ-006
  Scenario: One no-project page: Any space
    Given no project is open
    When the person opens Work, Specs, Code, Design, Factory or Knowledge
    Then the page offers the three ways to open a project

  @spec:ux-declutter#REQ-007
  Scenario: Empty pages name the missing step: Runs with no AI tool
    Given a project with no AI tool
    When the person opens Factory / Runs
    Then the page names the AI tool as missing and offers to set it up

  @spec:ux-declutter#REQ-007
  Scenario: Empty pages name the missing step: Install asks first
    Given an AI tool that is not installed
    When the person clicks Install
    Then a confirmation names what it installs before anything runs

  @spec:ux-declutter#REQ-008
  Scenario: Glossary: Focus on a term
    Given the checklist shows "Code host"
    When the term gets the keyboard focus
    Then one sentence and a link to the manual show

  @spec:ux-declutter#REQ-009
  Scenario: Activity button: Stop from the panel
    Given one live run and one active session
    When the person opens the Activity panel
    Then each has a stop action and a link to its page

  @spec:ux-declutter#REQ-010
  Scenario: Avatar menu: Theme from the menu
    Given the dark theme
    When the person picks Light in the avatar menu
    Then the app shows the light theme

  @spec:ux-declutter#REQ-011
  Scenario: Ask split button: Toggle
    Given the assistant panel is closed
    When the person clicks Ask
    Then the panel opens

  @spec:ux-declutter#REQ-012
  Scenario: Repository state: Changed files
    Given five changed files and two commits ahead
    When the shell shows
    Then Sync shows 2 ahead and the status bar shows 5 beside Commit

  @spec:ux-declutter#REQ-013
  Scenario: Top bar size: Count
    Given a window of 1100 px
    When the top bar shows
    Then it holds 13 controls or fewer

  @spec:ux-declutter#REQ-014
  Scenario: Twin tabs: Terminal address
    Given a link to `/code/terminal`
    When the person follows it
    Then the terminal drawer opens

  @spec:ux-declutter#REQ-014
  Scenario: Twin tabs: Manual address
    Given a link to `/knowledge/manual`
    When the person follows it
    Then the manual shows

  @spec:ux-declutter#REQ-015
  Scenario: No Home tiles: Numbers kept
    Given three assigned items and a spend today
    When the person opens Today
    Then the items heading shows 3 and the agents heading shows the spend

  @spec:ux-declutter#REQ-016
  Scenario: Nothing lost: Inventory
    Given the list of palette actions and routes before the change
    When the inventory test runs
    Then each one still exists

  @spec:ux-declutter#REQ-017
  Scenario: Page header on every tab: While loading
    Given a tab whose data loads
    When the tab shows
    Then its header shows

  @spec:ux-declutter#REQ-018
  Scenario: Loading and empty patterns: Loading
    Given a page that waits for its data
    When it shows
    Then the shared loading pattern shows

  @spec:ux-declutter#REQ-019
  Scenario: Section list in Settings: Extensions
    Given Settings / Extensions
    When the page shows
    Then the section list shows

  @spec:ux-declutter#REQ-020
  Scenario: Shared data table: Team members
    Given team members
    When the person opens Work / Team
    Then the members show in the shared data table

  @spec:ux-declutter#REQ-021
  Scenario: Tab icons: Icons
    Given the Work space
    When the tab bar shows
    Then each tab has an icon and a name

  @spec:ux-declutter#REQ-022
  Scenario: Inner tab rows: Slide
    Given an inner tab row
    When the person picks another tab
    Then the pill slides to it

  @spec:ux-declutter#REQ-023
  Scenario: One motion source: Preference on reduced
    Given the motion preference on reduced and the system setting off
    When a number changes, a graph lays out and a section list scrolls
    Then none of them animates

  @spec:ux-declutter#REQ-024
  Scenario: Motion gaps: Toast
    Given motion is allowed
    When a toast shows and then goes
    Then it slides in and out

  @spec:ux-declutter#REQ-024
  Scenario: Motion gaps: Loaded content fades in
    Given motion is allowed and a page loads
    When its content replaces the loading pattern
    Then the content under the header fades in and the header does not

  @spec:ux-declutter#REQ-025
  Scenario: Shared timing: No local timing
    Given the source files of the interface
    When the tokens test runs
    Then no transition has a local duration

  @spec:ux-declutter#REQ-026
  Scenario: Languages: Four languages
    Given the new text keys
    When the language test runs
    Then each key exists in the four languages

  @spec:ux-declutter#REQ-027
  Scenario: Run address: Run address
    Given a notification of a run
    When the person clicks it
    Then the run page of that run opens

  @spec:ux-declutter#REQ-028
  Scenario: Run page is a page: Run page is a page
    Given an open run
    When the page shows
    Then the Runs list header does not show above it

  @spec:ux-declutter#REQ-029
  Scenario: Run summary: Run summary
    Given a run in the build step with a pull request
    When the run page shows
    Then the summary shows the step as 2 of 5, the cost, the time and the pull request number

  @spec:ux-declutter#REQ-030
  Scenario: One action per state: One action per state
    Given a cancelled run
    When the person clicks Start again
    Then the page of the new run opens

  @spec:ux-declutter#REQ-031
  Scenario: Needs you first: Needs you first
    Given a paused run
    When the run page shows
    Then one form holds the added budget, the message and Resume

  @spec:ux-declutter#REQ-032
  Scenario: Run tabs: Run tabs
    Given a run with 40 events
    When the person picks Important
    Then only the questions, the errors, the state changes and the results show

  @spec:ux-declutter#REQ-033
  Scenario: Plain run text: Plain run text
    Given a run with the pull request `pr:github:44`
    When the card shows
    Then it shows #44

  @spec:ux-declutter#REQ-034
  Scenario: Runs list bar: Runs list bar
    Given the filter Needs you
    When the board shows
    Then only the runs that wait for a person show

  @spec:ux-declutter#REQ-035
  Scenario: Five lanes that fit: Five lanes that fit
    Given a window of 1100 px
    When the board shows
    Then the five lanes show with no sideways scroll

  @spec:ux-declutter#REQ-036
  Scenario: Run history: Run history
    Given two runs of one ticket, the first failed
    When the person opens History
    Then both runs show

  @spec:ux-declutter#REQ-037
  Scenario: Run card: Run card
    Given a card in plan review
    When the card shows
    Then it has one button, Review plan

  @spec:ux-declutter#REQ-038
  Scenario: Other Factory pages: Other Factory pages
    Given a row of Factory / Sessions
    When the person opens it
    Then the run page opens on the Workflow tab at that session

  @spec:ux-declutter#REQ-039
  Scenario: Diagram frame: Diagram frame
    Given a model wider than the frame
    When Design / Architecture shows it
    Then the whole model shows, and a drag moves it sideways

  @spec:ux-declutter#REQ-040
  Scenario: A tool that ends: A tool that ends
    Given the code graph program ends with code 1
    When the person clicks Index
    Then the page names the program, the code and its last line
