import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { openLibrary } from "./places";

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

/** Opens the mock project, then a Design section of the Library. */
async function openDesign(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	await openLibrary(page, tab);
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
	// The page menu copies the ref; the inspector has its own copy button.
	await page.getByRole("main").getByRole("button", { name: "More", exact: true }).click();
	await page.getByRole("menuitem", { name: "Copy the reference" }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("diagram:sync-flow");
	await expect(inspector(page).getByText("diagram:sync-flow", { exact: true })).toBeVisible();

	await list(page, "Diagrams")
		.getByRole("button", { name: /context/ })
		.click();
	const linked = inspector(page).getByRole("region", { name: "Linked to" });
	await expect(linked.getByRole("button", { name: /^Screen, Home/ })).toHaveCount(1);
});

test("draws the demo Excalidraw scene and the demo BPMN process", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await openDesign(page, "Diagrams");
	await list(page, "Diagrams")
		.getByRole("button", { name: /context/ })
		.click();
	await page.getByRole("button", { name: "Open", exact: true }).first().click();
	await expect(page.locator(".excalidraw")).toBeVisible();
	// An open diagram fills the page: its list is behind "All diagrams".
	await page.getByRole("button", { name: "All diagrams" }).click();
	await list(page, "Diagrams")
		.getByRole("button", { name: /order-process/ })
		.click();
	await page.getByRole("button", { name: "Open", exact: true }).first().click();
	await expect(page.locator("svg .djs-element").first()).toBeAttached();
	expect(errors).toEqual([]);
});

test("accepts a proposed ADR with a reason", async ({ page }) => {
	await openDesign(page, "Decisions");
	const decision = list(page, "Decisions").getByRole("button", { name: /Ship a browser mock/ });
	await decision.click();
	// The reason is required: a click on Refuse or Accept with an empty field gives an error line.
	await expect(page.getByRole("textbox", { name: "Reason" })).toHaveAttribute(
		"aria-required",
		"true",
	);
	await page.getByRole("button", { name: "Refuse" }).click();
	await expect(page.getByRole("alert").filter({ hasText: "Write a reason first" })).toBeVisible();
	await page.getByRole("button", { name: "Accept", exact: true }).click();
	await expect(page.getByRole("alert").filter({ hasText: "Write a reason first" })).toBeVisible();
	await expect(decision).toContainText("Waits for you");
	await page.getByRole("textbox", { name: "Reason" }).fill("Fits the plan");
	await page.getByRole("button", { name: "Accept", exact: true }).click();
	await expect(
		list(page, "Decisions").getByRole("button", { name: /Ship a browser mock/ }),
	).toContainText("Accepted");
	await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
});

test("refuses a proposed ADR with a reason", async ({ page }) => {
	await openDesign(page, "Decisions");
	const decision = list(page, "Decisions").getByRole("button", { name: /Ship a browser mock/ });
	await decision.click();
	await page.getByRole("textbox", { name: "Reason" }).fill("Out of scope");
	await page.getByRole("button", { name: "Refuse" }).click();
	await expect(decision).toContainText("Rejected");
	await expect(page.getByRole("button", { name: "Refuse" })).toHaveCount(0);
});

test("filters the flow table by VLAN and action", async ({ page }) => {
	await openDesign(page, "Network flows");
	const rows = page.getByRole("table").getByRole("row");
	await expect(rows).toHaveCount(21);
	// The filters live on the full matrix page.
	await page.getByRole("link", { name: "Open the full matrix" }).click();
	await expect(page).toHaveURL(/\/library\/flows\/matrix$/);
	await expect(page.getByRole("heading", { level: 1, name: "Flow matrix" })).toBeVisible();
	await expect(rows).toHaveCount(21);
	await page.getByRole("combobox", { name: "VLAN or VNET" }).click();
	await page.getByRole("option", { name: "VLAN 20" }).click();
	await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Denied" }).click();
	await expect(rows).toHaveCount(3);
});
