import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { openAccount, openSync } from "./test-open";

// The status bar is gone (look pass 1). Each of its controls has a new home: the card of the sync
// mark (Commit, the changed files, the lines, the failure) and the account menu (the health).
describe("the controls of the old status bar and context bar (shell REQ-007)", () => {
	it("draws no status bar", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		await screen.findByRole("banner");
		expect(screen.queryByRole("contentinfo")).toBeNull();
	});

	it("has one sync and one commit action in the card and no Sync in a view", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/code/changes");
		const c = within((await screen.findByRole("banner")) as HTMLElement);
		expect(c.queryByRole("button", { name: "Sync" })).toBeNull();
		expect(c.queryByRole("button", { name: "Commit" })).toBeNull();
		const main = within(await screen.findByRole("main"));
		expect(main.queryByRole("button", { name: /^Sync$/ })).toBeNull();
		const card = await openSync(user);
		expect(card.getAllByRole("button", { name: "Sync" })).toHaveLength(1);
		expect(card.getAllByRole("button", { name: "Commit" })).toHaveLength(1);
	});

	it("shows the lines added and removed, and the link opens the changes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		const link = await (await openSync(user)).findByRole("link", {
			name: /lines added/,
		});
		expect(link).toHaveAccessibleName("Changes: +5 lines added, −2 removed");
		expect(link).toHaveAttribute("href", "/code/now");
		expect(link).toHaveTextContent("Changes: +5 lines added, −2 removed");
	});

	it("links the commit action to the changes when files changed", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeUnstage(["src"]));
		mountApp("/home");
		expect((await openSync(user)).getByRole("link", { name: "Commit" })).toHaveAttribute(
			"href",
			"/code/changes",
		);
	});

	it("runs one sync from the action and announces the failure when the card is closed", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		const sync = (await openSync(user)).getByRole("button", { name: "Sync" });
		await user.click(sync);
		// The mock tick passes, then the pull fails: the card shows that reason, so the sync ran.
		const top = within((await screen.findByRole("banner")) as HTMLElement);
		const alert = await top.findByRole("alert");
		expect(alert).toHaveTextContent("not saved in a commit");
		expect(screen.getByRole("dialog", { name: "Sync state" })).toHaveTextContent(
			"not saved in a commit",
		);
		expect(sync).toBeEnabled();
		// One alert in the top row, the same element with the card open or closed: it is spoken one
		// time. The mark tells the failure.
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sync state" })).toBeNull());
		expect(top.getByRole("alert")).toBe(alert);
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(top.getByRole("button", { name: "Sync state: Sync failed" })).toBeVisible();
	});

	it("shows the health shape in the account menu", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		const link = await (await openAccount(user)).findByRole("menuitem", { name: /Health \(2\)/ });
		expect(within(link).getByRole("img", { name: "Warning" })).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/setup/project?page=health");
	});

	it("opens the health of this computer when the only finding is a missing tool", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		vi.spyOn(commands, "healthRun").mockResolvedValue({
			status: "ok",
			data: [
				{
					id: "t",
					group: "tools",
					severity: "error",
					code: "tool-missing",
					detail: "pnpm",
					source: null,
					fix: { kind: "recheck" },
				},
			],
		});
		mountApp("/home");
		const link = await (await openAccount(user)).findByRole("menuitem", { name: /Health \(1\)/ });
		expect(link).toHaveAttribute("href", "/setup/computer?page=health");
		vi.restoreAllMocks();
	});
});
