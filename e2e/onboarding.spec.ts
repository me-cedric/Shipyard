import { expect, type Page, test } from "@playwright/test";

const FIRST = "One loop, from idea to merged code";
const PERMISSIONS = "Allow what Shipyard needs";
const LAST = "Run your first ticket";

async function replay(page: Page) {
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("dialog").getByRole("combobox").fill("Replay the tour");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog", { name: FIRST })).toBeVisible();
}

test("replays the tour, skips it with Close and ends it on Done", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
	await replay(page);
	await page.getByRole("button", { name: "Next" }).click();
	await expect(page.getByRole("dialog", { name: "Open a project" })).toBeVisible();
	await page.getByRole("button", { name: "Close" }).click();
	await expect(page.getByRole("dialog")).toBeHidden();

	await replay(page);
	for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("dialog", { name: LAST })).toBeVisible();
	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.getByRole("dialog")).toBeHidden();
});

test("asks for a permission from the tour and shows the list in Settings / Me", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
	await replay(page);
	for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
	const dialog = page.getByRole("dialog", { name: PERMISSIONS });
	const row = dialog.getByRole("group", { name: "Notifications" });
	await expect(row.getByText("Not asked")).toBeVisible();
	await row.getByRole("button", { name: "Allow" }).click();
	await expect(row.getByText("On", { exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toBeHidden();

	await page.goto("/settings/me");
	const files = page.getByRole("group", { name: "Documents, Desktop and Downloads" });
	await expect(files.getByRole("button", { name: "Allow" })).toBeVisible();
	await page.getByRole("button", { name: "Replay the tour" }).click();
	await expect(page.getByRole("dialog", { name: FIRST })).toBeVisible();
});

test("offers the settings on the steps and lists them in Settings / Me", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
	await replay(page);
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
	await page.keyboard.press("ArrowRight");
	const dialog = page.getByRole("dialog", { name: "Connect the issue tracker and the code host" });
	await expect(dialog.getByRole("group", { name: "Code host" }).getByText("To do")).toBeVisible();
	await dialog
		.getByRole("group", { name: "Issue tracker" })
		.getByRole("button", { name: "Connect" })
		.click();
	await expect(page).toHaveURL(/\/settings\/connections/);
	await expect(page.getByRole("dialog")).toBeHidden();

	await page.goto("/settings/me");
	const ai = page.getByRole("group", { name: "AI tool", exact: true });
	await expect(ai.getByText("To do")).toBeVisible();
});
