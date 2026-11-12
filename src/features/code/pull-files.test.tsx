import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { resetPendingReview } from "@/lib/code/pending-review";
import type { PullDetail_Serialize } from "@/lib/ipc";
import { clearViewState, setViewProject } from "@/lib/shell/view-state";
import { renderApp } from "@/ui/test-utils";
import type { LineBox } from "./inline-comment";
import { PullFiles as Files } from "./pull-files";

// The page owns the open boxes: this host does too, and a button hides the files like a change of tab.
function PullFiles({ detail }: { detail: PullDetail_Serialize }) {
	const [boxes, setBoxes] = useState<LineBox[]>([]);
	const [shown, setShown] = useState(true);
	return (
		<>
			<button type="button" onClick={() => setShown((x) => !x)}>
				Switch tab
			</button>
			{shown ? <Files detail={detail} boxes={boxes} setBoxes={setBoxes} /> : null}
		</>
	);
}

const patch = (n: number) => `@@ -1,1 +1,2 @@\n a${n}\n+b${n}`;
const detail = {
	reference: "pr:x:1",
	headSha: "aaa",
	filesTruncated: false,
	threads: [],
	files: [
		{ path: "src/api/une-idée.ts", status: "added", patch: patch(1) },
		{ path: "src/ui/b.ts", status: "modified", patch: patch(2) },
		{ path: "docs/c.md", status: "removed", patch: null },
	],
} as unknown as PullDetail_Serialize;

beforeEach(() => {
	localStorage.clear();
	resetPendingReview();
	clearViewState();
	setViewProject("p");
});

describe("PullFiles", () => {
	it("starts with every file closed and counts the files", () => {
		renderApp(<PullFiles detail={detail} />);
		const list = screen.getAllByRole("button", { expanded: false });
		expect(list).toHaveLength(3);
		expect(screen.getByText("Files: 3")).toBeInTheDocument();
		expect(screen.getByText("0 / 3 viewed")).toBeInTheDocument();
		expect(screen.queryByRole("region")).toBeNull();
	});

	it("opens a file from the tree and the Expand all and Collapse all buttons work", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={detail} />);
		const tree = screen.getByRole("group", { name: "Changed files" });
		await user.click(within(tree).getByRole("button", { name: "b.ts" }));
		expect(screen.getByRole("region", { name: "Diff of src/ui/b.ts" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Expand all" }));
		expect(screen.getAllByRole("region")).toHaveLength(2);
		expect(screen.getByText("No preview")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(screen.queryByRole("region")).toBeNull();
	});

	it("filters the tree and the list by path, without case or accent", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={detail} />);
		await user.type(screen.getByRole("searchbox", { name: "Filter files" }), "IDEE");
		expect(screen.getByText("Files: 1")).toBeInTheDocument();
		const tree = screen.getByRole("group", { name: "Changed files" });
		expect(within(tree).queryByRole("button", { name: "b.ts" })).toBeNull();
		await user.clear(screen.getByRole("searchbox", { name: "Filter files" }));
		await user.type(screen.getByRole("searchbox", { name: "Filter files" }), "zzz");
		expect(screen.getByText("No file matches")).toBeInTheDocument();
	});

	it("counts viewed files, keeps them for the push, and resets on a new push", async () => {
		const user = userEvent.setup();
		const first = renderApp(<PullFiles detail={detail} />);
		await user.click(screen.getByRole("checkbox", { name: "Viewed docs/c.md" }));
		expect(screen.getByText("1 / 3 viewed")).toBeInTheDocument();
		first.unmount();
		const again = renderApp(<PullFiles detail={detail} />);
		expect(screen.getByText("1 / 3 viewed")).toBeInTheDocument();
		again.unmount();
		renderApp(<PullFiles detail={{ ...detail, headSha: "bbb" }} />);
		expect(screen.getByText("0 / 3 viewed")).toBeInTheDocument();
	});

	it("is one tab stop in the tree and moves with the arrow keys", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={detail} />);
		const tree = screen.getByRole("group", { name: "Changed files" });
		const buttons = within(tree).getAllByRole("button") as HTMLElement[];
		expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
		buttons[0]?.focus();
		await user.keyboard("{ArrowDown}");
		expect(document.activeElement).toBe(buttons[1]);
		expect(buttons[1]?.tabIndex).toBe(0);
		await user.keyboard("{End}");
		expect(document.activeElement).toBe(buttons.at(-1));
	});

	it("lists the files in the order of the tree: folders first, then names", () => {
		const { container } = renderApp(<PullFiles detail={detail} />);
		const order = [...container.querySelectorAll("[data-path]")].map((e) =>
			e.getAttribute("data-path"),
		);
		expect(order).toEqual(["docs/c.md", "src/api/une-idée.ts", "src/ui/b.ts"]);
	});

	it("scrolls to the file on every click in the tree, also on the same file", async () => {
		const user = userEvent.setup();
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		renderApp(<PullFiles detail={detail} />);
		const tree = screen.getByRole("group", { name: "Changed files" });
		await user.click(within(tree).getByRole("button", { name: "b.ts" }));
		await user.click(within(tree).getByRole("button", { name: "b.ts" }));
		expect(scroll).toHaveBeenCalledTimes(2);
	});

	it("keeps one viewed key for each pull request, not one for each push", async () => {
		const user = userEvent.setup();
		const first = renderApp(<PullFiles detail={detail} />);
		await user.click(screen.getByRole("checkbox", { name: "Viewed docs/c.md" }));
		first.unmount();
		renderApp(<PullFiles detail={{ ...detail, headSha: "bbb" }} />);
		await user.click(screen.getByRole("checkbox", { name: "Viewed docs/c.md" }));
		const keys = Object.keys(localStorage).filter((k) => k.includes("pull-viewed:"));
		expect(keys).toHaveLength(1);
	});

	it("says that the list shows the first files only when the code host cut it", () => {
		renderApp(<PullFiles detail={{ ...detail, filesTruncated: true }} />);
		expect(screen.getByText("Showing the first 3 files")).toBeInTheDocument();
	});

	it("opens 30 files with Expand all on 45 and offers the next ones", async () => {
		const user = userEvent.setup();
		const many = {
			...detail,
			files: Array.from({ length: 45 }, (_, i) => ({
				path: `src/f${String(i).padStart(2, "0")}.ts`,
				status: "modified",
				patch: patch(i),
			})),
		} as PullDetail_Serialize;
		renderApp(<PullFiles detail={many} />);
		await user.click(screen.getByRole("button", { name: "Expand all" }));
		expect(screen.getAllByRole("region")).toHaveLength(30);
		await user.click(screen.getByRole("button", { name: "Expand next 15" }));
		expect(screen.getAllByRole("region")).toHaveLength(45);
		expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
	});
});

const thread = (id: string, line: number, body: string) => ({
	id,
	resolved: false,
	path: "src/a.ts",
	line,
	commentsTotal: 1,
	comments: [{ id: `${id}c`, author: "Grace", body, created: "2026-11-10T09:00:00Z" }],
});
// New lines 1 to 3 are in the diff.
const inline = {
	...detail,
	files: [
		{ path: "src/a.ts", status: "modified", patch: "@@ -1,2 +1,3 @@\n a\n+b\n c" },
		{ path: "src/other.ts", status: "modified", patch: patch(3) },
	],
	threads: [thread("T1", 2, "rename this"), thread("T2", 99, "far away")],
} as unknown as PullDetail_Serialize;

const openFile = async (user: ReturnType<typeof userEvent.setup>) =>
	user.click(
		within(screen.getByRole("group", { name: "Changed files" })).getByRole("button", {
			name: /a\.ts/,
		}),
	);
// Only the active row draws its plus: hover the row of the line first.
const plus = async (user: ReturnType<typeof userEvent.setup>, n: number) => {
	const row = [...document.querySelectorAll("[data-kind]")].find(
		(r) => r.children[1]?.textContent === String(n),
	);
	if (row) await user.hover(row);
	return screen.getByRole("button", { name: `Add a comment on line ${n}` });
};

describe("PullFiles inline comments", () => {
	it("shows a thread under its line, an outside thread at the foot, and the counts", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={inline} />);
		// Closed by default; the row and the tree say "2 comments".
		expect(screen.queryByRole("article", { name: "src/a.ts:2" })).toBeNull();
		expect(screen.getAllByText("2 comments")).toHaveLength(2);
		expect(screen.queryByText("1 comment")).toBeNull();
		await openFile(user);
		const under = screen.getByRole("article", { name: "src/a.ts:2" });
		expect(within(under).getByText("rename this")).toBeInTheDocument();
		const foot = screen.getByRole("region", { name: "Comments on lines outside the diff" });
		expect(within(foot).getByText("far away")).toBeInTheDocument();
		expect(within(foot).getByRole("article", { name: "src/a.ts:99" })).toBeInTheDocument();
	});

	it("adds a pending comment under the line, counts it at once and gives the focus back to the plus button", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={inline} />);
		await openFile(user);
		await user.click(await plus(user, 3));
		await user.type(screen.getByRole("textbox", { name: "Comment on line 3" }), "Use **const**");
		await user.click(screen.getByRole("button", { name: "Add review comment" }));
		expect(screen.queryByRole("textbox", { name: "Comment on line 3" })).toBeNull();
		const card = screen.getByRole("article", { name: "Pending: src/a.ts:3" });
		expect(within(card).getByText("const").tagName).toBe("STRONG");
		expect(screen.getAllByText("3 comments")).toHaveLength(2);
		expect(await plus(user, 3)).toHaveFocus();
		// Edit, then delete with a question: the count follows.
		await user.click(within(card).getByRole("button", { name: "Edit the comment on line 3" }));
		await user.clear(screen.getByRole("textbox", { name: "Edit the comment on line 3" }));
		await user.type(screen.getByRole("textbox", { name: "Edit the comment on line 3" }), "Changed");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(screen.getByText("Changed")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Delete the comment on line 3" }));
		await user.click(screen.getByRole("button", { name: "Delete this comment?" }));
		expect(screen.queryByText("Changed")).toBeNull();
		expect(screen.getAllByText("2 comments")).toHaveLength(2);
	});

	it("keeps a pending comment of an older push and a line that the diff lost, with its text", async () => {
		const user = userEvent.setup();
		const first = renderApp(<PullFiles detail={inline} />);
		await openFile(user);
		await user.click(await plus(user, 3));
		await user.type(screen.getByRole("textbox", { name: "Comment on line 3" }), "Old push");
		await user.click(screen.getByRole("button", { name: "Add review comment" }));
		first.unmount();
		const next = {
			...inline,
			headSha: "bbb",
			files: [
				{ path: "src/a.ts", status: "modified", patch: "@@ -1,1 +1,1 @@\n a" },
				...inline.files.slice(1),
			],
		} as unknown as PullDetail_Serialize;
		renderApp(<PullFiles detail={next} />);
		await openFile(user);
		expect(screen.getByText("Old push")).toBeInTheDocument();
		expect(screen.getByText("On an older version")).toBeInTheDocument();
		// Line 3 is gone from the new diff: the text sits in the foot group.
		const foot = screen.getByRole("region", { name: "Comments on lines outside the diff" });
		expect(within(foot).getByText("Old push")).toBeInTheDocument();
	});

	it("keeps the text of an open box when its file collapses or the tab changes", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={inline} />);
		await openFile(user);
		await user.click(await plus(user, 3));
		await user.type(screen.getByRole("textbox", { name: "Comment on line 3" }), "Half typed");
		await user.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(screen.queryByRole("textbox", { name: "Comment on line 3" })).toBeNull();
		await openFile(user);
		expect(screen.getByRole("textbox", { name: "Comment on line 3" })).toHaveValue("Half typed");
		await user.click(screen.getByRole("button", { name: "Switch tab" }));
		await user.click(screen.getByRole("button", { name: "Switch tab" }));
		await openFile(user);
		expect(screen.getByRole("textbox", { name: "Comment on line 3" })).toHaveValue("Half typed");
	});

	it("opens a box on a context line, closes an empty one with Escape and returns the focus", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={inline} />);
		await openFile(user);
		await user.click(await plus(user, 1));
		expect(screen.getByRole("textbox", { name: "Comment on line 1" })).toHaveFocus();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("textbox", { name: "Comment on line 1" })).toBeNull();
		expect(await plus(user, 1)).toHaveFocus();
	});

	it("sends the focus to the plus button of the line after a delete", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={inline} />);
		await openFile(user);
		await user.click(await plus(user, 3));
		await user.type(screen.getByRole("textbox", { name: "Comment on line 3" }), "Gone soon");
		await user.click(screen.getByRole("button", { name: "Add review comment" }));
		await user.click(screen.getByRole("button", { name: "Delete the comment on line 3" }));
		await user.click(screen.getByRole("button", { name: "Delete this comment?" }));
		expect(await plus(user, 3)).toHaveFocus();
	});

	it("lists a pending comment on a file that left the pull request, in full, with Edit and Delete", async () => {
		const user = userEvent.setup();
		localStorage.setItem(
			"shipyard:pending-review:p|pr:x:1",
			JSON.stringify([
				{
					id: "g1",
					path: "src/removed.ts",
					line: 7,
					body: "First\n\n**Second** part",
					createdAt: "",
					headSha: "aaa",
				},
			]),
		);
		renderApp(<PullFiles detail={inline} />);
		const group = screen.getByRole("region", {
			name: "Comments on files no longer in this pull request",
		});
		expect(within(group).getByText("src/removed.ts:7")).toBeInTheDocument();
		expect(within(group).getByText("Second").tagName).toBe("STRONG");
		await user.click(within(group).getByRole("button", { name: "Delete the comment on line 7" }));
		await user.click(screen.getByRole("button", { name: "Delete this comment?" }));
		expect(screen.queryByRole("region", { name: /no longer in this pull request/ })).toBeNull();
		expect(localStorage.getItem("shipyard:pending-review:p|pr:x:1")).toBeNull();
	});

	it("says so on the card when the comment is not saved on this computer, and keeps the text", async () => {
		const user = userEvent.setup();
		renderApp(<PullFiles detail={inline} />);
		await openFile(user);
		const full = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("The quota is exceeded");
		});
		await user.click(await plus(user, 3));
		await user.type(screen.getByRole("textbox", { name: "Comment on line 3" }), "Still here");
		await user.click(screen.getByRole("button", { name: "Add review comment" }));
		const card = screen.getByRole("article", { name: "Pending: src/a.ts:3" });
		expect(within(card).getByText("Still here")).toBeInTheDocument();
		expect(within(card).getByRole("alert")).toHaveTextContent(
			"This comment is not saved on this computer: The quota is exceeded",
		);
		full.mockRestore();
		await user.click(within(card).getByRole("button", { name: "Edit the comment on line 3" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(within(card).queryByRole("alert")).toBeNull();
	});
});
