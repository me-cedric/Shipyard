import { expect, type Page, test } from "@playwright/test";

/** Opens the mock project, then the Code space on the given tab. */
async function openCode(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Code" })
		.click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: tab }).click();
}

const unstaged = (page: Page) => page.getByRole("region", { name: "Unstaged" });
const heading = (page: Page, name: string) => page.getByRole("heading", { name });

test("stages a file, commits it from the status bar and finds it in History", async ({ page }) => {
	await openCode(page, "Changes");
	await expect(heading(page, "Staged (1)")).toBeVisible();
	const commit = page.getByRole("contentinfo").getByRole("button", { name: "Commit" });
	await expect(commit).toBeEnabled();

	await unstaged(page).getByRole("checkbox", { name: "Select docs/guide.md" }).click();
	await page.getByRole("button", { name: "Stage (1)", exact: true }).click();
	await expect(heading(page, "Staged (2)")).toBeVisible();

	await commit.click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("textbox", { name: "Summary" }).fill("wip: guide");
	await dialog.getByRole("button", { name: "Commit" }).click();
	await expect(dialog.getByRole("alert")).toContainText("feat, fix, chore, docs, refactor, test");

	await dialog.getByRole("textbox", { name: "Summary" }).fill("docs(guide): update the guide");
	await dialog.getByRole("textbox", { name: "Description" }).fill("why");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(dialog).toBeHidden();
	await expect(heading(page, "Staged (0)")).toBeVisible();
	await expect(commit).toBeDisabled();

	await page
		.getByRole("navigation", { name: "Tabs" })
		.getByRole("link", { name: "History" })
		.click();
	await expect(page.getByRole("button", { name: /docs\(guide\): update the guide/ })).toBeVisible();
});

test("refuses a switch that would overwrite a change, then switches after a discard", async ({
	page,
}) => {
	await openCode(page, "Changes");
	const selector = page.getByRole("combobox", { name: "Working branch" });
	await expect(selector).toHaveText("main");

	await selector.click();
	await page.getByRole("option", { name: "feat/auth/login" }).click();
	await expect(page.getByRole("alert")).toContainText("src/app.ts");
	await expect(selector).toHaveText("main");

	await unstaged(page).getByRole("checkbox", { name: "Select src/app.ts" }).click();
	await page.getByRole("button", { name: "Discard (1)" }).click();
	await expect(heading(page, "Unstaged (3)")).toBeVisible();

	await selector.click();
	await page.getByRole("option", { name: "feat/auth/login" }).click();
	await expect(selector).toHaveText("feat/auth/login");
});

test("creates a branch in Code / Branches with the type, area and subject", async ({ page }) => {
	await openCode(page, "Branches");
	await page.getByRole("combobox", { name: "Type" }).click();
	await page.getByRole("option", { name: "fix" }).click();
	await page.getByRole("textbox", { name: "Area" }).fill("auth");
	await page.getByRole("textbox", { name: "Subject" }).fill("login-timeout");
	await page.getByRole("button", { name: "Branch" }).click();
	await expect(page.getByRole("combobox", { name: "Working branch" })).toHaveText(
		"fix/auth/login-timeout",
	);
	await expect(heading(page, "Local (3)")).toBeVisible();
});
