import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { barTabs, SPACES, type SpaceId } from "../src/features/shell/spaces";
import { openFirstFolder } from "./first-run";

// Every tab of every space, on the mock project, in the light and the dark theme (the theme is "system").
for (const scheme of ["light", "dark"] as const) {
	for (const space of Object.keys(SPACES) as SpaceId[]) {
		// The tabs of the bar: Terminal and Manual are no tabs.
		const tabs = barTabs(space, null);
		test(`has no axe violation: ${space}, ${scheme} theme`, async ({ page }) => {
			test.setTimeout(90_000);
			page.setDefaultTimeout(10_000);
			await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
			await page.goto("/");
			await openFirstFolder(page);
			await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
			await page.locator(`nav a[href="/${space}"]`).first().click();
			const found: string[] = [];
			for (const tab of tabs) {
				await page.locator(`a[href="/${space}/${tab}"]`).first().click();
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
}
