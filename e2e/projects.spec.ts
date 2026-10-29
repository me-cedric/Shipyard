import { expect, test } from "@playwright/test";

test("opens a folder from the first run, opens a second project and switches back", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Open a local folder" })).toBeVisible();
	await page.getByRole("button", { name: "Open a local folder" }).click();
	// The mock picker returns /mock/alpha first. The project becomes active.
	const switcher = page.getByRole("button", { name: /^Project/ });
	await expect(switcher).toHaveText(/alpha/);
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();

	// A second folder opens from the palette, with the keyboard.
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("dialog").getByRole("combobox").fill("Open a local folder");
	await page.keyboard.press("Enter");
	await expect(switcher).toHaveText(/beta/);

	await switcher.click();
	await page.getByRole("menuitemradio", { name: /alpha/ }).click();
	await expect(switcher).toHaveText(/alpha/);
});

test("closes a project, opens it again from the recent list and switches between two", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	const switcher = page.getByRole("button", { name: /^Project/ });
	await expect(switcher).toHaveText(/alpha/);

	// The next click waits until the menu is gone: a menu that still closes ignores it.
	const pick = async (item: "menuitem" | "menuitemradio", name: string | RegExp) => {
		await switcher.click();
		await page.getByRole(item, { name }).click();
		await expect(page.getByRole("menu")).toBeHidden();
	};
	await pick("menuitem", "Close project");
	const recent = page.getByRole("list", { name: "Recent projects" });
	await expect(recent.getByRole("button", { name: /alpha/ })).toBeVisible();
	await expect(switcher).not.toHaveText(/alpha/);
	await recent.getByRole("button", { name: /alpha/ }).click();
	await expect(switcher).toHaveText(/alpha/);
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();

	await pick("menuitem", "Open a local folder");
	await expect(switcher).toHaveText(/beta/);
	await pick("menuitemradio", /alpha/);
	await expect(switcher).toHaveText(/alpha/);
	await pick("menuitemradio", /beta/);
	await expect(switcher).toHaveText(/beta/);
});

test("fixes a finding in Settings / Health after one confirm click", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await page.getByRole("link", { name: /Health \(2\)/ }).click();
	await expect(page.getByRole("heading", { name: "Compliance (1)" })).toBeVisible();
	await page.getByRole("button", { name: "Write" }).click();
	await expect(page.getByLabel(".gitignore")).toContainText(".DS_Store");
	await page.getByRole("button", { name: "Confirm" }).click();
	await expect(page.getByRole("heading", { name: "Compliance (0)" })).toBeVisible();
});

test("opens an entity from the palette and shows its backlinks", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("dialog").getByRole("combobox").fill("polling");
	await page.getByRole("option", { name: /adr:0004/ }).click();
	const inspector = page.getByLabel("Inspector", { exact: true });
	await expect(inspector.getByRole("heading", { name: "Spec (2)" })).toBeVisible();
	await expect(inspector.getByRole("heading", { name: "Change (1)" })).toBeVisible();
});
