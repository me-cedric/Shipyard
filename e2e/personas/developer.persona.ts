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
		await w.click(page.getByRole("button", { name: "More", exact: true }));
		// The switch of the agents is in More.
		await w.see(
			page.getByRole("menuitemcheckbox", { name: "Agents on" }),
			"no switch to stop the agents",
		);
		await w.key("Escape");
	});

	await w.step("Open a run", "the run card, the steps graph, the cost", async () => {
		await w.click(page.getByRole("button", { name: /^Add export endpoint ACME-2/ }));
		await w.see(page.getByRole("button", { name: "More", exact: true }), "no way to stop the run");
		await w.see(page.getByRole("progressbar", { name: "Cost" }), "no cost on the run");
		await w.click(
			page
				.getByRole("main")
				.getByRole("link", { name: /^(Back|Flow)$/ })
				.first(),
		);
	});

	await w.step(
		"Start a run from a ticket",
		"New, the Find a ticket field, then Start an agent",
		async () => {
			await w.click(page.getByRole("button", { name: "New", exact: true }));
			// A ticket that has a run is not in the list: the demo project has a run on each ticket.
			await w.until(
				() => page.locator('datalist option[label="ACME-3"]').count(),
				0,
				"the list offers a ticket that already has a run",
			);
			await w.fill(page.getByRole("combobox", { name: "Find a ticket" }), "ACME-3");
			await w.click(page.getByRole("button", { name: "Start an agent", exact: true }));
			await w.see(
				page.getByRole("alert").getByRole("button", { name: "Open the run" }),
				"the refusal has no link to the run",
			);
			await w.click(page.getByRole("button", { name: "Open the run" }));
			await w.see(
				page
					.getByRole("region", { name: /^ACME-\d+$/ })
					.getByRole("button", { name: "More", exact: true }),
				"the link does not open the run",
			);
			await w.click(
				page
					.getByRole("main")
					.getByRole("link", { name: /^(Back|Flow)$/ })
					.first(),
			);
		},
	);

	await w.step("Answer an agent question", "Home, the Agent questions list, Send", async () => {
		await w.go("Today", "Needs you");
		await w.see(
			page.getByText("Where should the user land after the session expires?"),
			"no question",
		);
		await w.click(page.getByRole("button", { name: "Send" }).first());
		// The answered question leaves Needs you.
		await w.until(
			() => page.getByText("Where should the user land after the session expires?").count(),
			0,
			"the question stays in Needs you after Send",
		);
	});

	await w.step("Approve what the agent asks", "Approvals, Approve", async () => {
		// The approvals of one run are one question: the main button sends them all.
		// The approval waits in the queue: a click makes it the card.
		// The queue shows three things: "N more" shows the rest in place.
		const queue = page.getByRole("list", { name: "Needs you" });
		const more = queue.getByRole("button", { name: /^\d+ more$/ });
		if ((await more.count()) > 0) await w.click(more);
		await w.click(queue.getByRole("button", { name: /Add export endpoint/ }));
		const effect = page.getByText(/Move ACME-2 to In Progress/);
		await w.see(effect, "no approval of the agent on the card");
		await w.click(page.getByRole("button", { name: /^Approve( all)?$/ }));
		await w.until(() => effect.count(), 0, "the approval stays in the list after Approve");
	});

	await w.step(
		"Stage and commit my changes",
		"Code, Now, more files, Solve it myself, Choose all, the message, Commit",
		async () => {
			await w.go("Code", "Now");
			await w.click(page.getByRole("link", { name: /\d+ more files?/ }));
			// The demo copy has a file in conflict: a commit waits for it. Take ours.
			await w.click(page.getByRole("button", { name: "Solve it myself" }));
			await w.click(page.getByRole("button", { name: "Keep my version" }));
			await w.until(
				() => page.getByRole("region", { name: /conflict/ }).count(),
				0,
				"the conflict stays",
			);
			await w.click(page.getByRole("button", { name: "Choose all" }));
			// The page of the changes holds the form: a message, then Commit. A conflict file stays out.
			const form = page.getByRole("form", { name: "Commit" });
			await w.fill(
				form.getByRole("textbox", { name: "Commit message" }),
				"fix(auth): refuse an empty token",
			);
			await w.click(form.getByRole("button", { name: /^Commit \d+ files?$/ }));
			await w.until(() => form.getByRole("alert").count(), 0, "the commit shows an error");
			await w.until(
				() => page.getByRole("heading", { name: /^\d+ files? to commit$/ }).count(),
				1,
				"the files to commit do not show after the commit",
			);
		},
	);

	await w.step("Review a pull request", "the pull request row, Approve", async () => {
		await w.go("Code", "Now");
		await w.click(page.getByRole("link", { name: /^Rework the settings page/ }));
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
		await w.click(page.getByRole("button", { name: "Open Tests" }));
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
