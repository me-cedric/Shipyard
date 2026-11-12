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

  @spec:ux-declutter#REQ-041
  Scenario: Pull request page: Open and go back
    Given a pull request in the list that the search filtered
    When the person opens it and clicks Back
    Then the page showed its title, branches, line counts and four tabs, and the list shows with the same search

  @spec:ux-declutter#REQ-042
  Scenario: Pull request list: Search
    Given a list of eight pull requests
    When the person types a word in the search
    Then only the pull requests that match it show

  @spec:ux-declutter#REQ-042
  Scenario: Pull request list: Needs review
    Given an open pull request that is not a draft, in the in-review lane, and a draft one
    When the person picks Needs review
    Then only the first one shows, and no row shows an author

  @spec:ux-declutter#REQ-043
  Scenario: Merge box: Segments and confirmation
    Given a pull request with two failing checks and one unresolved thread
    When the Overview shows and the person clicks Merge
    Then the box names two failing checks and one unresolved thread, and the confirmation names the method and the risk, with Confirm and Cancel

  @spec:ux-declutter#REQ-043
  Scenario: Merge box: Merge method
    Given a code host that offers Merge, Squash and Rebase
    When the person picks Squash in the menu and clicks Merge
    Then the confirmation names Squash

  @spec:ux-declutter#REQ-044
  Scenario: Description and sidebar: Cited by
    Given a pull request that links a ticket and that another item cites
    When the Overview shows
    Then the description shows as Markdown, the sidebar lists the ticket as a link and the citing item under Cited by, and it shows no label

  @spec:ux-declutter#REQ-045
  Scenario: Files changed: Collapsed
    Given a pull request with forty-five files
    When the Files changed tab shows
    Then all rows are collapsed, expanding one shows its diff, and Expand all opens thirty and offers Expand next 15

  @spec:ux-declutter#REQ-045
  Scenario: Files changed: Viewed marks
    Given a pull request with three files
    When the person marks one file as viewed
    Then the count shows 1 / 3 viewed and the mark stays on this computer

  @spec:ux-declutter#REQ-045
  Scenario: Files changed: Cut list
    Given a code host list that was cut at 3000 files
    When the Files changed tab shows
    Then the tab says "Showing the first 3000 files"

  @spec:ux-declutter#REQ-046
  Scenario: Shared file parts: Line numbers
    Given a file list on the pull request page and one on the run page
    When both show
    Then they use the same collapsed file list and the same diff component with line numbers

  @spec:ux-declutter#REQ-047
  Scenario: General comments: Author and time
    Given a pull request with two comments
    When the Overview shows
    Then both comments show as Markdown with their author, date and time

  @spec:ux-declutter#REQ-047
  Scenario: General comments: Only the newest comments
    Given a pull request whose code host returned only the newest comments
    When the Overview shows
    Then a note says that it shows the latest comments

  @spec:ux-declutter#REQ-048
  Scenario: Threads: Resolve
    Given an unresolved thread
    When the person clicks Resolve
    Then the thread shows the Resolved mark and the merge box counts one unresolved thread fewer

  @spec:ux-declutter#REQ-048
  Scenario: Threads: Reply
    Given an unresolved thread
    When the person writes a reply and clicks Post reply
    Then the code host receives the reply and the thread keeps its place

  @spec:ux-declutter#REQ-048
  Scenario: Threads: A thread cut short
    Given a thread with 80 comments of which the code host returned the last 50
    When the thread shows
    Then a note says "Showing the last 50 of 80 comments"

  @spec:ux-declutter#REQ-048
  Scenario: Threads: Review threads cut short
    Given a merge request with more review threads than the code host read cap
    When the Overview shows
    Then a note says "Showing the first N review threads"

  @spec:ux-declutter#REQ-049
  Scenario: Inline comments: Submit review
    Given two pending comments on two lines of the new side
    When the person clicks Submit review and picks Comment
    Then the code host receives one review with both comments and the pending list is empty

  @spec:ux-declutter#REQ-049
  Scenario: Inline comments: Single comment
    Given an open comment box on a line
    When the person clicks Add single comment
    Then the code host receives a one-comment review and the pending list does not change

  @spec:ux-declutter#REQ-049
  Scenario: Inline comments: Partial result
    Given three pending comments of which the code host cannot place one
    When the person submits the review
    Then the page clears the two that were sent and keeps the third as pending

  @spec:ux-declutter#REQ-050
  Scenario: Pending review is kept: Restart
    Given a pending comment and a restart
    When the person opens the pull request again
    Then the pending comment is still there

  @spec:ux-declutter#REQ-050
  Scenario: Pending review is kept: Storage refuses
    Given a browser storage that refuses a write
    When the person adds a comment to the review
    Then the page says "This comment is not saved on this computer" and keeps the comment in memory

  @spec:ux-declutter#REQ-050
  Scenario: Pending review is kept: File left the pull request
    Given a pending comment on a file that the pull request no longer has
    When the Files changed tab shows
    Then the group "Comments on files no longer in this pull request" shows the comment in full

  @spec:ux-declutter#REQ-051
  Scenario: Code host limits: A comment with no line
    Given a code host that cannot place one comment on a line
    When the person submits the review
    Then that comment goes into the review text and a notice says so

  @spec:ux-declutter#REQ-051
  Scenario: Code host limits: A refusal
    Given a code host that refuses the whole review
    When the person submits it
    Then the refusal text shows and every comment stays pending

  @spec:ux-declutter#REQ-052
  Scenario: Pull request rights: Viewer
    Given a viewer
    When the person opens a pull request
    Then the write box, the reply, the resolve, the "+" and the submit controls are off with their reason
