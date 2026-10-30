import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fileRows, findFiles } from "@/features/code/file-drawer";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		loadAddon() {}
		open() {}
		focus() {}
		write() {}
		writeln() {}
		onData() {
			return { dispose() {} };
		}
		onResize() {
			return { dispose() {} };
		}
		dispose() {}
	},
}));
vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit() {}
	},
}));

const alpha = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const bar = async () => within((await screen.findAllByRole("banner"))[0] as HTMLElement);

describe("Active sessions", () => {
	it("counts the live sessions, lists each one and stops one with a click", async () => {
		const user = userEvent.setup();
		await alpha();
		mountApp("/home/inbox");
		await user.click(await (await bar()).findByRole("button", { name: "Active sessions (2)" }));
		const list = await screen.findByRole("list", { name: "Active sessions" });
		const rows = within(list).getAllByRole("listitem");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toHaveTextContent("alpha");
		expect(rows[0]).toHaveTextContent("claude-opus-4");
		expect(rows[0]).toHaveTextContent("$18.40");
		await user.click(within(list).getByRole("button", { name: "Stop codex beta" }));
		await waitFor(() =>
			expect(mockState().machine.sessions.some((s) => s.pid === 4188)).toBe(false),
		);
		expect((await bar()).getByRole("link", { name: /Needs you/ })).toBeInTheDocument();
	});
});

describe("File drawer", () => {
	it("builds the tree with folders first and finds a file by its letters", () => {
		const paths = ["b.md", "src/lib/util.ts", "src/app.ts", "a.md"];
		expect(fileRows(paths, new Set()).map((r) => r.path)).toEqual(["src", "a.md", "b.md"]);
		expect(fileRows(paths, new Set(["src"])).map((r) => r.path)).toEqual([
			"src",
			"src/lib",
			"src/app.ts",
			"a.md",
			"b.md",
		]);
		expect(findFiles(paths, "sutil")).toEqual(["src/lib/util.ts"]);
		expect(findFiles(paths, "md")).toEqual(["a.md", "b.md"]);
	});

	it("opens with Mod+P on the search, opens a folder and shows a file in the viewer", async () => {
		const user = userEvent.setup();
		await alpha();
		mountApp("/home/inbox");
		await (await bar()).findByRole("button", { name: "Files" });
		await user.keyboard("{Control>}p{/Control}");
		const drawer = await screen.findByRole("complementary", { name: "Files" });
		const search = within(drawer).getByRole("searchbox", { name: "Search files" });
		await waitFor(() => expect(search).toHaveFocus());
		const folder = await within(drawer).findByRole("button", { name: "src" });
		await user.click(folder);
		expect(folder).toHaveAttribute("aria-expanded", "true");
		expect(within(drawer).getByRole("button", { name: "app.ts" })).toBeInTheDocument();
		await user.type(search, "util{Enter}");
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByRole("region", { name: "File src/lib/util.ts" })).toHaveTextContent(
			"z",
		);
	});
});

describe("Terminal drawer", () => {
	it("opens on every view with Mod+`, adds and closes a tab, and hides", async () => {
		const user = userEvent.setup();
		await alpha();
		mountApp("/work/board");
		await (await bar()).findByRole("button", { name: "Terminal" });
		await user.keyboard("{Control>}`{/Control}");
		const drawer = await screen.findByRole("region", { name: "Terminals" });
		const tabs = within(drawer).getByRole("tablist", { name: "Terminals" });
		expect(within(tabs).getAllByRole("tab")).toHaveLength(1);
		await user.click(within(drawer).getByRole("button", { name: "New terminal" }));
		expect(within(tabs).getByRole("tab", { name: "Terminal 2" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await user.click(within(drawer).getByRole("button", { name: "Close Terminal 2" }));
		expect(within(tabs).getAllByRole("tab")).toHaveLength(1);
		await user.click(within(drawer).getByRole("button", { name: "Hide terminal" }));
		expect(drawer).not.toBeVisible();
	});
});
