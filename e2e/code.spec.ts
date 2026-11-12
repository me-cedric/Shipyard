import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

/** Opens the mock project, then the Code space on the given tab. */
async function openCode(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Code" })
		.click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: tab }).click();
}

const unstaged = (page: Page) => page.getByRole("region", { name: "Unstaged" });
const heading = (page: Page, name: string) => page.getByRole("heading", { name });

test("stages a file, commits it from the status bar and finds it in History", async ({ page }) => {
	await openCode(page, "Local changes");
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
	await openCode(page, "Local changes");
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

test("merges a branch with one click in Code / Branches", async ({ page }) => {
	await openCode(page, "Branches");
	const row = page.getByRole("group", { name: "feat/auth/login" });
	await row.getByRole("button", { name: "Merge feat/auth/login" }).click();
	await expect(page.getByRole("alert")).toContainText("uncommitted changes");

	await page
		.getByRole("navigation", { name: "Tabs" })
		.getByRole("link", { name: "Local changes" })
		.click();
	await page
		.getByRole("region", { name: "Stashes" })
		.getByRole("button", { name: "Stash" })
		.click();
	await expect(heading(page, "Stashes (1)")).toBeVisible();
	await page
		.getByRole("navigation", { name: "Tabs" })
		.getByRole("link", { name: "Branches" })
		.click();
	await row.getByRole("button", { name: "Merge feat/auth/login" }).click();
	await expect(page.getByText("Already up to date")).toBeVisible();
});

test("rebases a branch in Code / Branches and asks before a force publish", async ({ page }) => {
	await openCode(page, "Branches");
	const row = page.getByRole("group", { name: "feat/auth/login" });
	await row.getByRole("button", { name: "Rebase onto feat/auth/login" }).click();
	await expect(page.getByRole("alert")).toContainText("uncommitted changes");

	// A force publish needs a second click on the button that names what it does.
	await page.getByRole("button", { name: "Force publish" }).click();
	await expect(page.getByRole("button", { name: "Replace the remote branch" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Force publish" })).toHaveCount(0);
});

// The list holds the factory pull requests (#40 to #47) and the forge mock ones (#141 to #143).
// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- `n` is a number
// A row is a link to the page of the pull request.
const pull = (page: Page, n: number) => page.getByRole("link", { name: new RegExp(`^#${n} `) });

test("lists the pull requests by state, opens one and comments", async ({ page }) => {
	await openCode(page, "Pull requests");
	await expect(heading(page, "Open (9)")).toBeVisible();
	await expect(heading(page, "Merged (1)")).toBeVisible();
	await expect(heading(page, "Closed (1)")).toBeVisible();
	await expect(pull(page, 46)).toContainText("Draft");

	await pull(page, 142).click();
	await expect(page).toHaveURL(/\/code\/pull-requests\/github-demo-142$/);
	await expect(
		page.getByRole("heading", { level: 1, name: /refuse an empty token/ }),
	).toBeVisible();
	await expect(
		page.getByText("Merge is blocked: 2 checks failing, changes requested"),
	).toBeVisible();
	await expect(page.getByText("rename this")).toBeVisible();
	// A resolved thread is one line: it opens on click and offers Reopen.
	await page.getByRole("button", { name: /src\/lib\.ts:7/ }).click();
	await expect(page.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
	const thread = page.getByRole("article", { name: "src/app.ts:2" });
	await thread.getByRole("button", { name: "Reply to src/app.ts:2", exact: true }).click();
	await page.getByRole("textbox", { name: "Reply to this thread" }).fill("Renamed.");
	await page.getByRole("button", { name: "Post reply" }).click();
	await expect(page.getByText("Renamed.")).toBeVisible();
	await thread.getByRole("button", { name: "Resolve", exact: true }).click();
	await expect(page.getByText("0 unresolved of 2")).toBeVisible();

	await page.getByRole("textbox", { name: "Comment" }).fill("Looks right now.");
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await expect(page.getByText("Looks right now.")).toBeVisible();
	await expect(page.getByRole("textbox", { name: "Comment" })).toHaveValue("");
});

test("approves a pull request from Submit review", async ({ page }) => {
	await openCode(page, "Pull requests");
	await pull(page, 141).click();
	await page.getByRole("button", { name: "Submit review" }).click();
	const dialog = page.getByRole("dialog", { name: "Submit review" });
	// The radio is hidden: a click on its label picks it.
	await dialog.getByText("Request changes", { exact: true }).click();
	await expect(dialog.getByRole("radio", { name: "Request changes" })).toBeChecked();
	await dialog.getByRole("button", { name: "Submit review" }).click();
	await expect(dialog.getByRole("alert")).toContainText("some text");
	await dialog.getByText("Approve", { exact: true }).click();
	await dialog.getByRole("button", { name: "Submit review" }).click();
	await expect(dialog).toBeHidden();
});

test("goes Back from a pull request to the list with its search kept", async ({ page }) => {
	await openCode(page, "Pull requests");
	await page.getByRole("searchbox", { name: "Search pull requests" }).fill("token");
	await pull(page, 142).click();
	await page.getByRole("link", { name: "Back" }).click();
	await expect(page.getByRole("searchbox", { name: "Search pull requests" })).toHaveValue("token");
	await expect(pull(page, 142)).toBeVisible();
});

test("marks a draft ready", async ({ page }) => {
	await openCode(page, "Pull requests");
	await pull(page, 143).click();
	const merge = page.getByRole("button", { name: "Merge", exact: true });
	await expect(merge).toBeDisabled();
	await page.getByRole("button", { name: "Mark ready" }).click();
	await expect(page.getByRole("button", { name: "Mark ready" })).toHaveCount(0);
	await expect(merge).toBeEnabled();
});

test("merges only after the confirm click", async ({ page }) => {
	await openCode(page, "Pull requests");
	await pull(page, 142).click();
	const merge = page.getByRole("button", { name: "Merge", exact: true });
	await merge.click();
	// The first click only asks: the merge has not run. The checks fail: the confirm names the risk.
	const confirm = page.getByRole("button", {
		name: "Merge with Merge although checks are failing?",
	});
	await expect(confirm).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);
	await confirm.click();
	await expect(confirm).toHaveCount(0);
	await expect(merge).toBeDisabled();
});

test("opens a file of a pull request in the viewer", async ({ page }) => {
	await openCode(page, "Pull requests");
	await pull(page, 142).click();
	await page.getByRole("tab", { name: /Files changed/ }).click();
	await page.getByRole("button", { name: "Expand all" }).click();
	await page.getByRole("button", { name: "Open src/app.ts" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("region", { name: "File src/app.ts" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

// Only the row under the pointer draws its "+": point at the line number first.
const plusOf = async (page: Page, line: number) => {
	await page
		.locator("[data-kind] > span:nth-child(2)", { hasText: new RegExp(`^${line}$`) })
		.first()
		.hover();
	return page.getByRole("button", { name: `Add a comment on line ${line}` });
};

test("comments on a line of a pull request: pending first, then one at once", async ({ page }) => {
	await openCode(page, "Pull requests");
	await pull(page, 142).click();
	await page.getByRole("tab", { name: /Files changed/ }).click();
	// The file has one thread, so its row says so while it is closed.
	await expect(page.getByText("1 comment").first()).toBeVisible();
	await page.getByRole("button", { name: "Expand all" }).click();
	// A pending comment on line 3: the box closes and the count grows.
	await (await plusOf(page, 3)).click();
	await page.getByRole("textbox", { name: "Comment on line 3" }).fill("Name this **c**.");
	await page.getByRole("button", { name: "Add review comment" }).click();
	await expect(page.getByRole("article", { name: "Pending: src/app.ts:3" })).toContainText(
		"Pending",
	);
	await expect(page.getByText("2 comments").first()).toBeVisible();
	// One comment at once: it comes back as a thread on the line.
	await (await plusOf(page, 1)).click();
	await page.getByRole("textbox", { name: "Comment on line 1" }).fill("Posted now.");
	await page.getByRole("button", { name: "Add single comment" }).click();
	await expect(page.getByRole("article", { name: "src/app.ts:1" })).toContainText("Posted now.");
});

test("analyzes a branch in Impacts and shows the plan and the digest", async ({ page }) => {
	await openCode(page, "Impacts");
	await page.getByRole("button", { name: "Analyze" }).click();
	await expect(heading(page, "Axes (7)")).toBeVisible();
	await expect(page.getByText("Update the contract.")).toBeVisible();
	await expect(page.getByText(/moves the release by one week/)).toBeVisible();
	await expect(page.getByRole("button", { name: /2026-10-29 main/ })).toBeVisible();
});

test("echoes a line in the terminal", async ({ page }) => {
	await openCode(page, "Local changes");
	// The Terminal tab is gone: the top bar button opens the drawer.
	await page.getByRole("banner").getByRole("button", { name: "Terminal" }).click();
	const terminal = page.getByRole("region", { name: "Terminal", exact: true });
	await expect(terminal).toContainText("/project $");
	await terminal.locator(".xterm-helper-textarea").focus();
	await page.keyboard.type("echo hello");
	await page.keyboard.press("Enter");
	await expect(terminal).toContainText("echo hello");
});
