import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });

/** The page of Setup that holds each page: Extensions is a pill of This project; the rules and the plugin review are linked from it. */
type SetupPage = "Agents and rules" | "Extensions" | "Plugins and rule packs";

/** Opens the mock project, then the page of Setup by its pill and its links. */
async function openSettings(page: Page, tab: SetupPage) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Setup" })
		.click();
	await tabs(page).getByRole("link", { name: "This project" }).click();
	await page
		.getByRole("navigation", { name: "This project" })
		.getByRole("link", { name: "Extensions" })
		.click();
	if (tab === "Agents and rules")
		await page
			.getByRole("region", { name: "Skills" })
			.getByRole("link", { name: "All skills" })
			.click();
	if (tab === "Plugins and rule packs")
		await page.getByRole("link", { name: "Plugins and rule packs" }).click();
}

test("applies one compass entry and keeps the others", async ({ page }) => {
	await openSettings(page, "Agents and rules");
	await expect(page.getByText("Compass 1.0.1")).toBeVisible();
	const select = page.getByRole("checkbox", { name: "Select ui-conformance" });
	await expect(select).toBeVisible();
	await page.getByRole("button", { name: "Apply ui-conformance" }).click();
	await expect(page.getByText("Written (1)")).toBeVisible();
	await expect(page.getByText(".agents/skills/ui-conformance/SKILL.md")).toBeVisible();
	// A current entry has nothing to select.
	await expect(select).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Apply ui-conformance" })).toHaveCount(0);
	// Another absent entry stays absent.
	await expect(page.getByRole("button", { name: "Apply vuln-triage" })).toBeVisible();
});

test("reviews a plugin, accepts some items and applies them", async ({ page }) => {
	await openSettings(page, "Plugins and rule packs");
	// The plugin review is a row that opens: the path field is under it.
	await page.locator("summary", { hasText: "Plugin" }).first().click();
	await page
		.getByRole("textbox", { name: "Plugin archive path" })
		.fill("/mock/plugins/team-kit.zip");
	await page.getByRole("button", { name: "Review" }).click();
	await expect(page.getByText("Tool server shell: runs a command on this computer")).toBeVisible();
	const apply = page.getByRole("button", { name: /^Apply plugin/ });
	await expect(apply).toHaveText("Apply plugin (4)");

	// Two items stay out: the count follows the boxes.
	await page.getByRole("checkbox", { name: "Accept team" }).click();
	await page.getByRole("checkbox", { name: "Accept docs", exact: true }).click();
	await expect(apply).toHaveText("Apply plugin (2)");
	await apply.click();

	await expect(page.getByText("Written (1)")).toBeVisible();
	await expect(page.getByText("docs/team.md")).toBeVisible();
	await expect(page.getByText("Kept (1)")).toBeVisible();
	await expect(page.getByText(/MCP servers added/)).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Apply plugin/ })).toHaveCount(0);
});

test("deploys to a child project on a branch and never pushes", async ({ page }) => {
	await openSettings(page, "Plugins and rule packs");
	const select = page.getByRole("checkbox", { name: "Select API gateway" });
	// Every cloned child project is chosen until a person picks: "Deploy to 1", then "Send" with none.
	const deploy = page
		.getByRole("region", { name: "Send to the child projects" })
		.getByRole("button", { name: /^(Send|Deploy to)/ });
	await expect(deploy).toHaveText("Deploy to 1");
	await select.click();
	await expect(deploy).toBeDisabled();
	await expect(deploy).toHaveText("Send");
	await select.click();
	await expect(deploy).toHaveText("Deploy to 1");
	await deploy.click();
	await expect(
		page.getByText("api-gateway Branch shipyard/extensions-1 Commit 3f2a9c1"),
	).toBeVisible();
	await expect(page.getByText(".agents/pattern/small-steps")).toBeVisible();
});

test("imports a rules file, applies a policy pack and removes the entry", async ({ page }) => {
	await openSettings(page, "Agents and rules");
	await page.getByRole("textbox", { name: "Rules file path" }).fill("/mock/rules/team-rules.md");
	await page.getByRole("button", { name: "Import" }).click();
	await expect(page.getByText("Imported pattern:team-rules")).toBeVisible();
	await page.getByRole("button", { name: "Remove team-rules" }).click();
	await expect(page.getByRole("button", { name: "Remove team-rules" })).toHaveCount(0);
	await page.getByRole("button", { name: "Apply strict-enterprise" }).click();
	await expect(page.getByText(".agents/policy.json")).toBeVisible();
	await expect(page.getByRole("button", { name: "Apply strict-enterprise" })).toHaveCount(0);
});

test("removes a child project", async ({ page }) => {
	await openSettings(page, "Extensions");
	// The Remove button is in the inspector of the child project, opened from its row.
	await page
		.getByRole("group", { name: "API gateway" })
		.getByRole("button", { name: "Open" })
		.click();
	await page
		.getByRole("complementary", { name: "API gateway" })
		.getByRole("button", { name: "Remove API gateway" })
		.click();
	// The card has no count: the row of the child project is gone.
	await expect(page.getByRole("group", { name: "API gateway" })).toHaveCount(0);
});
