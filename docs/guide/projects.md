# Projects

Projects lists the projects on this computer. Click the project name at the top of the rail, then Projects, to open it. The page shows the open project as a card, with what needs you and the agents at work, then the projects opened before under Opened before.

The buttons of the page are Import projects (it opens Setup / This project), Open a folder, Clone from the code host and New project. You can also drop a folder on the page. A card has Open, and Close for the open project or Remove from the list for another. The three-dot button Details shows the folder, the code host, the branch and the last commit of the project.

## Open a project

1. Click Open on a card of Opened before to open that project.
2. Or click Open a folder and choose the folder of your project. When the folder is not a project yet, click Make it a project.
3. Or click Clone from the code host and give its address.

Close asks first when agents work for the project: Cancel, Stop them and close, or Keep them working. Keep them working closes the project and the runs go on.

## New project

New project is a page of its own, at `/projects/new`. Open it with New project on the Projects page, on the first-run page or on the page No project is open. It asks one question at a time, with five steps: Name, Kind of product, Tools, Team and Ready. All steps shows the five parts on one page: Project, Brief, Team, Where the code lives and Start. Back leaves the page or goes one step back. Each step has defaults. Create the project is on when the name and the parent folder are set. Nothing is made before you click it.

1. Project: the name, the short key for tickets (from the name, you can edit it), the parent folder and the technology: Node, Rust, Python, Java, Go or Other. The technology sets the gates of the project file and the ignore rules of `.gitignore`. The folder must be empty or new: Create the project refuses a folder that holds files.
2. Brief: the vision, the users and the scope, as text that you edit. They go to `docs/brief.md`. Also choose the docs language and the pull request language. Both default to the language of the interface. The agents write specs, diagrams, documents and pull request text in these languages. Code, identifiers, code comments and commit messages stay in English.
3. Team: you are the first member, with a role. Add members with a name and a role. Remove drops a member; it is off on the first row (you), with its reason.
4. Where the code lives: Only on this computer (the default), an existing remote address, or a new private repository on a code host connection (GitHub or GitLab). A public repository is not offered. Also choose an issue tracker connection and its scope.
5. Start: the list of the files that Shipyard writes, with their text. Nothing is written before you click Create the project. Then choose a start:
   - Start an agent: a run of the `bootstrap` recipe, with a plan that waits for your approval, a build, a review and a pull request. It needs a code host connection.
   - Create the tickets: one issue for each line of the scope. You see, edit and remove each one first. They need an issue tracker connection. Shipyard creates the issues only when you click Create issues, and a second click creates no copy.
   - Later.

   The default is the agent when it is possible, else the tickets, else later.

Create the project makes the repository, writes the files, makes the first commit and opens the project. The project is made at the end of the steps, not before. For a new repository, it then makes the repository on the code host, sets `origin` and pushes. When the code host refuses, the local project stays open and the error shows.

## No project is open

When you close the project, or when no project is open after the first launch, one card says No project is open. New project opens the page of the creator. Open a project opens a menu: your recent projects, Projects, Open a folder and Clone a repository. The first-run page is for the first launch only (see Getting started, First launch).

## Project settings

Setup / This project holds the name and the logo of the project, its connections and its health. See the page Setup.
