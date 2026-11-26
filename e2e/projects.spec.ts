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
	// Agents work in the demo project: closing asks first (`spec:shell-setup-rights#REQ-012`).
	await page.getByRole("button", { name: "Keep them working" }).click();
	// No project is open: the bare No project card has no rail and no project switch.
	await expect(switcher).toHaveCount(0);
	await page.getByRole("button", { name: "Open a project" }).click();
	await expect(page.getByRole("menuitem", { name: /alpha/ })).toBeVisible();
	await page.getByRole("menuitem", { name: /alpha/ }).click();
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
		.getByRole("list", { name: "Open", exact: true })
		.getByRole("listitem", { name: "alpha" });
	await expect(open.getByText(/^(\d+ need you|1 needs you|Nothing needs you)$/)).toBeVisible();
	await expect(
		open.getByText(/^(\d+ agents at work|1 agent at work|No agent at work)$/),
	).toBeVisible();
	await expect(page.getByText("Drop a folder here")).toBeVisible();
	await open.getByRole("button", { name: "Close project" }).click();
	// Cancel keeps the project open.
	const ask = page.getByRole("dialog", { name: /agents? still works?/i });
	await ask.getByRole("button", { name: "Cancel" }).click();
	await expect(ask).toBeHidden();
	await expect(open).toBeVisible();
	await open.getByRole("button", { name: "Close project" }).click();
	await page.getByRole("button", { name: "Keep them working" }).click();
	await expect(page.getByRole("heading", { level: 1, name: "No project is open" })).toBeVisible();
});

test("fixes a finding in Settings / Health after one confirm click", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	await (await openAccount(page)).getByRole("menuitem", { name: /Health \(2\)/ }).click();
	// The finding of the rules is in its own card, with its count in words.
	const rules = page.getByRole("region", { name: "Rules and skills of the agents" });
	await expect(rules).toContainText("1 to fix");
	await rules.getByRole("button", { name: "Fix", exact: true }).click();
	await expect(page.getByLabel(".gitignore")).toContainText(".DS_Store");
	await page.getByRole("button", { name: "Confirm" }).click();
	// A card with nothing to fix leaves the page.
	await expect(rules).toHaveCount(0);
});

test("opens an entity from the palette and shows its backlinks", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("polling");
	await page.getByRole("option", { name: /Polling sync/ }).click();
	const inspector = page.getByLabel("Inspector", { exact: true });
	const linked = inspector.getByRole("region", { name: "Linked to" });
	await expect(linked.getByRole("button", { name: /^Spec,/ })).toHaveCount(2);
	await expect(linked.getByRole("button", { name: /^Change,/ })).toHaveCount(1);
});
