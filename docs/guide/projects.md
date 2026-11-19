# Projects

Projects lists the projects on this computer. Click the project name in the top bar to open it. It shows the project that is open now, the projects opened before with their code host as a badge, and the ways to start one.

With no project open, each place shows the same choice: Open a folder, Clone a repository and New project.

## Open a project

1. Click a project of the list to open it.
2. Or click Open a folder and choose the folder of your project. When the folder is not a project yet, click Make it a project.
3. Or click Clone a repository and give its address.

## New project

Click New project on the Projects page, on the first-run page or on the no-project page. The creator has five steps: Project, Brief, Team, Remote and Start. All steps shows them on one page. Each step has defaults. Create is on from the first step when the name and the parent folder are set.

1. Project: the name, the key (from the name, you can edit it), the parent folder and the stack: Node, Rust, Python, Java, Go or Other. The stack sets the gates of the project file and the ignore rules of `.gitignore`. The folder must be empty or new: Create refuses a folder that holds files.
2. Brief: the vision, the users and the scope, as text that you edit. They go to `docs/brief.md`. Also choose the docs language and the pull request language. Both default to the language of the interface. The agents write specs, diagrams, documents and pull request text in these languages. Code, identifiers, code comments and commit messages stay in English.
3. Team: you are the first member, with a role. Add or remove members with a name and a role.
4. Remote: Local only (the default), an existing remote address, or a new private repository on a code host connection (GitHub or GitLab). A public repository is not offered. Also choose an issue tracker connection and its scope.
5. Start: the list of the files that Create writes, with their text. Nothing is written before you click Create. Then choose a start:
   - A run of the `bootstrap` recipe: a plan that waits for your approval, a build, a review and a pull request. It needs a code host connection.
   - Starter issues: one issue for each line of the scope. You see, edit and remove each one first. They need an issue tracker connection. Shipyard creates the issues only when you click Create issues, and a second click creates no copy.
   - Later.

   The default is the run when it is possible, else the issues, else later.

Create makes the repository, writes the files, makes the first commit and opens the project. For a new repository, it then makes the repository on the code host, sets `origin` and pushes. When the code host refuses, the local project stays open and the error shows.

## Project settings

Setup / This project holds the name and the logo of the project, its connections and its health. See the page Setup.
