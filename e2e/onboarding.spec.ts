import { expect, type Page, test } from "@playwright/test";

const FIRST = "One loop, from idea to merged code";
const PERMISSIONS = "Allow what Shipyard needs";
const LAST = "Run your first ticket";

/** A dialog that is open. A dialog that closes stays in the page until its exit animation ends, and the command palette that opened the tour can still be closing when the tour closes. */
const openDialogs = (page: Page) => page.locator('[role="dialog"][data-open]');

async function replay(page: Page) {
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Replay the tour");
	await page.keyboard.press("ArrowDown");
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
	await expect(openDialogs(page)).toHaveCount(0);

	await replay(page);
	for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("dialog", { name: LAST })).toBeVisible();
	await page.getByRole("button", { name: "Done" }).click();
	await expect(openDialogs(page)).toHaveCount(0);
});

test("asks for a permission from the tour and shows the list in Setup / This computer", async ({
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
	await expect(openDialogs(page)).toHaveCount(0);

	await page.goto("/setup/computer");
	const files = page.getByRole("group", { name: "Documents, Desktop and Downloads" });
	await expect(files.getByRole("button", { name: "Allow" })).toBeVisible();
	await page.getByRole("button", { name: "Replay the tour" }).click();
	await expect(page.getByRole("dialog", { name: FIRST })).toBeVisible();
});

test("offers the settings on the steps and lists them in Setup / Start", async ({ page }) => {
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
	// The connection lives under This project only (`spec:app-redesign#REQ-024`).
	await expect(page).toHaveURL(/\/setup\/project\?page=connections/);
	await expect(openDialogs(page)).toHaveCount(0);

	await page.goto("/setup/start");
	const steps = page.getByRole("list", { name: "Get started" });
	await expect(steps.getByRole("button")).toHaveCount(11);
	await steps.getByRole("button", { name: /AI tool/ }).click();
	await expect(page.getByRole("heading", { name: "Which AI tool does the work?" })).toBeVisible();
	await expect(page.getByText("To do", { exact: true })).toBeVisible();
	await expect(page.getByRole("link", { name: /^This project.+/ })).toHaveAttribute(
		"href",
		"/setup/project",
	);
});
