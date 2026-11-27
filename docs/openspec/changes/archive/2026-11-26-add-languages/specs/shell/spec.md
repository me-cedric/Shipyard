# Delta: shell

## MODIFIED Requirements

### Requirement: REQ-011 Language

The app SHALL ship in English, French, German and Spanish. The person SHALL switch the language in Settings / Me. The switch SHALL apply without a restart. A language pack MAY add a language (spec `languages`).

#### Scenario: Switch to French
- GIVEN the language is English
- WHEN the person chooses French
- THEN the sidebar, the palette and the menus show French

#### Scenario: Switch to German
- GIVEN the language is English
- WHEN the person chooses German
- THEN the sidebar, the palette and the menus show German
