import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLACE_IDS, sections } from "@/features/shell/places";
import { tabLabel } from "@/features/shell/spaces";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { fr } from "@/lib/i18n/fr";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { MANUAL, manualFor, searchManual } from "./manual";
import { openManualFor, useManualTarget } from "./manual-target";

const headings = (text: string) => text.match(/^#{1,3} .+$/gm) ?? [];

describe("Library / Manual", () => {
	it("ships a page for each place, for the start, the projects, the Ask bar and the themes", () => {
		expect(MANUAL.map((p) => p.id)).toEqual([
			"start",
			"today",
			"flow",
			"plan",
			"crew",
			"library",
			"code",
			"setup",
			"projects",
			"ask",
			"theming",
		]);
	});

	it.each([
		["en", en],
		["fr", fr],
		["de", de],
		["es", es],
	] as const)("names each place and each section as the screen does (%s)", (lang, t) => {
		const pages = manualFor(lang);
		for (const place of PLACE_IDS) {
			const page = pages.find((p) => p.id === place);
			expect(page?.title, place).toBe(t.ui.place[place]);
			for (const [space, tab] of sections(place)) {
				const label = tabLabel(t, space, tab);
				expect(headings(page?.text ?? ""), `${place}: ${label}`).toContainEqual(
					expect.stringMatching(new RegExp(`^#+ ${label}$`)),
				);
			}
		}
		expect(pages.find((p) => p.id === "projects")?.title).toBe(t.tabs.home.projects);
	});

	it.each(["fr", "de", "es"] as const)(
		"ships each page in %s, with the headings of the English page (constitution 4.4)",
		(lang) => {
			const pages = manualFor(lang);
			expect(pages.map((p) => p.id)).toEqual(MANUAL.map((p) => p.id));
			for (const [i, page] of pages.entries()) {
				expect(page.text, page.id).not.toBe(MANUAL[i]?.text);
				expect(
					headings(page.text).map((h) => h.split(" ")[0]),
					page.id,
				).toEqual(headings(MANUAL[i]?.text ?? "").map((h) => h.split(" ")[0]));
			}
			expect(manualFor("en")).toEqual(MANUAL);
		},
	);

	it("says recipe, issue tracker and code host, and never names an old space", () => {
		for (const page of MANUAL.filter((p) => p.id !== "theming")) {
			expect(page.text, page.id).not.toMatch(/workflow|factory|forge/i);
			expect(page.text, page.id).not.toMatch(/(?<!issue )tracker/i);
			expect(page.text, page.id).not.toMatch(/\b(Home|Work|Knowledge|Settings) \//);
		}
	});

	it("serves the page in the language of the interface", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		mountApp("/library/manual");
		expect(await screen.findByRole("article", { name: "Démarrer" })).toBeInTheDocument();
		expect(searchManual("trousseau", manualFor("fr")).length).toBeGreaterThan(0);
		expect(manualFor("de")[0]?.title).toBe("Erste Schritte");
		expect(manualFor("es")[0]?.title).toBe("Primeros pasos");
	});

	it("finds each section that holds every word of the search", () => {
		const hits = searchManual("token keychain");
		expect(hits.map((h) => `${h.page}/${h.heading}`)).toEqual([
			"start/Safe by default",
			"library/Screens",
			"setup/Connections",
			"setup/AI tools",
		]);
		expect(searchManual("   ")).toEqual([]);
	});

	it("searches without a project and opens the page of a result", async () => {
		const user = userEvent.setup();
		mountApp("/library/manual");
		const pages = await screen.findByRole("navigation", { name: "Manual pages" });
		expect(within(pages).getAllByRole("button")).toHaveLength(MANUAL.length);
		expect(await screen.findByRole("article", { name: "Getting started" })).toBeInTheDocument();
		await user.type(screen.getByRole("searchbox", { name: "Search the manual" }), "merge box");
		const results = await screen.findByRole("region", { name: "Results" });
		await user.click(within(results).getByRole("button", { name: /^Flow \/ Changes/ }));
		expect(await screen.findByRole("article", { name: "Flow" })).toBeInTheDocument();
	});

	it("opens the page of the current place, at its section, from the palette", async () => {
		const user = userEvent.setup();
		mountApp("/crew/spend");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}k{/Control}");
		await screen.findByRole("combobox", { name: "Ask or tell Shipyard" });
		await user.keyboard("Open the manual for this page{ArrowDown}{Enter}");
		const page = await screen.findByRole("article", { name: "Crew" });
		await waitFor(() =>
			expect(within(page).getByRole("heading", { name: "Spend" })).toBeInTheDocument(),
		);
		const pages = screen.getByRole("navigation", { name: "Manual pages" });
		expect(within(pages).getByRole("button", { name: "Crew" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	it.each([
		["/library/reports", "Library", "Reports"],
		["/library/diagrams", "Library", "Diagrams"],
		["/flow/impacts", "Flow", "Impacts"],
		["/setup/computer", "Setup", "This computer"],
	])("scrolls to the section of %s", async (path, title, section) => {
		mountApp("/library/manual");
		await screen.findByRole("navigation", { name: "Sidebar" });
		// jsdom has no scrollIntoView.
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		act(() => openManualFor(path));
		const page = await screen.findByRole("article", { name: title });
		const heading = await within(page).findByRole("heading", { name: section });
		await waitFor(() => expect(scroll.mock.instances).toContain(heading));
		Reflect.deleteProperty(Element.prototype, "scrollIntoView");
	});

	it("finds the page of an address by its place", () => {
		const { result } = renderHook(() => useManualTarget());
		act(() => openManualFor("/library/reports"));
		expect(result.current).toMatchObject({ page: "library", tab: "reports" });
		act(() => openManualFor("/code/history"));
		expect(result.current).toMatchObject({ page: "code", tab: "history" });
		act(() => openManualFor("/flow/feature/wi:ACME-1"));
		expect(result.current).toMatchObject({ page: "flow", tab: "feature" });
		act(() => openManualFor("/projects"));
		expect(result.current).toMatchObject({ page: "projects", tab: null });
		act(() => openManualFor("/"));
		expect(result.current).toMatchObject({ page: "start", tab: null });
	});
});
