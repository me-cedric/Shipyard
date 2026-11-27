import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { PLACE_IDS, sectionPath, visibleSections } from "./places";
import { openSync } from "./test-open";

const sidebar = () => screen.findByRole("navigation", { name: "Sidebar" });
const NAMES = ["Today", "Flow", "Plan", "Crew", "Library", "Code", "Setup"];
const alpha = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const follows = (a: Element, b: Element) =>
	Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// spec:app-redesign#REQ-001 (acceptance: the menu and the section switches)
describe("acceptance: the menu and one section switch", () => {
	it("shows no page with two section switches, in any section of any place", async () => {
		await alpha();
		for (const place of PLACE_IDS) {
			for (const [, slug] of visibleSections(place)) {
				const router = mountApp(sectionPath(place, slug));
				await screen.findByRole("main");
				await waitFor(() => expect(router.state.status).toBe("idle"));
				expect(
					screen.queryAllByRole("navigation", { name: "Tabs" }).length,
					`${place}/${slug}`,
				).toBeLessThanOrEqual(1);
				cleanup();
			}
		}
	}, 120_000);
});

// spec:shell#REQ-001, spec:shell#REQ-021
describe("acceptance: the rail and the top row", () => {
	it("lists the six places and Setup, the project switch at the top and the account row at the foot", async () => {
		await alpha();
		const router = mountApp("/today/today");
		const nav = await sidebar();
		const links = within(nav).getAllByRole("link");
		expect(
			links.map((l) =>
				NAMES.find(
					(n) => l.getAttribute("aria-label")?.startsWith(n) ?? l.textContent?.startsWith(n),
				),
			),
		).toEqual(NAMES);
		const project = within(nav).getByRole("button", { name: /^Project/ });
		const account = within(nav).getByRole("button", { name: /^Account/ });
		expect(follows(project, links[0] as Element)).toBe(true);
		expect(follows(links.at(-1) as Element, account)).toBe(true);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("has no top bar and no status bar: the top row is the first thing of the page area", async () => {
		await alpha();
		const router = mountApp("/today/today");
		const row = (await screen.findAllByRole("banner"))[0] as HTMLElement;
		expect(screen.queryByRole("contentinfo")).toBeNull();
		// One banner only, and it sits above the page in the same column.
		expect(screen.getAllByRole("banner")).toHaveLength(1);
		const main = screen.getByRole("main");
		expect(follows(row, main)).toBe(true);
		expect(row.parentElement).toHaveAttribute("data-page-area");
		expect(row.parentElement?.contains(main)).toBe(true);
		expect(row.parentElement?.firstElementChild).toBe(row);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("opens a card with what waits and the sync actions from the sync mark", async () => {
		const user = userEvent.setup();
		await alpha();
		const router = mountApp("/today/today");
		const card = await openSync(user);
		expect(card.getByRole("link", { name: /^Changed files \(\d+\)$/ })).toBeVisible();
		for (const name of ["Sync", "Fetch only", "Push", "Commit"])
			expect(card.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

// spec:shell#REQ-005, spec:app-redesign#REQ-004
describe("acceptance: the Ask bar", () => {
	it("moves the focus to the Ask bar with the palette shortcut and runs an action from it", async () => {
		const user = userEvent.setup();
		await alpha();
		const router = mountApp("/code/changes");
		await sidebar();
		await user.keyboard("{Control>}k{/Control}");
		const bar = await screen.findByRole("combobox", { name: "Ask or tell Shipyard" });
		await waitFor(() => expect(bar).toHaveFocus());
		await user.type(bar, "Toggle inspector{ArrowDown}{Enter}");
		const inspector = screen.getByLabelText("Inspector", { selector: "aside" });
		await waitFor(() => expect(inspector).toHaveAttribute("data-open", "true"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("answers 'what blocks MVP 1' with the blocked features and one action for each", async () => {
		const user = userEvent.setup();
		await alpha();
		const feature = (title: string, run: string) => ({
			title,
			stage: "build" as const,
			mark: "blocked" as const,
			ticket: null,
			change: null,
			run,
			pr: null,
			who: null,
			runState: null,
			approvals: 0,
			questions: 0,
			checks: null,
			stop: null,
		});
		const spy = vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature("Fix menu", "run:1"), feature("Cache list", "run:2")],
		});
		const router = mountApp("/today/today");
		await sidebar();
		await user.keyboard("{Control>}k{/Control}");
		const bar = await screen.findByRole("combobox", { name: "Ask or tell Shipyard" });
		await user.type(bar, "what blocks MVP 1{Enter}");
		expect(await screen.findByRole("button", { name: "Unblock Fix menu" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Unblock Cache list" })).toBeVisible();
		spy.mockRestore();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

// spec:shell#REQ-009
describe("acceptance: the menu order for each role", () => {
	it.each(["po", "qa", "architect", "developer"] as const)(
		"keeps the order of the places for the role %s, and opens its first page",
		async (role) => {
			await alpha();
			mockState().person = {
				member: "ana",
				found: "email",
				role,
				admin: false,
				readOnly: false,
				rights: ["work.edit"],
			};
			const router = mountApp("/");
			const nav = await sidebar();
			const shown = within(nav)
				.getAllByRole("link")
				.map((l) =>
					NAMES.find((n) => (l.getAttribute("aria-label") ?? l.textContent ?? "").startsWith(n)),
				);
			expect(shown).toEqual(NAMES.filter((n) => shown.includes(n)));
			expect(shown.length).toBeGreaterThanOrEqual(6);
			// The role opens on a first page of a place, never on the bare root.
			await waitFor(() => expect(router.state.location.pathname).not.toBe("/"));
			await waitFor(() => expect(router.state.status).toBe("idle"));
		},
	);
});

// spec:shell#REQ-019
describe("acceptance: pages without the shell", () => {
	it("shows the first run and 'No project is open' with no rail and no top row", async () => {
		const first = mountApp("/");
		await screen.findByRole("button", { name: "Continue" });
		expect(screen.queryByRole("navigation")).toBeNull();
		expect(screen.queryByRole("banner")).toBeNull();
		await waitFor(() => expect(first.state.status).toBe("idle"));
		cleanup();
		const bare = mountApp("/code/changes");
		expect(
			await screen.findByRole("heading", { level: 1, name: "No project is open" }),
		).toBeVisible();
		expect(screen.queryByRole("navigation")).toBeNull();
		expect(screen.queryByRole("banner")).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Ask or tell Shipyard" })).toBeNull();
		await waitFor(() => expect(bare.state.status).toBe("idle"));
	});
});

// spec:sync#REQ-013, spec:code#REQ-014
describe("acceptance: the sync action", () => {
	it("starts one tick for one click on Sync in the card, and the Ask bar offers it too; no view does", async () => {
		const user = userEvent.setup();
		await alpha();
		const tick = vi.spyOn(commands, "syncNow");
		const router = mountApp("/code/changes");
		// No other place offers Sync: not the rail, not the top row, not the page.
		expect(within(await sidebar()).queryByRole("button", { name: /^Sync$/ })).toBeNull();
		expect(within(screen.getByRole("main")).queryByRole("button", { name: /^Sync$/ })).toBeNull();
		expect(
			within(screen.getAllByRole("banner")[0] as HTMLElement).queryByRole("button", {
				name: /^Sync$/,
			}),
		).toBeNull();
		const card = await openSync(user);
		await user.click(card.getByRole("button", { name: "Sync" }));
		await waitFor(() => expect(tick).toHaveBeenCalledTimes(1));
		// Wait for the run to end: the failure shows in the card.
		await screen.findByRole("alert");
		await user.keyboard("{Escape}");
		await user.keyboard("{Control>}k{/Control}");
		const bar = await screen.findByRole("combobox", { name: "Ask or tell Shipyard" });
		await user.type(bar, "Sync now{ArrowDown}{Enter}");
		await waitFor(() => expect(tick).toHaveBeenCalledTimes(2));
		tick.mockRestore();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("names the reason in the card when a sync cannot update the working branch", async () => {
		const user = userEvent.setup();
		await alpha();
		mountApp("/home");
		const card = await openSync(user);
		await user.click(card.getByRole("button", { name: "Sync" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("not saved in a commit");
		expect(screen.getByRole("dialog", { name: "Sync state" })).toHaveTextContent(
			"not saved in a commit",
		);
	});
});
