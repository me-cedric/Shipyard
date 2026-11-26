import { expect, test } from "@playwright/test";

const TOKEN = "tok-e2e-secret-7"; // gitleaks:allow

test("adds a tracker with a secret, tests it and removes it", async ({ page }) => {
	await page.goto("/setup/project?page=connections");
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByLabel("API key", { exact: true }).and(page.locator("input")).fill(TOKEN);
	await page.getByRole("button", { name: "Save" }).click();

	const row = page.getByRole("group", { name: "Acme" });
	await expect(page.getByRole("heading", { name: "Issue trackers (1)" })).toBeVisible();
	await expect(row.getByRole("list", { name: "Flags" }).getByRole("listitem")).toHaveCount(6);

	// The secret is masked, empty and never in the page (REQ-011).
	await row.getByRole("button", { name: "Edit" }).click();
	const secret = page.getByLabel("API key", { exact: true }).and(page.locator("input"));
	await expect(secret).toHaveValue("");
	await expect(secret).toHaveAttribute("placeholder", "••••••••");
	expect(await page.content()).not.toContain(TOKEN);
	await page.getByRole("button", { name: "Cancel" }).click();

	await row.getByRole("button", { name: "Test" }).click();
	await expect(row.getByRole("status")).toHaveText("Passed: Ada Lovelace");

	await row.getByRole("button", { name: "Remove" }).click();
	await row.getByRole("button", { name: "Confirm" }).click();
	await expect(row).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Connection" })).toBeVisible();
});

test("names a missing secret and the missing scope of a forge", async ({ page }) => {
	await page.goto("/setup/project?page=connections");
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Code");
	await page.getByRole("combobox", { name: "Type" }).click();
	await page.getByRole("option", { name: "Code host" }).click();
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "GitHub" }).click();
	await page.getByRole("textbox", { name: "Address" }).fill("https://noscope.example.com");
	await page.getByRole("button", { name: "Save" }).click();

	const row = page.getByRole("group", { name: "Code" });
	await expect(page.getByRole("heading", { name: "Code hosts (1)" })).toBeVisible();
	// No secret saved yet.
	await row.getByRole("button", { name: "Test" }).click();
	await expect(row.getByRole("status")).toHaveText("no secret saved");

	await row.getByRole("button", { name: "Edit" }).click();
	await page
		.getByLabel("Personal access token", { exact: true })
		.and(page.locator("input"))
		.fill("any");
	await page.getByRole("button", { name: "Save" }).click();
	// Save runs the test: the missing scope shows in the form, and Cancel closes it.
	await expect(page.getByRole("alert")).toHaveText("Missing scope: Pull requests: read");
	await page.getByRole("button", { name: "Cancel" }).click();
	await row.getByRole("button", { name: "Test" }).click();
	await expect(row.getByRole("status")).toHaveText("Missing scope: Pull requests: read");

	await row.getByRole("button", { name: "Repositories" }).click();
	await expect(row.getByRole("heading", { name: "Repositories (2)" })).toBeVisible();
	await expect(row.getByRole("group", { name: "acme/docs" }).getByText("No push")).toBeVisible();
});

test("adds a connection with the keyboard", async ({ page }) => {
	await page.goto("/setup/project?page=connections");
	await page.getByRole("button", { name: "Connection" }).focus();
	await page.keyboard.press("Enter");
	await page.getByRole("textbox", { name: "Name" }).focus();
	await page.keyboard.type("Acme");
	// Jira Cloud is the first product and needs an address and an email.
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.type("https://acme.atlassian.net");
	await page.keyboard.press("Tab");
	await page.keyboard.type("ada@example.com");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
});

test("adds an MCP server with a secret, starts it and stops it", async ({ page }) => {
	await page.goto("/setup/computer");
	const servers = page.getByRole("region", { name: "MCP servers" });
	await servers.getByRole("button", { name: "Add a server" }).click();
	await servers.getByRole("combobox", { name: "Server" }).click();
	await page.getByRole("option", { name: "Figma" }).click();
	await page.getByLabel("Figma API token").and(page.locator("input")).fill(TOKEN);
	await page.getByRole("button", { name: "Save" }).click();

	// Each server is a row that opens: its actions are under it.
	const row = servers.getByRole("group", { name: "Figma" });
	await expect(row).toBeVisible();
	await expect(row).toContainText("Stopped");
	expect(await page.content()).not.toContain(TOKEN);
	await row.locator("summary").click();

	await row.getByRole("button", { name: "Start" }).click();
	await expect(row).toContainText("Running");
	await expect(row.getByRole("alert")).toHaveCount(0);
	await row.getByRole("button", { name: "Stop" }).click();
	await expect(row).toContainText("Stopped");

	// The runners show with no action of the person.
	await expect(page.getByRole("group", { name: "Claude Code" })).toContainText("Ready");
});

test("turns on the server for outside agents and imports a server of another tool", async ({
	page,
}) => {
	await page.goto("/setup/computer?page=share");
	const region = (name: string) => page.getByRole("region", { name });
	await region("Address of Shipyard").getByRole("switch", { name: "Server on" }).click();
	await region("What they may use").getByRole("button", { name: "Read files" }).click();
	await region("Address of Shipyard").getByRole("button", { name: "Apply" }).click();
	await expect(region("Address of Shipyard").getByText("Running")).toBeVisible();
	// The card of the import has a heading, not a region name.
	await expect(
		page.getByRole("heading", { name: "Bring servers from another tool" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Import Claude Code" }).click();
	// The result shows in the card of the permissions.
	await expect(region("What they may use").getByRole("status")).toHaveText("Imported git");
});
