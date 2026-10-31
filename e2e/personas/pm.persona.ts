import { test } from "@playwright/test";
import { Walk } from "./walk";

// Project manager, first hour: the board, assign, hand to the agent, plan, estimate, time, approvals, budget.
test("project manager", async ({ page }) => {
	const w = new Walk(page, { key: "pm", label: "Project manager" });
	await w.start();

	await w.step("Land on the board", "the page that opens first: Work, Board", async () => {
		await w.landsOn("Work", "Board");
		await w.see(page.getByText("Bump dependencies"), "no card on the board");
	});

	await w.step("Filter the board by person", "the All assignees menu", async () => {
		await w.click(page.getByRole("combobox", { name: "Assignee" }));
		await w.click(page.getByRole("option", { name: "Grace Hopper" }));
		await w.see(page.getByText("Fix the French menu"), "the filter hides the person's card");
		await w.click(page.getByRole("combobox", { name: "Assignee" }));
		await w.click(page.getByRole("option", { name: "All assignees" }));
	});

	await w.step("Assign a ticket", "the card, then the person with free days", async () => {
		const held = page.getByRole("main").getByText("Grace Hopper");
		const before = await held.count();
		await w.click(page.getByText("Bump dependencies"));
		await w.see(page.getByText("4 d free"), "no free-time hint beside the person");
		await w.click(page.getByRole("button", { name: "Assign Grace Hopper" }));
		await w.until(() => held.count(), before + 1, "the card does not show the new assignee");
		const marked = page.getByRole("button", { name: "Assign Grace Hopper" });
		if (!(await marked.isDisabled())) {
			w.confusing("the assign list shows no mark on the person who holds the ticket");
		}
	});

	await w.step(
		"Mark the ticket for the agent",
		"the Mark for agent button in the panel",
		async () => {
			await w.click(page.getByRole("button", { name: "Mark for agent" }));
			await w.see(page.getByText("shipyard").first(), "no agent label on the ticket");
		},
	);

	await w.step("Read the plan", "the Plan tab and its warnings", async () => {
		await w.go("Work", "Plan");
		await w.see(page.getByText("over capacity").first(), "no capacity warning");
		await w.click(page.getByRole("link", { name: /over capacity/ }));
		await w.until(
			() => page.url().includes("/work/team"),
			true,
			"a capacity warning does not open the member in Work / Team",
		);
		await w.see(page.getByLabel(/Capacity/).first(), "the member does not open with its capacity");
	});

	await w.step("Read the estimate", "the Summary tab: days, cost, price", async () => {
		await w.go("Work", "Estimates");
		await w.click(page.getByRole("tab", { name: "Summary" }));
		await w.see(page.getByText("Price"), "no price figure");
		if (await page.getByText("€0").first().isVisible()) {
			w.confusing(
				"cost and price read €0; the only hint (Unrated) is small text at the foot of the page, and Team already holds day rates",
			);
		}
	});

	await w.step(
		"Send the time to the issue tracker",
		"the To send list, the Send button",
		async () => {
			await w.go("Work", "Time");
			await w.click(page.getByRole("button", { name: "Send 2026-11-03 ACME-1" }));
			await w.see(page.getByText("To send (1)"), "the sent entry stays in the To send list");
		},
	);

	await w.step("Look at the team load", "the Team tab: who is free", async () => {
		await w.go("Work", "Team");
		await w.see(page.getByText("Ada Lovelace"), "no team member");
		if (!(await page.getByRole("columnheader").count())) {
			w.confusing("the team shows no column headers for load or capacity");
		}
	});

	await w.step("Find the backlog with the keyboard", "Ctrl+K, the name of a page", async () => {
		await w.palette("Backlog", "the palette finds no page by its name (Backlog)");
		await w.see(page.getByRole("heading", { name: "Backlog" }), "Enter does not open the page");
	});

	await w.step("Check the budget", "the Usage page, the money figures", async () => {
		await w.go("Factory", "Usage");
		await w.see(page.getByText("Over budget").first(), "no budget warning");
		if (await page.getByText("Hidden").first().isVisible()) {
			await w.click(page.getByRole("switch", { name: "Show prices" }));
		}
		await w.see(page.getByText(/\$\d/).first(), "the money figures stay hidden");
	});

	await w.step(
		"Answer what needs me",
		"Home, the Needs you list",
		async () => {
			await w.go("Home", "Inbox");
			await w.see(page.getByRole("heading", { name: "Needs you" }), "no inbox");
			await w.click(page.getByRole("button", { name: "Approve plan" }));
			await w.see(page.getByText("Needs you").first(), "the inbox does not answer the click");
		},
		true,
	);
});
