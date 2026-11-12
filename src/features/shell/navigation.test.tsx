import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { pageTitle } from "./page-chrome";

describe("page title", () => {
	it("names the tab, else the space, else the app", () => {
		expect(pageTitle(en, "/design/architecture")).toBe(en.tabs.design.architecture);
		expect(pageTitle(en, "/design")).toBe(en.space.design);
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
		const router = mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await router.navigate({ to: "/settings" });
		await waitFor(() => expect(router.state.location.pathname).toContain("/settings"));
		await user.click(screen.getByRole("button", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).toContain("/home"));
		await user.keyboard("{Control>}]{/Control}");
		await waitFor(() => expect(router.state.location.pathname).toContain("/settings"));
		await user.keyboard("{Control>}[[{/Control}");
		await waitFor(() => expect(router.state.location.pathname).toContain("/home"));
	});

	it("opens the manual from the avatar menu and with F1", async () => {
		const user = userEvent.setup();
		const router = mountApp("/home");
		await user.click(await screen.findByRole("button", { name: "Account" }));
		await user.click(
			await screen.findByRole("menuitem", { name: "Open the manual for this page" }),
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/knowledge/manual"));
		await router.navigate({ to: "/work" });
		await user.keyboard("{F1}");
		await waitFor(() => expect(router.state.location.pathname).toBe("/knowledge/manual"));
	});

	it("toggles the sidebar from the top bar and keeps one terminal button", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		const bar = within(await screen.findByRole("banner"));
		await user.click(bar.getByRole("button", { name: "Hide sidebar" }));
		await waitFor(() => expect(mockState().prefs.sidebarOpen).toBe(false));
		expect(bar.getByRole("button", { name: "Show sidebar" })).toBeVisible();
		expect(screen.queryByRole("button", { name: /^(Collapse|Expand)$/ })).toBeNull();
		expect(bar.getAllByRole("button", { name: /terminal/i })).toHaveLength(1);
	});

	it("fetches or pushes from the menu beside Sync", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const fetch = vi.spyOn(commands, "codeFetch");
		const push = vi.spyOn(commands, "codePush");
		mountApp("/home");
		await user.click(await screen.findByRole("button", { name: "More ways to sync" }));
		await user.click(await screen.findByRole("menuitem", { name: "Fetch only" }));
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		expect(push).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "More ways to sync" }));
		await user.click(await screen.findByRole("menuitem", { name: "Push" }));
		await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
	});

	it("changes the text size with Mod plus =, - and 0", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}={/Control}");
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(17));
		await user.keyboard("{Control>}-{/Control}{Control>}-{/Control}");
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(15));
		await user.keyboard("{Control>}0{/Control}");
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(16));
	});

	it("folds the right-hand icons into a More menu under 1100 px", async () => {
		const real = window.matchMedia;
		window.matchMedia = ((q: string) => ({
			matches: q.includes("1099"),
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
		try {
			const user = userEvent.setup();
			mountApp("/home");
			await user.click(await screen.findByRole("button", { name: "More" }));
			expect(await screen.findByRole("menuitem", { name: /Terminal|terminal/ })).toBeVisible();
			expect(screen.queryByRole("button", { name: /terminal/i })).toBeNull();
		} finally {
			window.matchMedia = real;
		}
	});
});
