import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });

/** Opens the mock project, then Settings on the given tab. */
async function openSettings(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Settings" })
		.click();
	await tabs(page).getByRole("link", { name: tab }).click();
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
	await openSettings(page, "Extensions");
	await page
		.getByRole("textbox", { name: "Plugin archive path" })
		.fill("/mock/plugins/team-kit.zip");
	await page.getByRole("button", { name: "Review" }).click();
	await expect(page.getByText("mcp:shell: a local command")).toBeVisible();
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
	await openSettings(page, "Extensions");
	const select = page.getByRole("checkbox", { name: "Select API gateway" });
	const deploy = page.getByRole("button", { name: /^Deploy to/ });
	await expect(deploy).toBeDisabled();
	await select.click();
	await expect(deploy).toHaveText("Deploy to 1");
	await deploy.click();
	await expect(
		page.getByText("api-gateway Branch shipyard/extensions-1 Commit 3f2a9c1"),
	).toBeVisible();
	await expect(page.getByText(".agents/pattern/small-steps")).toBeVisible();
});
