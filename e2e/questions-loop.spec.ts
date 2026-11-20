import { expect, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

test("answers Q-101 with the keyboard, and the run leaves Needs you", async ({ page }) => {
	await page.goto("/home/today");
	await openFirstFolder(page);
	// The card of Today shows one thing: the question Q-101 first, named by its feature.
	const card = page.getByRole("article").first();
	await expect(card).toContainText("Fix login redirect");
	const answers = card.getByRole("group", {
		name: "Where should the user land after the session expires?",
	});
	await expect(answers.getByRole("button")).toHaveCount(3);
	await expect(
		page.getByRole("heading", { level: 1, name: /^\d+ things need you$/ }),
	).toBeVisible();

	await answers.getByRole("button").first().focus();
	await page.keyboard.press("3");
	await page.keyboard.press("Enter");
	// The card moves on to Q-103, the other open question: answer it too, so Q-101 is the last one.
	const design = page.getByRole("region", { name: "Q-103" });
	await expect(page.getByRole("region", { name: "Q-101" })).toHaveCount(0);
	await design.getByRole("radio").first().focus();
	await page.keyboard.press("2");
	await page.keyboard.press("Enter");
	// The question row leaves its region once answered: the card of Today keeps the answer.
	await expect(card.getByText("Answered")).toBeVisible();
	await expect(answers).toHaveCount(0);

	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Flow" })
		.click();
	// The run is on the board with its answer in: its card no longer asks for one.
	const card1 = page
		.getByRole("region", { name: "Build", exact: true })
		.getByRole("button", { name: /ACME-1(?!\d)/ });
	await expect(card1).toBeVisible();
	await expect(card1).not.toContainText("Answer a question");
});
