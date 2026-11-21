import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { pageTitle } from "./page-chrome";
import { openAccount, openSync } from "./test-open";

describe("page title", () => {
	it("names the section, else the place, else the app", () => {
		expect(pageTitle(en, "/library/architecture")).toBe(en.tabs.design.architecture);
		expect(pageTitle(en, "/library")).toBe(en.ui.place.library);
		expect(pageTitle(en, "/nowhere")).toBe("Shipyard");
	});
});

describe("navigation (W15 M8)", () => {
	it("sets the title, announces the page and offers a skip link", async () => {
		const user = userEvent.setup();
		mountApp("/design/architecture");
		await waitFor(() => expect(document.title).toBe(`${en.tabs.design.architecture} · Shipyard`));
		expect(
			screen.getByText(en.tabs.design.architecture, { selector: "[aria-live]" }),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Skip to the content" }));
		expect(screen.getByRole("main")).toHaveFocus();
	});

	it("goes back and forward with the buttons and with Mod plus brackets", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await router.navigate({ to: "/settings" });
		await waitFor(() => expect(router.state.location.pathname).toContain("/setup"));
		await user.click(screen.getByRole("button", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).toContain("/today"));
		await user.keyboard("{Control>}]{/Control}");
		await waitFor(() => expect(router.state.location.pathname).toContain("/setup"));
		await user.keyboard("{Control>}[[{/Control}");
		await waitFor(() => expect(router.state.location.pathname).toContain("/today"));
	});

	it("opens the manual from the avatar menu and with F1", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home");
		const menu = await openAccount(user);
		await user.click(menu.getByRole("menuitem", { name: /^Manual/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/manual"));
		await router.navigate({ to: "/work" });
		await user.keyboard("{F1}");
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/manual"));
	});

	it("toggles the sidebar, the assistant and the terminal from the top row", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		const bar = within(await screen.findByRole("banner"));
		await user.click(bar.getByRole("button", { name: "Hide sidebar" }));
		await waitFor(() => expect(mockState().prefs.sidebarOpen).toBe(false));
		expect(bar.getByRole("button", { name: "Show sidebar" })).toBeVisible();
		expect(screen.queryByRole("button", { name: /^(Collapse|Expand)$/ })).toBeNull();
		// The assistant and the terminal open from any page.
		const assistant = bar.getByRole("button", { name: "Assistant" });
		await user.click(assistant);
		await waitFor(() => expect(assistant).toHaveAttribute("aria-pressed", "true"));
		const terminal = bar.getByRole("button", { name: "Terminal" });
		await user.click(terminal);
		await waitFor(() => expect(terminal).toHaveAttribute("aria-pressed", "true"));
	});

	it("fetches or pushes from the card of the sync mark", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const fetch = vi.spyOn(commands, "codeFetch");
		const push = vi.spyOn(commands, "codePush");
		mountApp("/home");
		const card = await openSync(user);
		await user.click(card.getByRole("button", { name: "Fetch only" }));
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		expect(push).not.toHaveBeenCalled();
		await user.click(card.getByRole("button", { name: "Push" }));
		await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
	});

	it("changes the text size with Mod plus =, - and 0", async () => {
		const user = userEvent.setup();
		// The shell shows with an open project: the first run is a bare page.
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}={/Control}");
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(17));
		await user.keyboard("{Control>}-{/Control}{Control>}-{/Control}");
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(15));
		await user.keyboard("{Control>}0{/Control}");
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(16));
	});

	it("keeps the top row to the same controls under 1100 px, with no More menu", async () => {
		const real = window.matchMedia;
		window.matchMedia = ((q: string) => ({
			matches: q.includes("1099"),
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
		try {
			const user = userEvent.setup();
			await unwrap(commands.projectsOpen("/mock/alpha", false));
			mountApp("/home");
			const bar = within(await screen.findByRole("banner"));
			expect(bar.queryByRole("button", { name: "More" })).toBeNull();
			// The terminal stays reachable: it is an action of the Ask bar.
			await user.click(bar.getByRole("combobox", { name: "Ask or tell Shipyard" }));
			expect(await screen.findByRole("option", { name: /^Terminal/ })).toBeInTheDocument();
		} finally {
			window.matchMedia = real;
		}
	});
});
