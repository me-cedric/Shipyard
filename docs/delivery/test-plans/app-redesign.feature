Feature: app-redesign

  @spec:app-redesign#REQ-001
  Scenario: Six places: The menu
    Given an open project and a role that sees every area
    When the person looks at the main menu
    Then it shows Today, Flow, Plan, Crew, Library, Code, and Setup at the end

  @spec:app-redesign#REQ-001
  Scenario: Six places: One switch
    Given any page of the app
    When the page shows
    Then one section switch at most shows under its title

  @spec:app-redesign#REQ-002
  Scenario: Old addresses: A run address
    Given the address of a run page of before this change
    When the person opens it
    Then the feature page of that run opens

  @spec:app-redesign#REQ-003
  Scenario: Nothing lost: Inventory
    Given the fixed list of the routes and the palette actions of before this change
    When the inventory test runs
    Then each route opens a page and each action runs

  @spec:app-redesign#REQ-004
  Scenario: Ask bar: Shortcut
    Given any page
    When the person presses the palette shortcut
    Then the focus moves to the Ask bar

  @spec:app-redesign#REQ-004
  Scenario: Ask bar: An answer with its action
    Given two blocked features in the release
    When the person asks what blocks the release
    Then the answer names the two features and gives one action for each

  @spec:app-redesign#REQ-005
  Scenario: Full assistant: A selection
    Given a selected text on a page
    When the person opens the actions of the selection
    Then Explain, Fix and Send to an agent show

  @spec:app-redesign#REQ-006
  Scenario: Role view: A viewer
    Given a person with the role viewer
    When the app opens
    Then Today opens and the menu shows no Code place

  @spec:app-redesign#REQ-007
  Scenario: One thing at a time: An agent question
    Given three things that need the person, the first a question of an agent
    When the person opens Today
    Then the title gives the count three, the card shows the question with its answers, and the queue shows the two others

  @spec:app-redesign#REQ-008
  Scenario: One list of news: Same list
    Given three things that need the person
    When the person opens the menu bar panel
    Then it shows the same three things as Today

  @spec:app-redesign#REQ-009
  Scenario: Role panels on Today: A tech lead
    Given a person with the role tech lead and no time logged today
    When the person opens the panels of Today
    Then the panels of the tech lead show, with the person's work and the reminder to log time

  @spec:app-redesign#REQ-010
  Scenario: Five stages: A blocked run
    Given a feature whose run is in the state Blocked
    When the person opens Flow
    Then the feature shows once, in Build, with the mark blocked

  @spec:app-redesign#REQ-011
  Scenario: Three facts on a card: A working feature
    Given a feature on which an agent works and that needs no person
    When the person looks at its card
    Then the card shows its title, the agent and its state, and no attention colour

  @spec:app-redesign#REQ-012
  Scenario: One feature page: From Flow
    Given a feature in Build with a spec change and a run
    When the person opens its card
    Then one page shows the stage line and the six sections

  @spec:app-redesign#REQ-013
  Scenario: One approval for one intent: Send for review
    Given an agent that asks to open a pull request and to move the ticket
    When the person opens the feature
    Then one question shows with the two effects named

  @spec:app-redesign#REQ-013
  Scenario: One approval for one intent: Durable permission
    Given the same question
    When the person ticks "Do not ask again for this recipe" and approves
    Then the next feature of that recipe does not ask for these two effects

  @spec:app-redesign#REQ-014
  Scenario: One action when an agent stops: Budget reached
    Given a feature whose agent stopped at its budget limit
    When the person opens the feature
    Then the main action is Add budget

  @spec:app-redesign#REQ-015
  Scenario: Plain story: Story first
    Given a feature with ten events
    When the person opens its Story
    Then the plain events show and a control opens all ten

  @spec:app-redesign#REQ-016
  Scenario: Crew: People and agents
    Given a project with five people and three agent roles
    When the person opens Crew
    Then both groups show on one page with their current work

  @spec:app-redesign#REQ-017
  Scenario: Live work: Six agents
    Given six agents at work
    When the person opens the live view
    Then six rows show, each with its agent, its feature and what it touches

  @spec:app-redesign#REQ-018
  Scenario: Plan: Too much work
    Given three people over their capacity
    When the person opens Plan
    Then one card names the problem and offers proposals to apply

  @spec:app-redesign#REQ-019
  Scenario: Plan keeps its tools: Preview before the send
    Given a plan with new and changed tasks
    When the person asks to send it to the issue tracker
    Then a preview lists what it creates, what it changes and what stays

  @spec:app-redesign#REQ-020
  Scenario: Library doors: A waiting decision
    Given one proposed decision
    When the person opens Library
    Then the door "why it is so" shows that one decision waits

  @spec:app-redesign#REQ-021
  Scenario: Picture first: An architecture model
    Given an architecture model
    When the person opens it
    Then the picture shows, and a switch shows the text

  @spec:app-redesign#REQ-022
  Scenario: Code: Now
    Given five changed files and four open pull requests
    When the person opens Code
    Then Now shows the five files with the commit box, and the four pull requests

  @spec:app-redesign#REQ-023
  Scenario: Health for every role: A tester
    Given a tester with no right on code
    When the tester opens Flow / Health
    Then the gates show with their state

  @spec:app-redesign#REQ-024
  Scenario: Setup scopes: The issue tracker
    Given a project with no issue tracker
    When the person opens Setup
    Then the guided start shows the issue tracker step, and the connection lives under This project only

  @spec:app-redesign#REQ-025
  Scenario: Two colours with a meaning: Attention only for an action
    Given a page with no thing that needs the person
    When the page shows
    Then no element uses the attention colour

  @spec:app-redesign#REQ-025
  Scenario: Two colours with a meaning: The four uses of the attention colour
    Given one thing that needs the person and one feature that is over its budget
    When the person opens Today and then Crew / Spend
    Then the count of Today in the rail, the attention card and the tag "you" use the attention colour
    And the meter of the feature uses the attention colour

  @spec:app-redesign#REQ-025
  Scenario: Two colours with a meaning: Default theme
    Given a person who has not chosen a theme
    When the app opens
    Then the interface shows in the Light theme

  @spec:app-redesign#REQ-025
  Scenario: Two colours with a meaning: A chosen theme stays
    Given a person who chose the Dark theme before this change
    When the app opens after this change
    Then the interface shows in the Dark theme

  @spec:app-redesign#REQ-026
  Scenario: Sizes: Minimum window
    Given the window at 960 by 600
    When the accessibility run opens each page
    Then no page scrolls sideways and no control is under 44 px high

  @spec:app-redesign#REQ-027
  Scenario: Plain words: Four languages
    Given each of the four languages
    When the language check runs
    Then no key is missing and no text says "tracker" or "forge" alone

  @spec:app-redesign#REQ-027
  Scenario: Plain words: Names in English
    Given the interface in English
    When the person opens Crew and its Recipes section
    Then the menu says Crew, the section says Recipes, and no text says "workflow" or "Factory"

  @spec:app-redesign#REQ-028
  Scenario: Shared components: A new card
    Given a new shared card of the redesign
    When the gallery opens
    Then the card shows there

  @spec:app-redesign#REQ-029
  Scenario: Whole after each wave: After a wave
    Given the end of a wave
    When the inventory test runs
    Then it passes

  @spec:app-redesign#REQ-029
  Scenario: Whole after each wave: Old pages go
    Given a wave whose new pages pass the inventory test
    When the wave ends
    Then the old pages of that wave are removed and their addresses open the new pages

  @spec:app-redesign#REQ-030
  Scenario: Ask an agent to estimate: A proposal
    Given three selected tasks on an open sheet
    When the person asks an agent to estimate
    Then each task shows a proposed best, likely and worst value with its assumptions, and the sheet keeps its old values

  @spec:app-redesign#REQ-030
  Scenario: Ask an agent to estimate: Accept
    Given a proposal for one task
    When the person accepts it
    Then the three values enter the sheet for that task

  @spec:app-redesign#REQ-030
  Scenario: Ask an agent to estimate: Sealed sheet
    Given a sealed sheet
    When the person looks for the action
    Then the action is off

  @spec:app-redesign#REQ-031
  Scenario: Fix all with an agent: One feature
    Given three findings in the health of the project
    When the person chooses "Fix all with an agent"
    Then one feature shows in Flow, in Build, with the three findings in its Brief

  @spec:app-redesign#REQ-031
  Scenario: Fix all with an agent: Normal review
    Given that feature with its changes ready
    When the agent wants to send it for review
    Then the person gets the same approval question as for any other feature

  @spec:app-redesign#REQ-032
  Scenario: Build a tile for me: A proposed tile
    Given a dashboard in edit mode
    When the person describes a tile and asks to build it
    Then a proposed tile shows with Accept and Discard, and the dashboard does not change

  @spec:app-redesign#REQ-032
  Scenario: Build a tile for me: Accept
    Given a proposed tile
    When the person accepts it
    Then the tile is on the dashboard

  @spec:app-redesign#REQ-033
  Scenario: Budget and stop for the new actions: Stop
    Given an agent that estimates tasks
    When the person stops it in Crew
    Then the agent stops and the sheet keeps its old values
