import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { barSections, PLACE_IDS } from "../src/features/shell/places";
import { openFirstFolder, pickDarkTheme } from "./first-run";

// The views inside a section, which the switch does not list: the link of each one is on its section.
const VIEWS: Record<string, string[]> = { "/crew/crew": ["/crew/crew?view=live"] };

// Every section of every place, on the mock project, in the light and the dark theme.
for (const scheme of ["light", "dark"] as const) {
	for (const place of PLACE_IDS) {
		// The sections of the switch: Terminal and Manual are not on it.
		const tabs = barSections(place)
			.map(([, tab]) => `/${place}/${tab}`)
			.flatMap((path) => [path, ...(VIEWS[path] ?? [])]);
		test(`has no axe violation: ${place}, ${scheme} theme`, async ({ page }) => {
			test.setTimeout(90_000);
			page.setDefaultTimeout(10_000);
			await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
			await page.goto("/");
			await openFirstFolder(page);
			await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
			if (scheme === "dark") await pickDarkTheme(page);
			await page.locator(`nav a[href="/${place}"]`).first().click();
			const found: string[] = [];
			for (const tab of tabs) {
				await page.locator(`a[href="${tab}"]`).first().click();
				await expect(page.locator("main")).toBeVisible();
				await page.waitForLoadState("networkidle");
				const { violations } = await new AxeBuilder({ page }).analyze();
				// The summary names the cause, for example the two colours and the contrast ratio.
				for (const v of violations)
					found.push(
						`${tab} ${v.id}: ${v.nodes.map((n) => `${n.target} (${n.failureSummary ?? ""})`).join(" | ")}`,
					);
			}
			expect(found).toEqual([]);
		});
	}
	// The manual is no tab since wave 2: the scan opens it by its address.
	test(`has no axe violation: the manual, ${scheme} theme`, async ({ page }) => {
		page.setDefaultTimeout(10_000);
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
		await page.goto("/knowledge/manual");
		await expect(page.getByRole("article")).toBeVisible();
		if (scheme === "dark") await pickDarkTheme(page);
		await page.waitForLoadState("networkidle");
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(violations.map((v) => v.id)).toEqual([]);
	});
}
