import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

const lane = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("approvals wait for a click, and the runs show the review, CI and merge state", async ({
	page,
}) => {
	await page.goto("/home/today");
	await openFirstFolder(page);
	const title = page.getByRole("heading", { level: 1 });
	await expect(title).toHaveText(/^\d+ things need you$/);
	const before = Number((await title.textContent())?.match(/^\d+/)?.[0]);
	// Today shows one thing on its card: a click on the queue picks the force push.
	const queue = page.getByRole("list", { name: "Needs you" });
	// The queue shows three things: "N more" shows the rest in place.
	const more = queue.getByRole("button", { name: /^\d+ more$/ });
	if ((await more.count()) > 0) await more.click();
	await queue.getByRole("button", { name: /Replace the code of ACME-10/ }).click();

	// The force push waits: nothing sends it until one click.
	const force = page.getByRole("region", { name: "Replace the code of ACME-10 on the server" });
	// The command stays behind Details.
	await expect(force.getByText("git push --force-with-lease origin fix/ACME-10")).toBeHidden();
	await force.getByRole("button", { name: "Approve" }).click();
	await expect(force).toHaveCount(0);
	await expect(title).toHaveText(`${before - 1} things need you`);

	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Flow" })
		.click();

	const failing = lane(page, "Review").getByRole("button", { name: /ACME-7/ });
	await expect(failing).toContainText("Checks fail");
	// The pull request number is on the page of the feature, not on its card.
	await failing.click();
	await expect(page.getByRole("region", { name: "ACME-7", exact: true })).toContainText("#43");
	await page.getByRole("link", { name: "Flow", exact: true }).first().click();

	await page.getByRole("button", { name: /ACME-10/ }).click();
	// The findings are in the Changes section of the feature page.
	await page
		.getByRole("navigation", { name: "Sections" })
		.getByRole("button", { name: "Changes" })
		.click();
	await expect(
		page.getByRole("region", { name: /^Findings/ }).getByText(/status never resets/),
	).toBeVisible();

	await page.getByRole("link", { name: "Flow", exact: true }).first().click();
	const ready = lane(page, "Review").getByRole("button", { name: /ACME-8/ });
	await expect(ready).toContainText("Ready to merge");
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Done" }).click();
	await expect(
		page
			.getByRole("table", { name: "History" })
			.getByRole("row", { name: /ACME-11/ })
			.first(),
	).toBeVisible();
});
