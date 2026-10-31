import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

/** Opens the mock project, then the Design tab. */
async function openDesign(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Design" }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

const list = (page: Page, name: string) => page.getByRole("list", { name });

test("copies the ref of a diagram and shows its backlinks in the inspector", async ({
	page,
	context,
}) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await openDesign(page, "Diagrams");
	await list(page, "Diagrams")
		.getByRole("button", { name: /sync-flow/ })
		.click();
	await page.getByRole("button", { name: "Copy ref" }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("diagram:sync-flow");
	await expect(inspector(page).getByRole("button", { name: /^diagram:sync-flow/ })).toBeVisible();

	await list(page, "Diagrams")
		.getByRole("button", { name: /context/ })
		.click();
	await expect(inspector(page).getByRole("heading", { name: "Screen (1)" })).toBeVisible();
});

test("draws the demo Excalidraw scene and the demo BPMN process", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await openDesign(page, "Diagrams");
	await list(page, "Diagrams")
		.getByRole("button", { name: /context/ })
		.click();
	await expect(page.locator(".excalidraw")).toBeVisible();
	await list(page, "Diagrams")
		.getByRole("button", { name: /order-process/ })
		.click();
	await expect(page.locator("svg .djs-element").first()).toBeAttached();
	expect(errors).toEqual([]);
});

test("accepts a proposed ADR with a comment", async ({ page }) => {
	await openDesign(page, "Decisions");
	await list(page, "Decisions").getByRole("button", { name: /0003/ }).click();
	// The comment is required: both buttons stay off until it has text.
	await expect(page.getByRole("textbox", { name: "Comment" })).toHaveAttribute(
		"aria-required",
		"true",
	);
	await expect(page.getByRole("button", { name: "Reject" })).toBeDisabled();
	await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
	await page.getByRole("textbox", { name: "Comment" }).fill("Fits the plan");
	await page.getByRole("button", { name: "Accept", exact: true }).click();
	await expect(list(page, "Decisions").getByRole("button", { name: /0003/ })).toContainText(
		"Accepted",
	);
	await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
});

test("filters the flow table by VLAN and action", async ({ page }) => {
	await openDesign(page, "Flows");
	await list(page, "Flows")
		.getByRole("button", { name: /network/ })
		.click();
	await expect(page.getByRole("heading", { name: "Flows (20)" })).toBeVisible();
	const rows = page.getByRole("table").getByRole("row");
	await expect(rows).toHaveCount(21);
	await page.getByRole("combobox", { name: "VLAN or VNET" }).click();
	await page.getByRole("option", { name: "VLAN 20" }).click();
	await page.getByRole("combobox", { name: "Action" }).click();
	await page.getByRole("option", { name: "Deny" }).click();
	await expect(rows).toHaveCount(3);
});
