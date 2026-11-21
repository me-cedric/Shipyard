import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder, openSync } from "./first-run";
import { placeOf, visit } from "./places";

/** Opens the mock project, then the Code space on the given tab. */
async function openCode(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: placeOf(tab) })
		.click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: tab }).click();
}

const files = (page: Page) => page.getByRole("list", { name: "Files" });
const commitBox = (page: Page) => page.getByRole("form", { name: "Commit" });
// The changed files are a page of their own: the link of the Changes section opens it.
const filesPage = (page: Page) => page.getByRole("link", { name: /commits?, all files$/ }).click();
const heading = (page: Page, name: string) => page.getByRole("heading", { name });
// A section of the feature page, from its switch. A pull request opens on Changes.
const section = (page: Page, name: string) =>
	page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name }).click();
// Code Now shows the open pull requests only: "Merged and closed" opens the page Pull requests.
const fullList = (page: Page) => page.getByRole("link", { name: "Merged and closed" }).click();

test("chooses a file, commits it from /code/changes and finds it in History", async ({ page }) => {
	await openCode(page, "Now");
	await visit(page, "/code/changes");
	await expect(heading(page, "4 files to commit")).toBeVisible();

	await files(page).getByRole("checkbox", { name: "Select docs/guide.md" }).click();
	const box = commitBox(page);
	await box.getByRole("textbox", { name: "Commit message" }).fill("wip: guide");
	await box.getByRole("button", { name: "Commit 2 files" }).click();
	await expect(box.getByRole("alert")).toContainText("feat, fix, chore, docs, refactor, test");

	await box.getByRole("textbox", { name: "Commit message" }).fill("docs(guide): update the guide");
	await box.getByRole("button", { name: "More" }).click();
	await box.getByRole("textbox", { name: "Description" }).fill("why");
	await box.getByRole("button", { name: "Commit 2 files" }).click();
	await expect(heading(page, "3 files to commit")).toBeVisible();

	await page
		.getByRole("navigation", { name: "Tabs" })
		.getByRole("link", { name: "History" })
		.click();
	await expect(page.getByRole("button", { name: /docs\(guide\): update the guide/ })).toBeVisible();
});

test("commits the staged file from the card of the sync mark with Ctrl/Cmd+Enter", async ({
	page,
}) => {
	await openCode(page, "Now");
	await visit(page, "/code/changes");
	await expect(heading(page, "4 files to commit")).toBeVisible();
	const commit = (await openSync(page)).getByRole("button", { name: "Commit" });
	await expect(commit).toBeEnabled();
	await commit.click();
	const dialog = page.getByRole("dialog", { name: "Commit" });
	await dialog.getByRole("textbox", { name: "Summary" }).fill("wip: guide");
	await dialog.getByRole("button", { name: "Commit" }).click();
	await expect(dialog.getByRole("alert")).toContainText("feat, fix, chore, docs, refactor, test");

	await dialog.getByRole("textbox", { name: "Summary" }).fill("docs(guide): update the guide");
	await dialog.getByRole("textbox", { name: "Description" }).fill("why");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(dialog).toBeHidden();
	// The staged file also has an unstaged change, so it stays in the list: nothing is left staged.
	await openSync(page);
	await expect(commit).toBeDisabled();
	await page.keyboard.press("Escape");

	await page
		.getByRole("navigation", { name: "Tabs" })
		.getByRole("link", { name: "History" })
		.click();
	await expect(page.getByRole("button", { name: /docs\(guide\): update the guide/ })).toBeVisible();
});

test("refuses a switch that would overwrite a change, then switches after a discard", async ({
	page,
}) => {
	await openCode(page, "Now");
	const selector = page.getByRole("combobox", { name: "Working branch" });
	await expect(selector).toHaveText("main");

	await selector.click();
	await page.getByRole("option", { name: "feat/auth/login" }).click();
	await expect(page.getByRole("alert")).toContainText("src/app.ts");
	await expect(selector).toHaveText("main");

	await visit(page, "/code/changes");
	await files(page).getByRole("button", { name: "src/app.ts" }).click();
	await page.getByRole("button", { name: "Discard" }).click();
	await expect(heading(page, "3 files to commit")).toBeVisible();
	await visit(page, "/code/now");

	await selector.click();
	await page.getByRole("option", { name: "feat/auth/login" }).click();
	await expect(selector).toHaveText("feat/auth/login");
});

test("creates a branch in Code / Branches with the type, area and subject", async ({ page }) => {
	await openCode(page, "Branches");
	await page.getByRole("button", { name: "New branch" }).click();
	await page.getByRole("combobox", { name: "Type" }).click();
	await page.getByRole("option", { name: "fix" }).click();
	await page.getByRole("textbox", { name: "Area" }).fill("auth");
	await page.getByRole("textbox", { name: "Subject" }).fill("login-timeout");
	await page.getByRole("button", { name: "Create the branch" }).click();
	// The working branch is in the card of the sync mark.
	await expect((await openSync(page)).getByRole("combobox", { name: "Working branch" })).toHaveText(
		"fix/auth/login-timeout",
	);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("group", { name: "fix/auth/login-timeout" })).toBeVisible();
});

test("shows a merged branch with Switch and Delete only, and puts the changes aside", async ({
	page,
}) => {
	// A merged branch has no Merge button: the unit test seeds an unmerged one (branches.test.tsx).
	await openCode(page, "Branches");
	const row = page.getByRole("group", { name: "feat/auth/login" });
	await expect(row.getByRole("button", { name: "Switch" })).toBeVisible();
	await expect(row.getByRole("button", { name: "Merge feat/auth/login" })).toHaveCount(0);
	await visit(page, "/code/changes");
	await page.getByRole("button", { name: "Put my changes aside" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("wip auth");
	await page.getByRole("button", { name: "Put my changes aside" }).click();
	await expect(page.getByRole("group", { name: "wip auth" })).toBeVisible();
});

test("rebases a branch in Code / Branches and asks before a force publish", async ({ page }) => {
	await openCode(page, "Branches");
	await page.getByRole("button", { name: "More" }).click();
	await page.getByRole("menuitem", { name: "Rebase onto feat/auth/login" }).click();
	await expect(page.getByRole("alert")).toContainText("uncommitted changes");

	// A force publish needs a second click on the button that names what it does.
	await page.getByRole("button", { name: "More" }).click();
	await page.getByRole("menuitem", { name: "Force publish" }).click();
	await expect(page.getByRole("button", { name: "Replace the remote branch" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Force publish" })).toHaveCount(0);
});

// The page Pull requests holds the factory pull requests (#40 to #47) and the forge mock ones (#141 to #143).
// A row selects the pull request: the title in the review panel opens its page.
const titles: Record<number, string> = {
	46: "Update the CI cache key",
	141: "add the health route",
	142: "refuse an empty token",
	143: "show the pull requests",
};
const pull = (page: Page, n: number) => page.getByRole("button", { name: titles[n] });
const openPull = async (page: Page, n: number) => {
	await pull(page, n).click();
	await page.getByRole("link", { name: titles[n] }).click();
};

test("lists the pull requests by state, opens one and comments", async ({ page }) => {
	await openCode(page, "Now");
	await fullList(page);
	await expect(heading(page, "Open, 9")).toBeVisible();
	await expect(heading(page, "Merged")).toBeVisible();
	await expect(heading(page, "Closed")).toBeVisible();
	await expect(pull(page, 46)).toContainText("Draft");

	await openPull(page, 142);
	await expect(page).toHaveURL(/\/code\/pull-requests\/github-demo-142$/);
	await expect(
		page.getByRole("heading", { level: 1, name: /refuse an empty token/ }),
	).toBeVisible();
	await expect(
		page.getByText("Merge is blocked: 2 checks failing, changes requested"),
	).toBeVisible();
	// The conversation and the threads are in Chat.
	await section(page, "Chat");
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
	// The merge box is in Changes.
	await section(page, "Changes");
	await expect(page.getByText("2 of 2 solved")).toBeVisible();

	await section(page, "Chat");
	await page.getByRole("textbox", { name: "Comment" }).fill("Looks right now.");
	await page.getByRole("button", { name: "Comment", exact: true }).click();
	await expect(page.getByText("Looks right now.")).toBeVisible();
	await expect(page.getByRole("textbox", { name: "Comment" })).toHaveValue("");
});

test("approves a pull request from Submit review", async ({ page }) => {
	await openCode(page, "Now");
	await fullList(page);
	await openPull(page, 141);
	// The write box of Chat has Submit review (the review bar has it while a comment waits).
	await section(page, "Chat");
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
	await openCode(page, "Now");
	await fullList(page);
	await page.getByRole("searchbox", { name: "Search the pull requests" }).fill("token");
	await openPull(page, 142);
	await page.getByRole("link", { name: "Pull requests", exact: true }).click();
	await expect(page.getByRole("searchbox", { name: "Search the pull requests" })).toHaveValue(
		"token",
	);
	await expect(pull(page, 142)).toBeVisible();
});

test("marks a draft ready", async ({ page }) => {
	await openCode(page, "Now");
	await fullList(page);
	await openPull(page, 143);
	const merge = page.getByRole("button", { name: "Merge pull request", exact: true });
	const box = page.getByRole("region", { name: "Merge", exact: true });
	await expect(merge).toBeDisabled();
	// Mark ready is in More of the merge card.
	await box.getByRole("button", { name: "More" }).click();
	await page.getByRole("menuitem", { name: "Mark ready" }).click();
	await box.getByRole("button", { name: "More" }).click();
	await expect(page.getByRole("menuitem", { name: "Copy ref" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Mark ready" })).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(merge).toBeEnabled();
});

test("merges only after the confirm click", async ({ page }) => {
	await openCode(page, "Now");
	await fullList(page);
	await openPull(page, 142);
	const merge = page.getByRole("button", { name: "Merge pull request", exact: true });
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
	await openCode(page, "Now");
	await fullList(page);
	await openPull(page, 142);
	await filesPage(page);
	// The page opens the first file: its row is open and Expand all has nothing left to open.
	await expect(page.getByRole("button", { name: /^src\/app\.ts/ })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
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
	await openCode(page, "Now");
	await fullList(page);
	await openPull(page, 142);
	await filesPage(page);
	// The file has one thread, so its row says so while it is closed.
	await expect(page.getByText("1 comment").first()).toBeVisible();
	await expect(page.getByRole("button", { name: /^src\/app\.ts/ })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
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
	// Impacts is off the section switch: its old address opens it as a page of Flow.
	await openCode(page, "Now");
	await visit(page, "/code/impacts");
	await expect(page).toHaveURL(/\/flow\/impacts$/);
	// Analyze is in More of the page. The plan and the digest are in the full report, under Details.
	const more = async (name: string) => {
		await page.getByRole("button", { name: "More", exact: true }).click();
		await page.getByRole("menuitem", { name }).click();
	};
	await more("Analyze");
	await page.getByRole("link", { name: "Full impact report" }).click();
	await more("Details");
	await expect(heading(page, "Axes (7)")).toBeVisible();
	// Each line of the plan has a check box that names the line, so the text must match whole.
	await expect(page.getByText("Update the contract.", { exact: true })).toBeVisible();
	await expect(page.getByText(/moves the release by one week/)).toBeVisible();
	await page.getByRole("button", { name: "Past reports" }).click();
	await expect(page.getByRole("button", { name: /2026-10-29 main/ })).toBeVisible();
});

test("echoes a line in the terminal", async ({ page }) => {
	// Terminal is a section of Code (spec:app-redesign#REQ-022).
	await openCode(page, "Terminal");
	const terminal = page
		.getByRole("tabpanel", { name: "Terminal" })
		.getByRole("region", { name: "Terminal", exact: true });
	await expect(terminal).toContainText("/project $");
	await terminal.locator(".xterm-helper-textarea").focus();
	await page.keyboard.type("echo hello");
	await page.keyboard.press("Enter");
	await expect(terminal).toContainText("echo hello");
});

test("echoes a line in the terminal drawer, from Code / Now and from the Ask bar", async ({
	page,
}) => {
	// The drawer stays for the other sections: the button of Code / Now opens it.
	await openCode(page, "Now");
	await page.getByRole("main").getByRole("button", { name: "Terminal" }).click();
	const terminal = page.getByRole("region", { name: "Terminal", exact: true });
	await expect(terminal).toContainText("/project $");
	await terminal.locator(".xterm-helper-textarea").focus();
	await page.keyboard.type("echo hello");
	await page.keyboard.press("Enter");
	await expect(terminal).toContainText("echo hello");

	// The same action is in the Ask bar: it closes the drawer, then opens it again.
	const ask = page.getByRole("combobox", { name: "Ask or tell Shipyard" });
	for (const shown of [0, 1]) {
		await ask.click();
		await ask.fill("Terminal");
		await page.getByRole("option", { name: /^Terminal/ }).click();
		await expect(terminal).toHaveCount(shown);
	}
});
