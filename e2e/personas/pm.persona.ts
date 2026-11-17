import { test } from "@playwright/test";
import { Walk } from "./walk";

// Project manager, first hour: the board, assign, hand to the agent, plan, estimate, time, approvals, budget.
test("project manager", async ({ page }) => {
	const w = new Walk(page, { key: "pm", label: "Project manager" });
	await w.start();

	await w.step("Land on the board", "the page that opens first: Flow, Flow", async () => {
		await w.landsOn("Flow", "Flow");
		await w.see(page.getByText("Bump dependencies"), "no card on the board");
	});

	await w.step("Filter the board by person", "the All assignees menu", async () => {
		await w.go("Flow", "List");
		await w.click(page.getByRole("combobox", { name: "Assignee" }));
		await w.click(page.getByRole("option", { name: "Grace Hopper" }));
		await w.see(page.getByText("Fix the French menu"), "the filter hides the person's card");
		await w.click(page.getByRole("combobox", { name: "Assignee" }));
		await w.click(page.getByRole("option", { name: "All assignees" }));
	});

	await w.step("Assign a ticket", "the card, then the person with free days", async () => {
		await w.click(page.getByRole("button", { name: /Bump dependencies/ }));
		await w.click(
			page
				.getByRole("navigation", { name: "Sections" })
				.getByRole("button", { name: "Brief", exact: true }),
		);
		const held = page.getByRole("main").getByText("Grace Hopper");
		const before = await held.count();
		await w.click(page.getByRole("combobox", { name: "Assignee" }).last());
		await w.see(page.getByText("4 d free"), "no free-time hint beside the person");
		await w.click(page.getByRole("option", { name: /^Grace Hopper/ }));
		await w.until(() => held.count(), before + 1, "the card does not show the new assignee");
		const marked = page.getByRole("combobox", { name: "Assignee" }).last();
		if (!(await marked.textContent())?.includes("Grace Hopper")) {
			w.confusing("the assign list shows no mark on the person who holds the ticket");
		}
	});

	await w.step(
		"Mark the ticket for the agent",
		"the Mark for agent button in the Brief",
		async () => {
			await w.click(page.getByRole("button", { name: "Mark for agent" }));
			await w.see(page.getByText("shipyard").first(), "no agent label on the ticket");
		},
	);

	await w.step("Read the plan", "the Plan tab and its warnings", async () => {
		await w.go("Plan", "Plan");
		await w.see(page.getByText("over capacity").first(), "no capacity warning");
		await w.click(page.getByRole("link", { name: /over capacity/ }));
		await w.until(
			() => page.url().includes("/crew/team"),
			true,
			"a capacity warning does not open the member in Crew / Team",
		);
		await w.see(page.getByLabel(/Capacity/).first(), "the member does not open with its capacity");
	});

	await w.step("Read the estimate", "the Summary tab: days, cost, price", async () => {
		await w.go("Plan", "Estimates");
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
			await w.go("Plan", "Time");
			await w.click(page.getByRole("button", { name: "Send 2026-11-03 ACME-1" }));
			await w.see(page.getByText("To send (1)"), "the sent entry stays in the To send list");
		},
	);

	await w.step("Look at the team load", "the Team tab: who is free", async () => {
		await w.go("Crew", "Team");
		await w.see(page.getByText("Ada Lovelace"), "no team member");
		if (!(await page.getByRole("columnheader").count())) {
			w.confusing("the team shows no column headers for load or capacity");
		}
	});

	await w.step("Find the list with the keyboard", "Ctrl+K, the name of a page", async () => {
		await w.palette("List", "the palette finds no page by its name (List)");
		await w.see(
			page
				.getByRole("navigation", { name: "Tabs" })
				.locator("[aria-current=page]", { hasText: "List" }),
			"Enter does not open the page",
		);
	});

	await w.step("Check the budget", "the Usage page, the money figures", async () => {
		await w.go("Crew", "Usage");
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
			await w.go("Today", "Today");
			await w.see(
				page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
				"no inbox",
			);
			// The plan review waits in the queue: a click makes it the card.
			await w.click(page.getByRole("button", { name: /^feature Write the onboarding guide/ }));
			await w.click(page.getByRole("button", { name: "Approve plan" }));
			await w.see(
				page.getByRole("heading", { level: 1, name: "10 things need you" }),
				"the inbox does not answer the click",
			);
		},
		true,
	);
});
