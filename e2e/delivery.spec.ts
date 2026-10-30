import { expect, type Page, test } from "@playwright/test";

const lane = (page: Page, name: string) => page.getByRole("region", { name });

test("approvals wait for a click, and the runs show the review, CI and merge state", async ({
	page,
}) => {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Approvals (4)" })).toBeVisible();

	// The force push waits: nothing sends it until one click.
	const force = page.getByRole("region", { name: "Replace the code of ACME-10 on the server" });
	// The command stays behind Details.
	await expect(force.getByText("git push --force-with-lease origin fix/ACME-10")).toBeHidden();
	await force.getByRole("button", { name: "Approve" }).click();
	await expect(force).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Approvals (3)" })).toBeVisible();

	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Factory" })
		.click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Runs" }).click();

	const failing = lane(page, "In review").getByRole("button", { name: /ACME-7/ });
	await expect(failing).toContainText("pr:github:43");
	await expect(failing).toContainText("CI failing");

	await lane(page, "Working")
		.getByRole("button", { name: /ACME-10/ })
		.click();
	await expect(
		page.getByRole("region", { name: /^Findings/ }).getByText(/status never resets/),
	).toBeVisible();

	const ready = lane(page, "Ready to merge").getByRole("button", { name: /ACME-8/ });
	await expect(ready).toContainText("CI passing");
	await expect(lane(page, "Done").getByRole("button", { name: /ACME-11/ })).toBeVisible();
});
