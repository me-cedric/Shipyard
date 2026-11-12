import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PullDetail_Serialize } from "@/lib/ipc";
import { clearViewState, setViewProject } from "@/lib/shell/view-state";
import { renderApp } from "@/ui/test-utils";
import { PullFiles } from "./pull-files";

const patch = (n: number) => `@@ -1,1 +1,2 @@\n a${n}\n+b${n}`;
const detail = {
	reference: "pr:x:1",
	headSha: "aaa",
	filesTruncated: false,
	files: [
		{ path: "src/api/une-idée.ts", status: "added", patch: patch(1) },
		{ path: "src/ui/b.ts", status: "modified", patch: patch(2) },
		{ path: "docs/c.md", status: "removed", patch: null },
	],
} as PullDetail_Serialize;

beforeEach(() => {
	clearViewState();
	setViewProject("p");
});

describe("PullFiles", () => {
	it("starts with every file closed and shows the totals", () => {
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
