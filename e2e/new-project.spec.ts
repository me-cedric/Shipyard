import { expect, type Page, test } from "@playwright/test";

const TOKEN = "tok-e2e-creator-1"; // gitleaks:allow shipyard:allow-secret

/** A move inside the app: a reload would reset the mock. */
const goTo = (page: Page, path: string) =>
	page.evaluate((p) => {
		window.history.pushState({}, "", p);
		window.dispatchEvent(new PopStateEvent("popstate"));
	}, path);

test("creates a local project from the first run", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Create a project" }).click();
	const dialog = page.getByRole("dialog", { name: "New project" });
	await dialog.getByRole("textbox", { name: "Name" }).fill("Acme Web");
	await dialog.getByRole("button", { name: "Create", exact: true }).click();
	await dialog.getByRole("button", { name: "Open", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Project/ })).toHaveText(/Acme Web/);
	await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
});

test("creates a project with a new repository and starter issues", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/settings/connections");
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme tracker");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByLabel("API key", { exact: true }).and(page.locator("input")).fill(TOKEN);
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("heading", { name: "Issue trackers (1)" })).toBeVisible();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme code");
	await page.getByRole("combobox", { name: "Type" }).click();
	await page.getByRole("option", { name: "Code host" }).click();
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "GitHub" }).click();
	await page.getByRole("textbox", { name: "Address" }).fill("https://github.com");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("heading", { name: "Code hosts (1)" })).toBeVisible();

	await goTo(page, "/home/projects");
	await page.getByRole("button", { name: "New project" }).click();
	const dialog = page.getByRole("dialog", { name: "New project" });
	await dialog.getByRole("textbox", { name: "Name" }).fill("Acme Web");
	const steps = dialog.getByRole("navigation", { name: "Steps" });
	await steps.getByRole("button", { name: "Remote" }).click();
	await dialog.getByRole("button", { name: "New repository" }).click();
	await expect(dialog.getByRole("textbox", { name: "Owner and name" })).toHaveValue(
		"owner/acme-web",
	);
	await dialog.getByRole("combobox", { name: "Issue tracker" }).click();
	await page.getByRole("option", { name: "Acme tracker" }).click();
	await steps.getByRole("button", { name: "Start" }).click();
	await expect(dialog.getByRole("radio", { name: "Run" })).toBeEnabled();
	await dialog.getByRole("radio", { name: "Issues" }).check({ force: true });
	await expect(dialog.getByRole("button", { name: "docs/brief.md" })).toBeVisible();
	await expect(steps.getByRole("button", { name: "Start" })).toHaveAttribute(
		"aria-current",
		"step",
	);
	await expect(dialog.getByRole("radio", { name: "Issues" })).toBeChecked();
	await dialog.getByRole("button", { name: ".shipyard/project.yaml" }).click();
	await expect(dialog.getByRole("textbox", { name: /Text of/ })).toHaveValue(/connections:/);
	if (process.env.SCREENSHOTS) {
		// The colours finish their short fade.
		await page.mouse.move(700, 700);
		await page.waitForTimeout(500);
		await page.screenshot({ path: "docs/assets/screenshots/new-project.png" });
	}

	await dialog.getByRole("button", { name: "Create", exact: true }).click();
	await expect(dialog.getByRole("textbox", { name: "Issue 1" })).toBeVisible();
	await dialog.getByRole("button", { name: "Create issues" }).click();
	await expect(dialog.getByText("4 issues created")).toBeVisible();
	await dialog.getByRole("button", { name: "Open", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Project/ })).toHaveText(/Acme Web/);
});
