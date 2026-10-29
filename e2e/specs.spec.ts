import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });

/** Opens the mock project with a Linear tracker, then the Specs space on the given tab. */
async function openSpecs(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	await sidebar.getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Connections" }).click();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByLabel("Secret", { exact: true }).and(page.locator("input")).fill("tok-e2e-specs");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
	await tabs(page).getByRole("link", { name: "Project" }).click();
	await page.getByRole("combobox", { name: "Tracker" }).click();
	await page.getByRole("option", { name: "Acme" }).click();
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
	await sidebar.getByRole("link", { name: "Specs" }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("shows a validation finding on the artifact that holds it, with its line", async ({
	page,
}) => {
	await openSpecs(page, "Changes");
	await page.getByRole("row", { name: /add-billing/ }).click();
	await page.getByRole("button", { name: "Validate" }).click();
	const artifacts = page.getByRole("navigation", { name: "Artifacts" });
	await expect(artifacts.getByRole("img", { name: "Proposal: Done" })).toBeVisible();
	await artifacts.getByRole("button", { name: /Spec \/ invoices/ }).click();
	await expect(
		page.getByRole("button", { name: /Line \d+.*REQ-002 has no scenario/ }),
	).toBeVisible();
});

test("folds an answer into its spec after the preview and one click", async ({ page }) => {
	await openSpecs(page, "Questions");
	await page.getByRole("row", { name: /^Q-035/ }).click();
	await page.getByRole("dialog").getByRole("combobox", { name: "Status" }).fill("answered");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByRole("row", { name: /^Q-035/ }).click();
	await page.getByRole("button", { name: "Fold" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("textbox", { name: "Answer" }).fill("CSV first");
	const preview = dialog.getByRole("region", { name: "Preview" });
	await expect(preview).toContainText("NEEDS CLARIFICATION");
	await dialog.getByRole("button", { name: "Fold" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await tabs(page).getByRole("link", { name: "Changes" }).click();
	await page.getByRole("row", { name: /add-export/ }).click();
	await page
		.getByRole("navigation", { name: "Artifacts" })
		.getByRole("button", { name: /Spec \/ export/ })
		.click();
	await expect(page.getByRole("textbox", { name: "Spec / export" })).toHaveValue(
		/### Clarifications[\s\S]*Q-035 .*: CSV first/,
	);
});

test("applies a split once and a second apply creates no duplicate", async ({ page }) => {
	await openSpecs(page, "Changes");
	await page.getByRole("row", { name: /add-auth/ }).click();
	const open = async () => {
		await page.getByRole("button", { name: "Split" }).click();
		await page.getByRole("button", { name: "Preview" }).click();
	};
	await open();
	let dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Create (3)" })).toBeVisible();
	await dialog.getByRole("button", { name: "Apply" }).click();
	await expect(dialog.getByRole("heading", { name: "Written (3)" })).toBeVisible();
	await page.keyboard.press("Escape");
	await open();
	dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Unchanged (3)" })).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
});
