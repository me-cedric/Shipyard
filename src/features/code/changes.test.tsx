import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const main = () => screen.getByRole("main");
const group = (name: string) => screen.findByRole("heading", { name });
const status = () => screen.getByRole("contentinfo");
const unstaged = () => within(screen.getByRole("region", { name: "Unstaged" }));

async function changes() {
	await open();
	mountApp("/code/changes");
	await group("Staged (1)");
}

describe("Code / Changes", () => {
	it("offers the actions of a file in its context menu and stages it", async () => {
		const user = userEvent.setup();
		await changes();
		fireEvent.contextMenu(unstaged().getByRole("button", { name: "app.ts" }));
		const menu = await screen.findByRole("menu");
		expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((i) => i.textContent),
		).toEqual(["Stage", "Discard", "Copy path"]);
		await user.click(within(menu).getByRole("menuitem", { name: "Stage" }));
		await group("Staged (2)");
		expect(await group("Unstaged (3)")).toBeInTheDocument();
	});

	it("shows the groups with counts and the changed files as a folder tree", async () => {
		await changes();
		expect(await group("Unstaged (4)")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Stashes (0)" })).toBeInTheDocument();
		for (const name of ["docs", "src", "lib", "app.ts", "util.ts", "guide.md", "README.md"])
			expect(unstaged().getByRole("button", { name })).toBeInTheDocument();
		// Each file mark has a letter and a name for assistive technology.
		expect(within(main()).getAllByRole("img", { name: "Modified" }).length).toBeGreaterThan(0);
		expect(within(main()).getByRole("img", { name: "Untracked" })).toHaveTextContent("U");
	});

	it("has one primary action: Stage", async () => {
		await changes();
		const primary = within(main())
			.getAllByRole("button")
			.filter((b) => b.className.includes("bg-accent"));
		expect(primary.map((b) => b.textContent)).toEqual(["Stage (4)"]);
	});

	it("shows two separate diffs for a file with a staged and an unstaged change", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(unstaged().getByRole("button", { name: "util.ts" }));
		const diffs = await screen.findAllByRole("region", { name: "Diff of src/lib/util.ts" });
		expect(diffs).toHaveLength(2);
		expect(diffs[0]).toHaveTextContent("y");
		expect(diffs[1]).toHaveTextContent("z");
		// A file with one kind of change shows one diff.
		await user.click(unstaged().getByRole("button", { name: "guide.md" }));
		expect(await screen.findAllByRole("region", { name: "Diff of docs/guide.md" })).toHaveLength(1);
		expect(screen.queryByRole("region", { name: "Diff of src/lib/util.ts" })).toBeNull();
	});

	it("stages the checked files, then all of a group", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(unstaged().getByRole("checkbox", { name: "Select src/app.ts" }));
		await user.click(screen.getByRole("button", { name: "Stage (1)" }));
		await group("Staged (2)");
		expect(await group("Unstaged (3)")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Stage (3)" }));
		await group("Staged (4)");
		expect(await group("Unstaged (0)")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Unstage (4)" }));
		await group("Staged (0)");
	});

	it("stages a whole folder from its checkbox", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(unstaged().getByRole("checkbox", { name: "Select src" }));
		await user.click(screen.getByRole("button", { name: "Stage (2)" }));
		await group("Staged (2)");
		expect(mockState().code?.files["src/app.ts"]?.index).toBe("a\nB\nc\n");
	});

	it("discards only after a confirmation that names the paths and their count", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(screen.getByRole("checkbox", { name: "Select README.md" }));
		mockState().confirm = false;
		await user.click(screen.getByRole("button", { name: "Discard (1)" }));
		await waitFor(() => expect(mockState().confirm).toBe(false));
		expect(mockState().code?.files["README.md"]).toBeDefined();
		mockState().confirm = true;
		await user.click(screen.getByRole("button", { name: "Discard (1)" }));
		await group("Unstaged (3)");
		expect(mockState().code?.files["README.md"]).toBeUndefined();
	});

	it("stashes the working copy and applies and drops the stash", async () => {
		const user = userEvent.setup();
		await changes();
		await user.type(screen.getByRole("textbox", { name: "Name" }), "wip auth");
		await user.click(screen.getByRole("button", { name: "Stash" }));
		await group("Stashes (1)");
		expect(await group("Unstaged (0)")).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "wip auth" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Apply" }));
		await group("Unstaged (4)");
		await user.click(screen.getByRole("button", { name: "Drop" }));
		await group("Stashes (0)");
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
		await group("Conflicts (1)");
		await user.click(within(main()).getByRole("button", { name: "app.ts" }));
		const resolve = await screen.findByRole("button", { name: "Resolve" });
		expect(resolve).toBeDisabled();
		const one = screen.getByRole("group", { name: "Block 1" });
		const two = screen.getByRole("group", { name: "Block 2" });
		await user.click(within(one).getByRole("button", { name: "Theirs" }));
		await user.click(within(two).getByRole("button", { name: "Ours" }));
		expect(within(one).getByRole("button", { name: "Theirs" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await user.click(resolve);
		await waitFor(() => expect(screen.queryByRole("heading", { name: /^Conflicts/ })).toBeNull());
		expect(mockState().code?.files["src/app.ts"]?.work).toBe("top\nt1\no2\n");
	});

	it("takes a whole side for a binary conflict", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		code.conflicts = [{ path: "logo.png", text: false, segments: [] }];
		mockState().code = code;
		mountApp("/code/changes");
		await group("Conflicts (1)");
		await user.click(within(main()).getByRole("button", { name: "logo.png" }));
		expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Take theirs" }));
		await waitFor(() => expect(screen.queryByRole("heading", { name: /^Conflicts/ })).toBeNull());
	});

	it("hands the conflicted files to a factory run and shows the new item", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		code.conflicts = [{ path: "x.txt", text: false, segments: [] }];
		mockState().code = code;
		mountApp("/code/changes");
		await user.click(await screen.findByRole("button", { name: "Hand to factory" }));
		expect(await screen.findByText("Work item SHIP-200 created")).toBeInTheDocument();
	});

	it("shows the empty state with one action when no project is active", async () => {
		mountApp("/code/changes");
		const add = await screen.findByRole("button", { name: "Open a local folder" });
		expect(add.className).toContain("bg-accent");
	});
});

describe("the commit action of the status bar", () => {
	it("is off with nothing staged and on after a stage", async () => {
		const user = userEvent.setup();
		await open();
		await unwrap(commands.codeUnstage(["src/lib/util.ts"]));
		mountApp("/code/changes");
		await group("Staged (0)");
		const commit = within(status()).getByRole("button", { name: "Commit" });
		expect(commit).toBeDisabled();
		await user.click(unstaged().getByRole("checkbox", { name: "Select src/app.ts" }));
		await user.click(screen.getByRole("button", { name: "Stage (1)" }));
		await waitFor(() => expect(commit).toBeEnabled());
	});

	it("is off while a conflict remains", async () => {
		await open();
		const code = seedCode();
		code.conflicts = [{ path: "x.txt", text: false, segments: [] }];
		mockState().code = code;
		mountApp("/code/changes");
		await group("Conflicts (1)");
		expect(within(status()).getByRole("button", { name: "Commit" })).toBeDisabled();
	});

	it("refuses a wrong type, then commits the staged files only", async () => {
		const user = userEvent.setup();
		await changes();
		await user.click(within(status()).getByRole("button", { name: "Commit" }));
		const dialog = await screen.findByRole("dialog");
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
		await group("Staged (0)");
		expect(await group("Unstaged (4)")).toBeInTheDocument();
		expect(within(status()).getByRole("button", { name: "Commit" })).toBeDisabled();
	});
});
