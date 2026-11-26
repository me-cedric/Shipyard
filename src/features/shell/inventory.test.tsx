import { RouterContextProvider } from "@tanstack/react-router";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { createAppRouter, createMemoryHistory } from "@/app/router";
import { commands, unwrap } from "@/lib/ipc";
import { NotificationsProvider } from "@/lib/notifications";
import { ShellProvider, useShell } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { routers } from "@/test/routers";
import { useActions } from "./actions";
import { openAccount, openSync } from "./test-open";

// The inventory of `update-ux-declutter` REQ-016: each palette action and each route that
// exists before the change. A later wave moves a control, never removes one of these.
const SPACE_LIST = [
	"home",
	"design",
	"specs",
	"work",
	"factory",
	"code",
	"knowledge",
	"settings",
] as const;

const ACTION_IDS = [
	...SPACE_LIST.map((s) => `go-${s}`),
	"toggle-assistant",
	"palette",
	"toggle-files",
	"toggle-terminal",
	"shortcuts-help",
	"toggle-theme",
	"toggle-sidebar",
	"toggle-inspector",
	"theme-light",
	"theme-dark",
	"theme-system",
	"lang-en",
	"lang-fr",
	"lang-de",
	"lang-es",
	"project-open",
	"project-switch",
	"project-close",
	"sync",
	"fetch",
	"push",
	"commit",
	"update-check",
	"whats-new",
	"manual",
	"tour",
	"terminal-open-app",
	"nav-back",
	"nav-forward",
	"text-larger",
	"text-smaller",
	"text-reset",
	"explain",
];

const TABS = {
	home: ["today", "projects"],
	design: ["diagrams", "architecture", "decisions", "api", "data", "flows", "screens"],
	specs: ["changes", "capabilities", "questions", "test-plans", "constitution"],
	work: ["backlog", "board", "plan", "estimates", "team", "time"],
	factory: ["runs", "workflows", "agents-map", "sessions", "usage"],
	code: ["changes", "history", "branches", "pull-requests", "quality", "impacts", "terminal"],
	knowledge: ["graph", "handbook", "manual", "documents", "slides", "learn", "dashboards"],
	settings: ["project", "connections", "agents-rules", "extensions", "me", "health"],
} as const;

const PATHS = [
	...SPACE_LIST.map((s) => `/${s}`),
	...SPACE_LIST.flatMap((s) => TABS[s].map((tab) => `/${s}/${tab}`)),
	"/settings/team",
	"/home/inbox",
	"/home/my-work",
	"/home/activity",
	// The addresses that wave 6 of `update-app-redesign` moved.
	"/today/projects",
	"/setup/connections",
	"/setup/agents-rules",
	"/setup/extensions",
	"/setup/health",
	"/setup/project",
	"/setup/me",
	"/factory/runs/$runId",
	"/code/pull-requests/$pullId",
];

/** A real address for each path: a parameter gets a value. */
const address = (path: string) => path.replace("$runId", "run-1").replace("$pullId", "pr-1");

describe("inventory (app-redesign REQ-003 and REQ-029, ux-declutter REQ-016)", () => {
	it("keeps every route", () => {
		const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
		routers().push(router);
		const known = Object.keys(router.routesByPath);
		for (const path of PATHS) expect(known, path).toContain(path);
	});

	// app-redesign REQ-003: a route of the list opens a page, not Not found.
	it.each(PATHS)("opens a page at %s", async (path) => {
		const router = createAppRouter(createMemoryHistory({ initialEntries: [address(path)] }));
		routers().push(router);
		await router.load();
		await waitFor(() => expect(router.state.status).toBe("idle"));
		const { matches } = router.state;
		// A path that no route matches leaves the root alone, with Not found.
		expect(matches.at(-1)?.routeId).not.toBe("__root__");
		expect(matches.some((m) => m.status === "notFound")).toBe(false);
		expect(Object.keys(router.routesByPath)).toContain(
			matches.at(-1)?.fullPath.replace(/(.)\/$/, "$1"),
		);
	});

	it("keeps every palette action, each with a run", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = createAppRouter(createMemoryHistory({ initialEntries: ["/home/today"] }));
		routers().push(router);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<Providers>
				<RouterContextProvider router={router}>
					<NotificationsProvider>
						<ShellProvider>{children}</ShellProvider>
					</NotificationsProvider>
				</RouterContextProvider>
			</Providers>
		);
		const { result } = renderHook(() => ({ actions: useActions(), shell: useShell() }), {
			wrapper,
		});
		await waitFor(() => expect(result.current).toBeTruthy());
		// Explain shows while a ref is selected.
		act(() => result.current.shell.openRef("wi:KEY-1"));
		await waitFor(() => expect(result.current.actions.list.map((a) => a.id)).toContain("explain"));
		const { list } = result.current.actions;
		for (const id of ACTION_IDS)
			expect(typeof list.find((a) => a.id === id)?.run, id).toBe("function");
	});

	// Look pass 1: the top bar and the status bar are gone. Each of their controls has a new home,
	// found here by its role and its name. `home` says where: the top row, the rail, the card of
	// the sync mark, the account menu, the menu of the project switch, the Ask bar or Code / Now.
	it("keeps every control of the old top bar and of the old status bar in its new home", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/code/now");
		const top = within(await screen.findByRole("banner"));
		const rail = within(screen.getByRole("navigation", { name: "Sidebar" }));
		const view = within(screen.getByRole("main"));
		expect(screen.queryByRole("contentinfo")).toBeNull();
		// The page area holds the top row and the main view.
		const area = document.querySelector("[data-page-area]");
		expect(area).toContainElement(screen.getByRole("banner"));
		expect(area).toContainElement(screen.getByRole("main"));

		// Old top bar: stays in the top row.
		for (const name of ["Hide sidebar", "Back", "Forward"])
			expect(top.getByRole("button", { name })).toBeVisible();
		expect(top.getByRole("combobox", { name: "Ask or tell Shipyard" })).toBeVisible();
		await top.findByRole("button", { name: /^Sync state: / });

		// Old top bar: the working branch and the terminal, on Code / Now.
		expect(await view.findByRole("combobox", { name: "Working branch" })).toBeVisible();
		expect(view.getByRole("button", { name: "Terminal" })).toBeVisible();
		expect(view.getByRole("button", { name: "Files" })).toBeVisible();

		// Old top bar: Sync, Fetch, Push, the branch and the sync state. Old status bar: Commit,
		// the changed files and the lines. All in the card of the sync mark.
		const card = await openSync(user);
		for (const name of ["Sync", "Fetch only", "Push", "Commit"])
			expect(card.getByRole("button", { name })).toBeVisible();
		expect(card.getByRole("combobox", { name: "Working branch" })).toBeVisible();
		for (const name of [/^Changed files \(\d+\)$/, /lines added/])
			expect(card.getByRole("link", { name })).toHaveAttribute("href", "/code/now");
		await user.keyboard("{Escape}");

		// Old top bar: the project switch, at the top of the rail, with each entry of its menu.
		await user.click(rail.getByRole("button", { name: "Project alpha" }));
		const projects = within(await screen.findByRole("menu"));
		expect(projects.getByRole("menuitemradio", { name: /alpha/, checked: true })).toBeVisible();
		for (const name of [
			"Projects",
			"Open a local folder",
			"Get a project from the code host",
			"Close project",
			"Remove from list",
		])
			expect(projects.getByRole("menuitem", { name })).toBeVisible();
		await user.keyboard("{Escape}");

		// Old top bar: the account menu, at the foot of the rail, with each old entry. Old status
		// bar: the version and the health.
		const account = await openAccount(user);
		for (const name of [
			/Change$/,
			/^Language/,
			/^Manual/,
			"Shortcuts",
			"What is new",
			"Show the tour again",
			"Check for an update",
			/^About Shipyard/,
			/^Health \(\d+\)/,
		])
			expect(account.getByRole("menuitem", { name })).toBeVisible();
		for (const name of ["Theme: Light", "Theme: Dark", "Theme: System"])
			expect(account.getByRole("menuitemradio", { name })).toBeVisible();
		expect(account.getByText(/^Version \d/)).toBeInTheDocument();
		expect(account.getByRole("menuitem", { name: /^Health/ })).toHaveAttribute(
			"href",
			expect.stringContaining("page=health"),
		);
		await user.keyboard("{Escape}");

		// Old top bar: the files and the terminal, as actions of the Ask bar.
		await user.click(top.getByRole("combobox", { name: "Ask or tell Shipyard" }));
		for (const name of [/^Files/, /^Terminal/])
			expect(await screen.findByRole("option", { name })).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
