import { expect, test } from "@playwright/test";
import { openAccount, openFirstFolder } from "./first-run";

test("opens a folder from the first run, opens a second project and switches back", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
	await openFirstFolder(page);
	// The mock picker returns /mock/alpha first. The project becomes active.
	const switcher = page.getByRole("button", { name: /^Project/ });
	await expect(switcher).toHaveText(/alpha/);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();

	// A second folder opens from the palette, with the keyboard.
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Open a local folder");
	await page.keyboard.press("ArrowDown");
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
	await openFirstFolder(page);
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
	// No project is open: the bare page of the first run has no rail and no project switch.
	await expect(switcher).toHaveCount(0);
	await recent.getByRole("button", { name: /alpha/ }).click();
	await expect(switcher).toHaveText(/alpha/);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();

	await pick("menuitem", "Open a local folder");
	await expect(switcher).toHaveText(/beta/);
	await pick("menuitemradio", /alpha/);
	await expect(switcher).toHaveText(/alpha/);
	await pick("menuitemradio", /beta/);
	await expect(switcher).toHaveText(/beta/);
});

test("shows the open project on the Projects page and closes it there", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	await expect(page.getByRole("button", { name: /^Project/ })).toHaveText(/alpha/);
	// A move inside the app: a reload would reset the mock.
	await page.evaluate(() => {
		window.history.pushState({}, "", "/projects");
		window.dispatchEvent(new PopStateEvent("popstate"));
	});
	await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
	const open = page
		.getByRole("list", { name: "Open now" })
		.getByRole("listitem", { name: "alpha" });
	await expect(open.getByText(/^Need you: \d+$/)).toBeVisible();
	await expect(open.getByText(/^Agents at work: \d+$/)).toBeVisible();
	await expect(page.getByText("Drop a folder here")).toBeVisible();
	await open.getByRole("button", { name: "Close project" }).click();
	await expect(page.getByRole("list", { name: "Recent projects" })).toBeVisible();
});

test("fixes a finding in Settings / Health after one confirm click", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	await (await openAccount(page)).getByRole("menuitem", { name: /Health \(2\)/ }).click();
	await expect(page.getByRole("heading", { name: "Compliance (1)" })).toBeVisible();
	await page.getByRole("button", { name: "Write" }).click();
	await expect(page.getByLabel(".gitignore")).toContainText(".DS_Store");
	await page.getByRole("button", { name: "Confirm" }).click();
	await expect(page.getByRole("heading", { name: "Compliance (0)" })).toBeVisible();
});

test("opens an entity from the palette and shows its backlinks", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("polling");
	await page.getByRole("option", { name: /adr:0004/ }).click();
	const inspector = page.getByLabel("Inspector", { exact: true });
	await expect(inspector.getByRole("heading", { name: "Spec (2)" })).toBeVisible();
	await expect(inspector.getByRole("heading", { name: "Change (1)" })).toBeVisible();
});
