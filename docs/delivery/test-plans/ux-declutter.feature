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
