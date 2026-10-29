import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SPACES } from "../src/features/shell/spaces";

// Every tab of every space, on the mock project, in the light and the dark theme (the theme is "system").
for (const scheme of ["light", "dark"] as const) {
	for (const [space, tabs] of Object.entries(SPACES)) {
		test(`has no axe violation: ${space}, ${scheme} theme`, async ({ page }) => {
			test.setTimeout(90_000);
			page.setDefaultTimeout(10_000);
			await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
			await page.goto("/");
			await page.getByRole("button", { name: "Open a local folder" }).click();
			await expect(page.getByRole("combobox", { name: "Project" })).toBeVisible();
			await page.locator(`nav a[href="/${space}"]`).first().click();
			const found: string[] = [];
			for (const tab of tabs) {
				await page.locator(`a[href="/${space}/${tab}"]`).first().click();
				await expect(page.locator("main")).toBeVisible();
				await page.waitForLoadState("networkidle");
				const { violations } = await new AxeBuilder({ page }).analyze();
				for (const v of violations)
					found.push(`${tab} ${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`);
			}
			expect(found).toEqual([]);
		});
	}
}
