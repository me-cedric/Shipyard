import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const NEWER = "https://example.com/newer/releases/latest";

describe("Today / News (spec:app-redesign#REQ-008)", () => {
	it("holds the one list of notifications: count in the title, groups, remove, mark all as read, clear", async () => {
		const user = userEvent.setup();
		mockState().prefs.releaseUrl = NEWER;
		mountApp("/today/news");
		expect(await screen.findByRole("heading", { level: 1, name: "1 news" })).toBeInTheDocument();
		const today = within(await screen.findByRole("region", { name: /^Today/ }));
		expect(today.getByText("Update available: 0.2.0")).toBeInTheDocument();
		// The entries arrived while the view was open: they stay unread until the person says so.
		const markAll = screen.getByRole("button", { name: "Mark all as read" });
		await waitFor(() => expect(markAll).toBeEnabled());
		await user.click(markAll);
		await waitFor(() => expect(markAll).toBeDisabled());
		// Clear is behind More.
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Clear" }));
		expect(await screen.findByText("No notification")).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 1, name: "News" })).toBeInTheDocument();
	});

	it("keeps Mark all as read on while the opened page still shows unread news", async () => {
		const user = userEvent.setup();
		mockState().prefs.releaseUrl = NEWER;
		mountApp("/today");
		// The entry is already in the list when the person opens News.
		await screen.findByText("Update available: 0.2.0");
		await user.click(await screen.findByRole("link", { name: /^News/ }));
		const markAll = await screen.findByRole("button", { name: "Mark all as read" });
		expect(markAll).toBeEnabled();
		await user.click(markAll);
		await waitFor(() => expect(markAll).toBeDisabled());
	});

	it("removes one entry with its Dismiss control", async () => {
		const user = userEvent.setup();
		mockState().prefs.releaseUrl = NEWER;
		mountApp("/today/news");
		// The toast of the same notice has its own Dismiss: pick the one of the list.
		const list = within(await screen.findByRole("region", { name: /^Today/ }));
		await user.click(await list.findByRole("button", { name: "Dismiss" }));
		expect(await screen.findByText("No notification")).toBeInTheDocument();
	});

	it("turns a source of notifications off and on in the card Tell me when", async () => {
		const user = userEvent.setup();
		mountApp("/today/news");
		const card = within(await screen.findByRole("region", { name: "Tell me when" }));
		expect(card.getAllByRole("switch")).toHaveLength(5);
		const sync = card.getByRole("switch", { name: "The sync has a problem" });
		await waitFor(() => expect(sync).toBeChecked());
		await user.click(sync);
		await waitFor(() => expect(mockState().prefs.notifyOff).toEqual(["sync-failure"]));
		expect(sync).not.toBeChecked();
		await user.click(sync);
		await waitFor(() => expect(mockState().prefs.notifyOff).toEqual([]));
	});

	it("opens the notification settings of Setup with one link", async () => {
		const user = userEvent.setup();
		const router = mountApp("/today/news");
		await user.click(await screen.findByRole("link", { name: "More in Setup" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/me"));
	});
});

describe("Today / Activity (spec:app-redesign#REQ-008)", () => {
	it("shows the live runs with Stop and the sessions as a page", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/today/activity");
		expect(await screen.findByRole("heading", { level: 1, name: "Activity" })).toBeInTheDocument();
		expect(await screen.findByRole("region", { name: "Active runs" })).toBeInTheDocument();
		expect(await screen.findByRole("region", { name: "Active sessions" })).toBeInTheDocument();
		expect(await screen.findAllByRole("button", { name: /^Stop ACME-/ })).not.toHaveLength(0);
	});

	it("stops a live run after a confirmation, and lists and stops a session", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const cancel = vi.spyOn(commands, "runCancel");
		mountApp("/today/activity");
		const runs = within(await screen.findByRole("region", { name: "Active runs" }));
		await user.click(
			(await runs.findAllByRole("button", { name: /^Stop ACME/ }))[0] as HTMLElement,
		);
		expect(cancel).not.toHaveBeenCalled();
		await user.click(await runs.findByRole("button", { name: /^Stop .*\?$/ }));
		await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
		const list = await screen.findByRole("list", { name: "Active sessions" });
		const rows = within(list).getAllByRole("listitem");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toHaveTextContent("alpha");
		expect(rows[0]).toHaveTextContent("claude-opus-4");
		expect(rows[0]).toHaveTextContent("$18.40");
		expect(screen.getByRole("link", { name: "All sessions" })).toHaveAttribute(
			"href",
			"/crew/sessions",
		);
		await user.click(within(list).getByRole("button", { name: "Stop Codex beta" }));
		await waitFor(() =>
			expect(mockState().machine.sessions.some((s) => s.pid === 4188)).toBe(false),
		);
	});

	it("turns the stop of a run off for a person without the right to start runs", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp("/today/activity");
		const runs = within(await screen.findByRole("region", { name: "Active runs" }));
		for (const s of await runs.findAllByRole("button", { name: /^Stop ACME/ }))
			expect(s).toBeDisabled();
	});

	it("shows the live dot on the Today place of the main menu while a session works", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/today/activity");
		const menu = within(await screen.findByRole("navigation", { name: "Sidebar" }));
		expect(await menu.findByText("Activity")).toHaveClass("sr-only");
	});
});
