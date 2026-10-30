import { expect, test } from "@playwright/test";

test("first run shows one primary action and no tour or help text", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Open a local folder" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Sidebar" }).getByRole("link")).toHaveCount(8);
	await expect(page.getByText(/tour|tip/i)).toHaveCount(0);
});

test("keyboard path: space shortcut, palette action, inspector and a focus ring", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();

	await page.keyboard.press("ControlOrMeta+2");
	await expect(page.getByRole("link", { name: "Diagrams", exact: true })).toHaveAttribute(
		"aria-current",
		"page",
	);

	const inspector = page.getByLabel("Inspector", { exact: true });
	await expect(inspector).toHaveAttribute("data-open", "false");
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("dialog").getByRole("combobox").fill("Toggle inspector");
	await page.keyboard.press("Enter");
	await expect(inspector).toHaveAttribute("data-open", "true");
	await page.keyboard.press("ControlOrMeta+i");
	await expect(inspector).toHaveAttribute("data-open", "false");

	await expect(page.getByRole("dialog")).toHaveCount(0);
	// Tab reaches the sidebar and the focus shows a ring (keyboard focus).
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	// The context bar comes first: about 16 stops.
	for (let i = 0; i < 24; i++) {
		await page.keyboard.press("Tab");
		if (await sidebar.locator(":focus").count()) break;
	}
	const focused = sidebar.locator(":focus");
	await expect(focused).toHaveCount(1);
	expect(await focused.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
});

test("keeps the view of each project apart and writes it on each move", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	const switcher = page.getByRole("button", { name: /^Project/ });
	await expect(switcher).toHaveText(/alpha/);
	await page.keyboard.press("ControlOrMeta+3");
	await expect(page).toHaveURL(/\/specs/);

	// The second project starts at its own home, not in the view of the first.
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("dialog").getByRole("combobox").fill("Open a local folder");
	await page.keyboard.press("Enter");
	await expect(switcher).toHaveText(/beta/);
	await expect(page).not.toHaveURL(/\/specs/);
	// The mock keeps no state across a reload: the vitest `projects.test.tsx` covers the restart.
});

test("shows the shortcuts overlay and rebinds an action", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+Shift+k");
	const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Change Toggle inspector" }).click();
	await page.keyboard.press("ControlOrMeta+Shift+u");
	await expect(dialog.getByText(/⇧U|Shift\+U/)).toBeVisible();
	await page.keyboard.press("Escape");
	const inspector = page.getByLabel("Inspector", { exact: true });
	await page.keyboard.press("ControlOrMeta+Shift+u");
	await expect(inspector).toHaveAttribute("data-open", "true");
});
