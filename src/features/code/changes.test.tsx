import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openSync } from "@/features/shell/test-open";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedAgentPr } from "@/lib/ipc/mock-agent-pr";
import { seedCode } from "@/lib/ipc/mock-code";
import { seedPrs } from "@/lib/ipc/mock-code-prs";
import { mountApp } from "@/test/mount";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const main = () => screen.getByRole("main");
/** The title of the page of the local changes counts the files to commit. */
const title = (name: string) => screen.findByRole("heading", { name });
// The commit action of the old status bar is in the card of the sync mark.
const commitOfCard = async (user: Parameters<typeof openSync>[0]) => {
	const card = await openSync(user);
	// Until the staged files load, Commit is a link to the page of the changes.
	await waitFor(() => expect(card.getByRole("button", { name: "Commit" })).toBeInTheDocument());
	return card.getByRole("button", { name: "Commit" });
};
const list = () => within(screen.getByRole("list", { name: "Files" }));
const box = () => within(screen.getByRole("form", { name: "Commit" }));

async function changes() {
	await open();
	mountApp("/code/changes");
	await title("4 files to commit");
}

describe("Code / the files to commit", () => {
	it("shows one flat list: a checkbox per file, its path and the lines added and removed", async () => {
		await changes();
		for (const path of ["docs/guide.md", "README.md", "src/app.ts", "src/lib/util.ts"])
			expect(list().getByRole("checkbox", { name: `Select ${path}` })).toBeInTheDocument();
		// util.ts has a staged and an unstaged change: its box is half checked.
		expect(list().getByRole("checkbox", { name: "Select src/lib/util.ts" })).toBePartiallyChecked();
		expect(list().getByRole("checkbox", { name: "Select src/app.ts" })).not.toBeChecked();
		expect(list().getByText("Untracked")).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: /^Staged/ })).toBeNull();
	});

	it("offers the actions of a file in its context menu and stages it", async () => {
		const user = userEvent.setup();
		await changes();
		fireEvent.contextMenu(list().getByRole("button", { name: "src/app.ts" }));
		const menu = await screen.findByRole("menu");
		expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((i) => i.textContent),
		).toEqual(["Stage", "Discard", "Copy path"]);
		await user.click(within(menu).getByRole("menuitem", { name: "Stage" }));
		await waitFor(() =>
			expect(list().getByRole("checkbox", { name: "Select src/app.ts" })).toBeChecked(),
		);
	});

	it("has one primary action in the commit box: Commit, with the count of the files", async () => {
		await changes();
		const primary = within(main())
			.getAllByRole("button")
			.filter((b) => b.className.includes("bg-primary"));
		expect(primary.map((b) => b.textContent)).toEqual(["Commit 1 file"]);
	});

	it("shows two separate diffs for a file with a staged and an unstaged change", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(list().getByRole("button", { name: "src/lib/util.ts" }));
		const diffs = await screen.findAllByRole("region", { name: /^Diff of src\/lib\/util\.ts/ });
		expect(diffs).toHaveLength(2);
		expect(diffs[0]).toHaveTextContent("y");
		expect(diffs[1]).toHaveTextContent("z");
		// A file with one kind of change shows one diff.
		await user.click(list().getByRole("button", { name: "docs/guide.md" }));
		expect(await screen.findAllByRole("region", { name: /^Diff of docs\/guide\.md/ })).toHaveLength(
			1,
		);
		expect(screen.queryByRole("region", { name: /^Diff of src\/lib\/util\.ts/ })).toBeNull();
	});

	it("chooses a file, then all of them, and takes them back", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(list().getByRole("checkbox", { name: "Select src/app.ts" }));
		await waitFor(() =>
			expect(list().getByRole("checkbox", { name: "Select src/app.ts" })).toBeChecked(),
		);
		expect(mockState().code?.files["src/app.ts"]?.index).toBe("a\nB\nc\n");
		await user.click(screen.getByRole("button", { name: "Choose all" }));
		expect(await screen.findByRole("button", { name: "Commit 4 files" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Choose none" }));
		expect(await screen.findByRole("button", { name: "Commit" })).toBeDisabled();
	});

	it("discards only after a confirmation that names the paths and their count", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(list().getByRole("button", { name: "README.md" }));
		mockState().confirm = false;
		await user.click(screen.getByRole("button", { name: "Discard" }));
		await waitFor(() => expect(mockState().confirm).toBe(false));
		expect(mockState().code?.files["README.md"]).toBeDefined();
		mockState().confirm = true;
		await user.click(screen.getByRole("button", { name: "Discard" }));
		await title("3 files to commit");
		expect(mockState().code?.files["README.md"]).toBeUndefined();
	});

	it("discards a file with a chosen part and an unchosen part, the chosen part too", async () => {
		const user = userEvent.setup();
		await changes();
		mockState().confirm = true;
		await user.click(list().getByRole("button", { name: "src/lib/util.ts" }));
		await user.click(screen.getByRole("button", { name: "Discard" }));
		await title("3 files to commit");
		expect(mockState().code?.files["src/lib/util.ts"]).toMatchObject({ index: "x\n", work: "x\n" });
	});

	it("puts the changes aside, restores them and deletes the saved set", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(screen.getByRole("button", { name: "Put my changes aside" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "wip auth");
		await user.click(screen.getByRole("button", { name: "Put my changes aside" }));
		expect(await screen.findByRole("group", { name: "wip auth" })).toBeInTheDocument();
		await title("Nothing to commit");
		await user.click(screen.getByRole("button", { name: "Restore" }));
		await title("4 files to commit");
		await user.click(
			within(screen.getByRole("group", { name: "wip auth" })).getByRole("button", {
				name: "Delete",
			}),
		);
		await waitFor(() => expect(screen.queryByRole("group", { name: "wip auth" })).toBeNull());
	});

	it("adds the chosen kind to a message in plain words, and commits the chosen files with a description", async () => {
		const user = userEvent.setup();
		await changes();
		expect(box().queryByRole("textbox", { name: "Description" })).toBeNull();
		await user.type(box().getByRole("textbox", { name: "Commit message" }), "Fixed the typo");
		await user.click(box().getByRole("button", { name: "More" }));
		await user.type(box().getByRole("textbox", { name: "Description" }), "the why");
		await user.click(box().getByRole("button", { name: "Commit 1 file" }));
		await waitFor(() => expect(mockState().code?.branches.main?.log).toHaveLength(4));
		const code = mockState().code;
		const sha = code?.branches.main?.log[0] ?? "";
		expect(code?.commits[sha]?.info.summary).toBe("fix: Fixed the typo");
		expect(code?.commits[sha]?.info.description).toBe("the why");
		// The unstaged part of util.ts stays: the commit button goes off.
		expect(await screen.findByRole("button", { name: "Commit" })).toBeDisabled();
	});

	it("shows the comment of a waiting review under the file, and hides it once solved", async () => {
		const user = userEvent.setup();
		await open();
		const pull = seedPrs().pulls.find((r) => r.state === "open");
		if (!pull) throw new Error("no open pull request");
		const agent = seedAgentPr();
		agent.reviews[`${pull.number}-${pull.headSha}`] = {
			number: pull.number,
			title: pull.title,
			headSha: pull.headSha,
			summary: "",
			verdict: "comment",
			findings: [{ severity: "P1", path: "docs/guide.md", line: 1, text: "Add a test." }],
			dropped: 0,
			posted: false,
			auto: false,
		};
		mockState().agentPr = agent;
		mockState().prs = seedPrs();
		mountApp("/code/changes");
		const comment = await screen.findByRole("region", { name: "Review comment on line 1" });
		expect(within(comment).getByText(/Add a test\./)).toBeInTheDocument();
		expect(within(comment).getByRole("textbox", { name: "Reply" })).toBeInTheDocument();
		expect(within(comment).getByRole("button", { name: "Apply the fix" })).toBeInTheDocument();
		await user.click(within(comment).getByRole("button", { name: "Solved" }));
		await waitFor(() =>
			expect(screen.queryByRole("region", { name: "Review comment on line 1" })).toBeNull(),
		);
	});

	it("holds the Write it for me, Auto-commit and Auto-review controls of the commit box", async () => {
		await changes();
		expect(box().getByRole("button", { name: "Write it for me" })).toBeEnabled();
		expect(box().getByRole("switch", { name: "Auto-commit" })).toBeInTheDocument();
		expect(box().getByRole("switch", { name: /Auto-review|Agent review/ })).toBeInTheDocument();
	});

	it("keeps the two switches on one row and shows no line about the default branch before a commit", async () => {
		await changes();
		const row = box().getByRole("switch", { name: "Auto-commit" }).closest("div");
		expect(row).toContainElement(box().getByRole("switch", { name: "Auto-review" }));
		expect(screen.queryByText(/the shared branch/)).toBeNull();
	});

	it("resolves each conflict block with a choice and leaves no conflict", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		code.conflicts = [
			{
				path: "src/app.ts",
				text: true,
				segments: [
					{ kind: "text", text: "top\n" },
					{ kind: "block", ours: "o1\n", base: "", theirs: "t1\n" },
					{ kind: "block", ours: "o2\n", base: "", theirs: "t2\n" },
				],
			},
		];
		mockState().code = code;
		mountApp("/code/changes");
		await user.click(await screen.findByRole("button", { name: "Solve it myself" }));
		const resolve = await screen.findByRole("button", { name: "Resolve" });
		expect(resolve).toBeDisabled();
		const one = screen.getByRole("group", { name: "Block 1" });
		const two = screen.getByRole("group", { name: "Block 2" });
		await user.click(within(one).getByRole("button", { name: "Other version" }));
		await user.click(within(two).getByRole("button", { name: "My version" }));
		expect(within(one).getByRole("button", { name: "Other version" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await user.click(resolve);
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Solve it myself" })).toBeNull(),
		);
		expect(mockState().code?.files["src/app.ts"]?.work).toBe("top\nt1\no2\n");
	});

	it("counts the chosen blocks, opens the file in the editor and saves a typed result", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		code.conflicts = [
			{
				path: "src/app.ts",
				text: true,
				segments: [
					{ kind: "text", text: "top\n" },
					{ kind: "block", ours: "o1\n", base: "", theirs: "t1\n" },
					{ kind: "block", ours: "o2\n", base: "", theirs: "t2\n" },
				],
			},
		];
		mockState().code = code;
		mountApp("/code/changes");
		await user.click(await screen.findByRole("button", { name: "Solve it myself" }));
		expect(await screen.findByText("0 of 2 chosen")).toBeInTheDocument();
		await user.click(
			within(screen.getByRole("group", { name: "Block 1" })).getByRole("button", {
				name: "Other version",
			}),
		);
		expect(screen.getByText("1 of 2 chosen")).toBeInTheDocument();
		await user.click(
			within(await screen.findByRole("region", { name: "src/app.ts" })).getByRole("button", {
				name: /^Open in /,
			}),
		);
		await waitFor(() =>
			expect(mockState().deliveryActions.editors.map((e) => e.path)).toContain("src/app.ts"),
		);
		await user.click(screen.getByRole("button", { name: "Edit result" }));
		const result = await screen.findByRole("textbox", { name: "Result" });
		expect(result).toHaveValue("top\nt1\no2\n");
		await user.clear(result);
		await user.type(result, "<<<<<<< x");
		await user.click(screen.getByRole("button", { name: "Save result" }));
		expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
		await user.clear(result);
		await user.type(result, "typed");
		await user.click(screen.getByRole("button", { name: "Save result" }));
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Solve it myself" })).toBeNull(),
		);
		expect(mockState().code?.files["src/app.ts"]?.work).toBe("typed");
	}, 20_000);

	it("takes a whole side for a binary conflict", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		code.conflicts = [{ path: "logo.png", text: false, segments: [] }];
		mockState().code = code;
		mountApp("/code/changes");
		await user.click(await screen.findByRole("button", { name: "Solve it myself" }));
		expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Keep the other version" }));
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Solve it myself" })).toBeNull(),
		);
	});

	it("hands the conflicted files to a factory run and shows the new item", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		code.conflicts = [{ path: "x.txt", text: false, segments: [] }];
		mockState().code = code;
		mountApp("/code/changes");
		// The assistant panel has a "Send to Flow" of its own: this one is on the page.
		const main = within(await screen.findByRole("main"));
		const banner = within(await main.findByRole("region", { name: "1 file has a conflict" }));
		await user.click(await banner.findByRole("button", { name: "More" }));
		await user.click(await banner.findByRole("button", { name: "Send to Flow" }));
		expect(await screen.findByText("Ticket SHIP-200 created")).toBeInTheDocument();
	});

	it("shows the empty state with one action when no project is active", async () => {
		mountApp("/code/now");
		// The one primary action opens a menu; the folder action is one click deeper.
		const add = await screen.findByRole("button", { name: "Open a project" });
		expect(add.className).toContain("bg-primary");
		await userEvent.setup().click(add);
		expect(await screen.findByRole("menuitem", { name: "Open a local folder" })).toBeVisible();
	});
});

describe("the commit action of the sync mark", () => {
	it("is off with nothing staged and on after a stage", async () => {
		const user = userEvent.setup();
		await open();
		await unwrap(commands.codeUnstage(["src/lib/util.ts"]));
		mountApp("/code/now");
		await screen.findByRole("region", { name: "4 files to commit" });
		// Nothing is chosen: Commit leads to the page where the files are picked.
		const card = await openSync(user);
		expect(card.getByRole("link", { name: "Commit" })).toHaveAttribute("href", "/code/changes");
		await unwrap(commands.codeStage(["src/app.ts"]));
		await waitFor(() => expect(card.getByRole("button", { name: "Commit" })).toBeEnabled());
	});

	it("is off while a conflict remains", async () => {
		await open();
		const code = seedCode();
		code.conflicts = [{ path: "x.txt", text: false, segments: [] }];
		mockState().code = code;
		mountApp("/code/now");
		await screen.findByRole("region", { name: "5 files to commit" });
		expect(
			(await openSync(userEvent.setup())).getByRole("link", { name: "Commit" }),
		).toHaveAttribute("href", "/code/changes");
	});

	it("refuses a wrong type, then commits the staged files only", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(await commitOfCard(user));
		const dialog = await screen.findByRole("dialog", { name: /commit/i });
		const summary = within(dialog).getByRole("textbox", { name: "Summary" });
		await user.type(summary, "wip: tidy");
		await user.click(within(dialog).getByRole("button", { name: "Commit" }));
		expect(await within(dialog).findByRole("alert")).toHaveTextContent(
			"feat, fix, chore, docs, refactor, test",
		);
		expect(mockState().code?.branches.main?.log).toHaveLength(3);

		// 70 characters: the counter advises 50 and the commit goes through.
		await user.clear(summary);
		await user.type(summary, `fix(auth): ${"a".repeat(59)}`);
		expect(within(dialog).getByText("70/50")).toBeInTheDocument();
		await user.type(within(dialog).getByRole("textbox", { name: "Description" }), "the why");
		await user.click(within(dialog).getByRole("button", { name: "Commit" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		const code = mockState().code;
		expect(code?.branches.main?.log).toHaveLength(4);
		const sha = code?.branches.main?.log[0] ?? "";
		expect(code?.commits[sha]?.info.description).toBe("the why");
		// The unstaged part of util.ts stays unstaged, and the commit button goes off.
		await waitFor(() => expect(mockState().code?.files["src/lib/util.ts"]?.head).toBe("x\ny\n"));
		expect((await openSync(user)).getByRole("link", { name: "Commit" })).toHaveAttribute(
			"href",
			"/code/changes",
		);
	});
});
