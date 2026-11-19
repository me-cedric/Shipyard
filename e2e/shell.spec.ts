import { expect, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { visit } from "./places";

test("first run shows one primary action and no tour or help text", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
	// The first run is a bare page: no rail, no top row. The rail shows with the project.
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	await expect(sidebar).toHaveCount(0);
	await expect(page.getByRole("banner")).toHaveCount(0);
	await expect(page.getByText(/tour|tip/i)).toHaveCount(0);
	await openFirstFolder(page);
	await expect(sidebar.getByRole("link")).toHaveCount(7);
});

test("keyboard path: place shortcut, palette action, inspector and a focus ring", async ({
	page,
}) => {
	await page.goto("/");
	await openFirstFolder(page);
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();

	await page.keyboard.press("ControlOrMeta+2");
	await expect(page.getByRole("link", { name: "Flow", exact: true })).toHaveAttribute(
		"aria-current",
		"page",
	);

	const inspector = page.getByLabel("Inspector", { exact: true });
	await expect(inspector).toHaveAttribute("data-open", "false");
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Toggle inspector");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(inspector).toHaveAttribute("data-open", "true");
	await page.keyboard.press("ControlOrMeta+i");
	await expect(inspector).toHaveAttribute("data-open", "false");

	await expect(page.getByRole("dialog")).toHaveCount(0);
	// Tab reaches the sidebar and the focus shows a ring (keyboard focus).
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	// The rail is before the top row: Shift+Tab from the top row reaches its foot.
	await page.getByRole("banner").getByRole("button", { name: "Back" }).focus();
	for (let i = 0; i < 24; i++) {
		await page.keyboard.press("Shift+Tab");
		if (await sidebar.locator(":focus").count()) break;
	}
	const focused = sidebar.locator(":focus");
	await expect(focused).toHaveCount(1);
	expect(await focused.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
});

test("keeps the view of each project apart and writes it on each move", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	const switcher = page.getByRole("button", { name: /^Project/ });
	await expect(switcher).toHaveText(/alpha/);
	await page.keyboard.press("ControlOrMeta+3");
	await expect(page).toHaveURL(/\/plan/);

	// The second project starts at its own home, not in the view of the first.
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Open a local folder");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(switcher).toHaveText(/beta/);
	await expect(page).not.toHaveURL(/\/plan/);
	// The mock keeps no state across a reload: the vitest `projects.test.tsx` covers the restart.
});

test("shows the shortcuts overlay and rebinds an action", async ({ page }) => {
	await page.goto("/");
	await openFirstFolder(page);
	await expect(page.getByRole("button", { name: /^Project/ })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+Shift+k");
	const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Change Toggle inspector" }).click();
	await page.keyboard.press("ControlOrMeta+Shift+u");
	await expect(dialog.locator("kbd", { hasText: /⇧U|Shift\+U/ })).toBeVisible();
	await page.keyboard.press("Escape");
	const inspector = page.getByLabel("Inspector", { exact: true });
	await page.keyboard.press("ControlOrMeta+Shift+u");
	await expect(inspector).toHaveAttribute("data-open", "true");
});

// spec:app-redesign#REQ-006, scenario "A viewer": Today opens and the menu shows no Code place.
test("a viewer opens on Today and sees no Code place", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Viewer", exact: true }).click();
	await openFirstFolder(page);
	await expect(page).toHaveURL(/\/today\/today$/);
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	await expect(sidebar.getByRole("link", { name: /^Today/ })).toHaveAttribute(
		"aria-current",
		"page",
	);
	// The mock project has no admin: each right, and Code shows. Give the team an admin and a viewer.
	await expect(sidebar.getByRole("link", { name: "Code" })).toBeVisible();
	await sidebar.getByRole("link", { name: "Crew" }).click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Crew" }).click();
	const main = page.getByRole("main");
	const add = async (name: string, handle: string, role: string, admin: boolean) => {
		await page.getByRole("button", { name: "Member", exact: true }).click();
		await main.getByRole("textbox", { name: "Name" }).fill(name);
		await main.getByRole("textbox", { name: "Handle" }).fill(handle);
		await main.getByRole("combobox", { name: "Role" }).click();
		await page.getByRole("option", { name: role }).click();
		if (admin) await main.getByRole("switch", { name: "Admin" }).click();
		await main.getByRole("button", { name: "Save" }).click();
		await expect(main.getByRole("heading", { level: 1, name })).toBeVisible();
		await main.getByRole("button", { name: "Crew", exact: true }).click();
	};
	await add("Vi Reader", "vi", "Viewer", false);
	await add("Cy Lead", "cy", "Tech lead", true);
	// This person is in no entry of the team file: the role viewer with its default levels.
	await expect(sidebar.getByRole("link", { name: "Code" })).toHaveCount(0);
	await expect(sidebar.getByRole("link")).toHaveCount(6);
	// The home address and an old address of the role page open Today too.
	await visit(page, "/");
	await expect(page).toHaveURL(/\/today\/today$/);
});
