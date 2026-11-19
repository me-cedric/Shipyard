import { test } from "@playwright/test";
import { Walk } from "./walk";

// Developer, first hour: the runs, answer an agent, approve, commit, review a pull request, checks, a new run.
test("developer", async ({ page }) => {
	const w = new Walk(page, { key: "developer", label: "Developer" });
	await w.start();

	await w.step("Land on the runs", "the page that opens first: Flow, Flow", async () => {
		await w.landsOn("Flow", "Flow");
		await w.see(
			page.getByRole("button", { name: "Needs me", exact: true }),
			"no filter for the runs that need me",
		);
		await w.see(page.getByRole("switch", { name: "Agents on" }), "no switch to stop the agents");
	});

	await w.step("Open a run", "the run card, the steps graph, the cost", async () => {
		await w.click(page.getByRole("button", { name: /Open Add export endpoint/ }));
		await w.see(page.getByRole("button", { name: "More actions" }), "no way to stop the run");
		await w.see(page.getByRole("group", { name: "Cost" }), "no cost on the run");
		await w.click(
			page
				.getByRole("main")
				.getByRole("link", { name: /^(Back|Flow)$/ })
				.first(),
		);
	});

	await w.step("Start a run from a ticket", "the Ticket field, then Start run", async () => {
		// A ticket that has a run is not in the list: the demo project has a run on each ticket.
		await w.until(
			() => page.locator('datalist option[label="ACME-3"]').count(),
			0,
			"the list offers a ticket that already has a run",
		);
		await w.fill(page.getByRole("combobox", { name: "Ticket" }), "ACME-3");
		await w.click(page.getByRole("button", { name: "Start run" }));
		await w.see(
			page.getByRole("alert").getByRole("button", { name: "Open the run" }),
			"the refusal has no link to the run",
		);
		await w.click(page.getByRole("button", { name: "Open the run" }));
		await w.see(
			page
				.getByRole("region", { name: /^ACME-\d+$/ })
				.getByRole("button", { name: "More actions" }),
			"the link does not open the run",
		);
		await w.click(
			page
				.getByRole("main")
				.getByRole("link", { name: /^(Back|Flow)$/ })
				.first(),
		);
	});

	await w.step("Answer an agent question", "Home, the Agent questions list, Send", async () => {
		await w.go("Today", "Today");
		await w.see(
			page.getByText("Where should the user land after the session expires?"),
			"no question",
		);
		await w.click(page.getByRole("button", { name: "Send" }).first());
		// Today shows one thing at a time: the answered question stays on the card.
		await w.see(
			page.getByText("Answered").first(),
			"the question does not turn to Answered after Send",
		);
	});

	await w.step("Approve what the agent asks", "Approvals, Approve", async () => {
		// The approvals of one run are one question: the main button sends them all.
		// The approval waits in the queue: a click makes it the card.
		// The queue shows three things: "N more" shows the rest in place.
		const queue = page.getByRole("list", { name: "Needs you" });
		const more = queue.getByRole("button", { name: /^\d+ more$/ });
		if ((await more.count()) > 0) await w.click(more);
		await w.click(queue.getByRole("button", { name: /ACME-2 Add export endpoint/ }));
		const effect = page.getByText(/Change the status of ACME-2/);
		await w.see(effect, "no approval of the agent on the card");
		await w.click(page.getByRole("button", { name: /^Approve( all)?$/ }));
		await w.until(() => effect.count(), 0, "the approval stays in the list after Approve");
	});

	await w.step(
		"Stage and commit my changes",
		"Code, Now, Stage, the sync mark, Commit",
		async () => {
			await w.go("Code", "Now");
			await w.click(page.getByRole("button", { name: "Stage (4)" }));
			// Commit of the old status bar is in the card of the sync mark.
			await w.click(page.getByRole("banner").getByRole("button", { name: /^Sync state/ }));
			await w.click(
				page.getByRole("dialog", { name: "Sync state" }).getByRole("button", { name: "Commit" }),
			);
			const dialog = page.getByRole("dialog", { name: "Commit" });
			await w.fill(dialog.getByRole("textbox"), "fix(auth): refuse an empty token");
			await w.click(dialog.getByRole("button", { name: "Commit" }));
			await w.until(() => page.getByRole("dialog").count(), 0, "the commit dialog stays open");
		},
	);

	await w.step("Review a pull request", "the pull request row, Approve", async () => {
		await w.go("Code", "Now");
		await w.click(page.getByRole("link", { name: /#44 Rework the settings page/ }));
		await w.click(
			page
				.getByRole("navigation", { name: "Sections" })
				.getByRole("button", { name: "Chat", exact: true }),
		);
		await w.click(page.getByRole("button", { name: "Submit review" }));
		const dialog = page.getByRole("dialog", { name: "Submit review" });
		await w.see(dialog.getByText("Request changes", { exact: true }), "no review verdicts");
		await w.click(dialog.getByText("Approve", { exact: true }));
		await w.click(dialog.getByRole("button", { name: "Submit review" }));
		await w.until(() => dialog.count(), 0, "the review dialog stays open");
	});

	await w.step("Find a ticket with the keyboard", "Ctrl+K, a ticket key", async () => {
		await w.palette("ACME-2", "the palette finds no ticket by its key");
	});

	await w.step(
		"Jump to Code with a shortcut",
		"the shortcut shown in the palette, Ctrl+6",
		async () => {
			await w.key("ControlOrMeta+6");
			await w.see(
				page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Branches" }),
				"the shortcut does not open Code",
			);
		},
	);

	await w.step("Run the checks", "Flow, Health, Run Tests", async () => {
		await w.go("Flow", "Health");
		await w.click(page.getByRole("button", { name: "Run Tests" }));
		await w.see(
			page.getByText(/passed|failed|Pass|Fail/i).first(),
			"no result after the check ran",
		);
	});

	await w.step(
		"Open the terminal",
		"the Ask bar, Terminal under Do",
		async () => {
			const ask = page.getByRole("combobox", { name: "Ask or tell Shipyard" });
			await w.click(ask);
			await w.fill(ask, "Terminal");
			await w.click(page.getByRole("option", { name: /^Terminal/ }));
			await w.see(page.getByRole("region", { name: "Terminal" }), "no terminal drawer");
		},
		true,
	);
});
