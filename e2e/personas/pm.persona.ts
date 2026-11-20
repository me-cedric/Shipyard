import { test } from "@playwright/test";
import { Walk } from "./walk";

// Project manager, first hour: the board, assign, hand to the agent, plan, estimate, agent estimate, time, crew, approvals, budget.
test("project manager", async ({ page }) => {
	const w = new Walk(page, { key: "pm", label: "Project manager" });
	await w.start();

	await w.step(
		"Land on the plan, open the board",
		"the page that opens first: Plan, Timeline, then Flow, Flow",
		async () => {
			await w.landsOn("Plan", "Timeline");
			await w.go("Flow", "Flow");
			await w.see(page.getByText("Bump dependencies"), "no card on the board");
		},
	);

	await w.step("Filter the board by person", "the Owner pill", async () => {
		await w.go("Flow", "List");
		await w.click(page.getByRole("button", { name: "Owner: all" }));
		await w.click(page.getByRole("menuitemradio", { name: "Grace Hopper" }));
		await page.keyboard.press("Escape");
		await w.see(page.getByText("Fix the French menu"), "the filter hides the person's card");
		await w.click(page.getByRole("button", { name: "Owner: Grace Hopper" }));
		await w.click(page.getByRole("menuitemradio", { name: "All assignees" }));
		await page.keyboard.press("Escape");
	});

	await w.step(
		"Assign a ticket",
		"the row menu, Edit the ticket, then the person with free days",
		async () => {
			await page
				.getByRole("button", { name: /Bump dependencies/ })
				.first()
				.click({ button: "right" });
			await w.click(page.getByRole("menuitem", { name: "Edit the ticket" }));
			const held = page.getByRole("main").getByText("Grace Hopper");
			// Count when the fields of the ticket are on the page: a late field adds names of its own.
			await w.see(page.getByRole("combobox", { name: "Assignee" }).last(), "no assignee field");
			const before = await held.count();
			await w.click(page.getByRole("combobox", { name: "Assignee" }).last());
			await w.see(page.getByText("4 d free"), "no free-time hint beside the person");
			await w.click(page.getByRole("option", { name: /^Grace Hopper/ }));
			await w.until(() => held.count(), before + 1, "the card does not show the new assignee");
			const marked = page.getByRole("combobox", { name: "Assignee" }).last();
			if (!(await marked.textContent())?.includes("Grace Hopper")) {
				w.confusing("the assign list shows no mark on the person who holds the ticket");
			}
		},
	);

	await w.step(
		"Mark the ticket for the agent",
		"the Mark for agent button on the ticket page",
		async () => {
			await w.click(page.getByRole("button", { name: "Mark for agent" }));
			await w.see(page.getByText("shipyard").first(), "no agent label on the ticket");
		},
	);

	await w.step("Read the plan", "Plan, Timeline: the end date and the capacity card", async () => {
		await w.go("Plan", "Timeline");
		await w.see(
			page.getByRole("heading", { level: 1, name: / ends / }),
			"the title of the plan does not say when the release ends",
		);
		await w.see(page.getByText("too much work").first(), "no capacity warning");
		await w.click(page.getByRole("link", { name: "Show", exact: true }));
		// The proposals are on People (the capacity card has "Show" and "Rebalance").
		await w.see(
			page.getByRole("button", { name: /^Apply: / }),
			"People proposes no change for the people who are over",
		);
		await w.see(
			page.getByRole("link", { name: /over capacity/ }),
			"People names no person over capacity",
		);
		await w.click(page.getByRole("link", { name: /over capacity/ }).first());
		await w.until(
			() => page.url().includes("/crew/crew"),
			true,
			"a capacity warning does not open the member in Crew",
		);
		await w.see(
			page.getByRole("button", { name: "Days in a week, less" }),
			"the member does not open with its capacity",
		);
	});

	await w.step(
		"Read the estimate",
		"the Summary view for days, the Costing view: cost, price",
		async () => {
			await w.go("Plan", "Estimates");
			await w.click(page.getByRole("button", { name: "Summary", exact: true }));
			await w.see(
				page.getByRole("heading", { name: "Summary", exact: true }),
				"no summary of days",
			);
			await w.click(page.getByRole("button", { name: "Costing", exact: true }));
			await w.see(page.getByText("Price", { exact: true }), "no price figure");
			if (await page.getByText("€0").first().isVisible()) {
				w.confusing(
					"cost and price read €0; the only hint (Unrated) is small text at the foot of the page, and Crew already holds day rates",
				);
			}
		},
	);

	await w.step(
		"Ask an agent to estimate",
		"the Tasks view: Ask an agent to estimate opens the selection, select a task, Ask again, Accept",
		async () => {
			await w.click(page.getByRole("button", { name: "Tasks", exact: true }));
			await w.click(page.getByRole("button", { name: "Ask an agent to estimate" }));
			await w.click(page.getByRole("checkbox", { name: "Select Export endpoint" }));
			await w.click(page.getByRole("button", { name: "Ask an agent to estimate" }));
			const row = page
				.getByRole("region", { name: "Proposals of the agent" })
				.getByRole("listitem", { name: "Export endpoint" });
			await w.see(row, "the agent proposes no estimate");
			await w.click(row.getByRole("button", { name: "Accept" }));
			await w.until(() => row.count(), 0, "an accepted proposal stays in the list");
			await w.see(
				page.getByRole("group", { name: "Export endpoint", exact: true }).getByText("7"),
				"the accepted values are not in the sheet",
			);
		},
	);

	await w.step(
		"Send the time to the issue tracker",
		"the To send list, the Send button",
		async () => {
			await w.go("Plan", "Time");
			await w.click(page.getByRole("link", { name: "Send the hours to the issue tracker" }));
			await w.click(page.getByRole("button", { name: "Send 2026-11-03 ACME-1" }));
			await w.see(page.getByText("To send (1)"), "the sent entry stays in the To send list");
		},
	);

	await w.step("Look at the team load", "Crew: who is free, and which agent works", async () => {
		await w.go("Crew", "Crew");
		const people = page.getByRole("list", { name: "People" });
		await w.see(people.getByText("Ada Lovelace"), "no team member");
		if (!(await people.getByText(/Has room|Over by \d+ days/).count())) {
			w.confusing("the people cards show no load or capacity");
		}
		await w.see(
			page.getByRole("list", { name: "Agents" }).getByRole("link").first(),
			"no agent beside the people",
		);
		// Live is an item of the More menu of Crew.
		await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
		await w.click(page.getByRole("menuitem", { name: "Live", exact: true }));
		await w.see(
			page.getByRole("table", { name: "Agents at work" }).locator("tbody tr"),
			"the live view shows no agent at work",
		);
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

	await w.step("Check the budget", "Crew, Spend: the money figures", async () => {
		await w.go("Crew", "Spend");
		await w.see(page.getByText(/reached its limit/).first(), "no budget warning");
		if (await page.getByText("Hidden").first().isVisible()) {
			// "Show prices" is an item of the More menu.
			await w.click(page.getByRole("main").getByRole("button", { name: "More", exact: true }));
			await w.click(page.getByRole("menuitem", { name: "Show prices" }));
		}
		await w.see(page.getByText(/\$\d/).first(), "the money figures stay hidden");
	});

	await w.step(
		"Answer what needs me",
		"Home, the Needs you list",
		async () => {
			await w.go("Today", "Needs you");
			await w.see(
				page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
				"no inbox",
			);
			// The plan review waits in the queue: a click makes it the card.
			// The queue shows three things: "N more" shows the rest in place.
			const more = page.getByRole("button", { name: /^\d+ more$/ });
			if ((await more.count()) > 0) await w.click(more);
			await w.click(
				page.getByRole("button", { name: /^feature Review the plan Write the onboarding guide/ }),
			);
			await w.click(page.getByRole("button", { name: "Approve plan" }));
			await w.see(
				page.getByRole("heading", { level: 1, name: "9 things need you" }),
				"the inbox does not answer the click",
			);
		},
		true,
	);
});
