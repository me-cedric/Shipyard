import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { MANUAL, manualFor, searchManual } from "./manual";

describe("Knowledge / Manual", () => {
	it("ships a page for each space, with a section for each tab", () => {
		expect(MANUAL.map((p) => p.id)).toEqual([
			"start",
			"home",
			"design",
			"specs",
			"work",
			"team",
			"factory",
			"code",
			"knowledge",
			"settings",
			"theming",
		]);
		for (const [space, tabs] of Object.entries(en.tabs)) {
			const page = MANUAL.find((p) => p.id === space);
			for (const label of Object.values(tabs))
				expect(page?.text, `${space}: ${label}`).toMatch(new RegExp(`^## ${label}$`, "m"));
		}
	});

	it("ships a French page for each page, with a section for each tab, and keeps English when one is missing", () => {
		const pages = manualFor("fr");
		expect(pages.map((p) => p.id)).toEqual(MANUAL.map((p) => p.id));
		expect(pages.every((p, i) => p.text !== MANUAL[i]?.text)).toBe(true);
		for (const [space, tabs] of Object.entries(fr.tabs)) {
			const page = pages.find((p) => p.id === space);
			for (const label of Object.values(tabs))
				expect(page?.text, `${space}: ${label}`).toMatch(new RegExp(`^## ${label}$`, "m"));
		}
		expect(manualFor("en")).toEqual(MANUAL);
	});

	it("serves the page in the language of the interface", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		mountApp("/knowledge/manual");
		expect(await screen.findByRole("article", { name: "Démarrer" })).toBeInTheDocument();
		expect(searchManual("trousseau", manualFor("fr")).length).toBeGreaterThan(0);
	});

	it("finds each section that holds every word of the search", () => {
		const hits = searchManual("token keychain");
		expect(hits.map((h) => `${h.page}/${h.heading}`)).toEqual([
			"start/Safe by default",
			"design/Screens",
			"settings/Connections",
			"settings/AI tools",
		]);
		expect(searchManual("   ")).toEqual([]);
	});

	it("searches without a project and opens the page of a result", async () => {
		const user = userEvent.setup();
		mountApp("/knowledge/manual");
		const pages = await screen.findByRole("navigation", { name: "Manual pages" });
		expect(within(pages).getAllByRole("button")).toHaveLength(MANUAL.length);
		expect(await screen.findByRole("article", { name: "Getting started" })).toBeInTheDocument();
		await user.type(screen.getByRole("searchbox", { name: "Search the manual" }), "pull request");
		const results = await screen.findByRole("region", { name: "Results" });
		await user.click(within(results).getByRole("button", { name: /^Code \/ Pull requests/ }));
		expect(await screen.findByRole("article", { name: "Code" })).toBeInTheDocument();
	});

	it("opens the page of the current view from the palette", async () => {
		const user = userEvent.setup();
		mountApp("/factory/usage");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}k{/Control}");
		await screen.findByRole("combobox");
		await user.keyboard("Open the manual for this page{Enter}");
		const page = await screen.findByRole("article", { name: "Factory" });
		await waitFor(() =>
			expect(within(page).getByRole("heading", { name: "Usage" })).toBeInTheDocument(),
		);
		expect(screen.getByRole("button", { name: "Factory" })).toHaveAttribute("aria-current", "page");
	});
});
