import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { mountApp } from "@/test/mount";
import { MANUAL, searchManual } from "./manual";

describe("Knowledge / Manual", () => {
	it("ships a page for each space, with a section for each tab", () => {
		expect(MANUAL.map((p) => p.id)).toEqual([
			"start",
			"home",
			"design",
			"specs",
			"work",
			"factory",
			"code",
			"knowledge",
			"settings",
		]);
		for (const [space, tabs] of Object.entries(en.tabs)) {
			const page = MANUAL.find((p) => p.id === space);
			for (const label of Object.values(tabs))
				expect(page?.text, `${space}: ${label}`).toMatch(new RegExp(`^## ${label}$`, "m"));
		}
	});

	it("finds each section that holds every word of the search", () => {
		const hits = searchManual("token keychain");
		expect(hits.map((h) => `${h.page}/${h.heading}`)).toEqual([
			"start/Safe by default",
			"settings/Connections",
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
