import { expect, type Page, test } from "@playwright/test";

const REF = "spec:auth#REQ-001";
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const panel = (page: Page) => page.getByRole("complementary", { name: "Assistant" });
const log = (page: Page) => panel(page).getByRole("log", { name: "Messages" });
const input = (page: Page) => panel(page).getByRole("textbox", { name: "Message" });

/** Opens the mock project, then the panel with its shortcut. */
async function openPanel(page: Page) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await page.keyboard.press("Control+j");
	await expect(input(page)).toBeFocused();
}

const say = async (page: Page, text: string) => {
	await input(page).fill(text);
	await input(page).press("Enter");
};

const pick = async (page: Page, select: string, option: string) => {
	await panel(page).getByRole("combobox", { name: select, exact: true }).click();
	await page.getByRole("option", { name: option, exact: true }).click();
};

test("asks in ask mode, keeps the draft in another space and closes with the button", async ({
	page,
}) => {
	await openPanel(page);
	await say(page, "What is the plan?");
	await expect(log(page).getByText("Here is the answer.")).toBeVisible();
	await input(page).fill("half a thought");
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await expect(input(page)).toHaveValue("half a thought");
	await page.getByRole("banner").getByRole("button", { name: "Assistant" }).click();
	await expect(panel(page)).toBeHidden();
});

test("writes a plan in plan mode", async ({ page }) => {
	await openPanel(page);
	await pick(page, "Mode", "Plan");
	await say(page, "Plan the export");
	await expect(log(page).getByText(/^Plan:/)).toBeVisible();
});

test("waits for a permission in agent mode, then shows the changed files and the diff", async ({
	page,
}) => {
	await openPanel(page);
	await pick(page, "Mode", "Agent");
	await say(page, "deny this edit");
	await expect(log(page).getByRole("status")).toContainText("Waiting: Bash(pnpm test)");
	const changed = panel(page).getByRole("region", { name: "Changed files" });
	await changed.getByText("src/hello.ts").click();
	await expect(changed.getByText("export const bye = () => 'bye';")).toBeVisible();
	await log(page).getByRole("button", { name: "Grant" }).click();
	await expect(log(page).getByText("I ran pnpm test. All tests pass.")).toBeVisible();
	await expect(log(page).getByRole("button", { name: "Grant" })).toHaveCount(0);
});

test("sends a thread to the factory as a work item with a workflow", async ({ page }) => {
	await openPanel(page);
	await say(page, "Plan the export");
	await expect(log(page).getByText("Here is the answer.")).toBeVisible();
	await panel(page).getByRole("button", { name: "Send to factory" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText(/^doc:assistant\//)).toBeVisible();
	await dialog.getByRole("combobox", { name: "Workflow" }).click();
	await page.getByRole("option", { name: "feature" }).click();
	await dialog.getByRole("button", { name: "Send", exact: true }).click();
	await expect(dialog.getByRole("status")).toContainText("Sent SHIP-101 · wf:feature");
});

test("adds a ref by typing, refuses an unknown one and explains the ref", async ({ page }) => {
	await openPanel(page);
	await input(page).pressSequentially("@wi:NONE-1 ");
	await expect(panel(page).getByRole("alert")).toContainText("wi:NONE-1 does not resolve");
	await input(page).pressSequentially(`@${REF} `);
	const context = panel(page).getByRole("list", { name: "Context" });
	await expect(context.getByRole("button", { name: new RegExp(`^${REF}`) })).toBeVisible();
	await panel(page).getByRole("button", { name: "Explain" }).click();
	await expect(log(page).getByText(/part of the project graph/)).toBeVisible();
	await expect(log(page).getByRole("button", { name: new RegExp(`^${REF}`) })).toBeVisible();
});

test("shows the trace, the context ring and the reply buttons", async ({ page }) => {
	await openPanel(page);
	await say(page, "long options");
	const summary = log(page).getByText(/^Trace · \d+ tools · \d+ ms$/);
	await expect(summary).toBeVisible();
	const step = log(page).locator("details").first().getByRole("listitem").first();
	await expect(step).toBeHidden();
	await summary.click();
	await expect(step).toBeVisible();
	const ring = panel(page).getByRole("meter", { name: "Context" });
	await expect(ring).toHaveAttribute("aria-valuetext", "60 %");
	await panel(page).getByRole("button", { name: "Split it in two steps" }).click();
	await expect(log(page).getByText("Split it in two steps").first()).toBeVisible();
	await expect(panel(page).getByRole("list", { name: "Options" })).toHaveCount(0);
});

test("resizes by keyboard and moves to the left side", async ({ page }) => {
	await openPanel(page);
	const handle = panel(page).getByRole("separator", { name: "Width" });
	await handle.focus();
	await page.keyboard.press("ArrowLeft");
	await expect(handle).toHaveAttribute("aria-valuenow", "416");
	const box = async () => (await panel(page).boundingBox())?.width;
	expect(await box()).toBe(416);
	const main = page.getByRole("main");
	expect((await panel(page).boundingBox())?.x).toBeGreaterThan((await main.boundingBox())?.x ?? 0);
	await panel(page).getByRole("button", { name: "Move to the left" }).click();
	await expect(panel(page).getByRole("button", { name: "Move to the right" })).toBeVisible();
	expect((await panel(page).boundingBox())?.x).toBeLessThan((await main.boundingBox())?.x ?? 0);
});
