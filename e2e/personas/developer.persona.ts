import { test } from "@playwright/test";
import { Walk } from "./walk";

// Developer, first hour: the runs, answer an agent, approve, commit, review a pull request, checks, a new run.
test("developer", async ({ page }) => {
	const w = new Walk(page, { key: "developer", label: "Developer" });
	await w.start();

	await w.step("Land on the runs", "the page that opens first: Factory, Runs", async () => {
		await w.landsOn("Factory", "Runs");
		await w.see(page.getByText("Needs you").first(), "no list of runs that need me");
		await w.see(page.getByRole("switch", { name: "Agents on" }), "no switch to stop the agents");
	});

	await w.step("Open a run", "the run card, the steps graph, the cost", async () => {
		await w.click(page.getByText("Add export endpoint"));
		await w.see(page.getByRole("button", { name: "Kill run" }), "no way to stop the run");
		await w.see(page.getByText("Cost"), "no cost on the run");
		await w.click(page.getByRole("button", { name: "Back" }));
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
		await w.see(page.getByRole("button", { name: "Kill run" }), "the link does not open the run");
		await w.click(page.getByRole("button", { name: "Back" }));
	});

	await w.step("Answer an agent question", "Home, the Agent questions list, Send", async () => {
		await w.go("Home", "Inbox");
		await w.see(
			page.getByText("Where should the user land after the session expires?"),
			"no question",
		);
		await w.click(page.getByRole("button", { name: "Send" }).first());
		await w.until(
			() => page.getByText("Answered").count(),
			3,
			"the question does not turn to Answered after Send",
		);
	});

	await w.step("Approve what the agent asks", "Approvals, Approve", async () => {
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		const before = await approve.count();
		await w.click(approve);
		await w.until(
			() => approve.count(),
			before - 1,
			"the approval stays in the list after Approve",
		);
	});

	await w.step("Stage and commit my changes", "Code, Local changes, Stage, Commit", async () => {
		await w.go("Code", "Local changes");
		await w.click(page.getByRole("button", { name: "Stage (4)" }));
		await w.click(page.getByRole("button", { name: "Commit" }).last());
		await w.fill(page.getByRole("dialog").getByRole("textbox"), "fix(auth): refuse an empty token");
		await w.click(page.getByRole("dialog").getByRole("button", { name: "Commit" }));
		await w.until(() => page.getByRole("dialog").count(), 0, "the commit dialog stays open");
	});

	await w.step("Review a pull request", "the pull request row, Approve", async () => {
		await w.go("Code", "Pull requests");
		await w.click(page.getByRole("button", { name: /#44 Rework the settings page/ }));
		await w.see(page.getByRole("button", { name: "Request changes" }), "no review controls");
		await w.click(page.getByRole("button", { name: "Approve", exact: true }));
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
				page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Quality" }),
				"the shortcut does not open Code",
			);
		},
	);

	await w.step("Run the checks", "Code, Quality, Run Tests", async () => {
		await w.go("Code", "Quality");
		await w.click(page.getByRole("button", { name: "Run Tests" }));
		await w.see(
			page.getByText(/passed|failed|Pass|Fail/i).first(),
			"no result after the check ran",
		);
	});

	await w.step(
		"Open the terminal",
		"Code, Terminal",
		async () => {
			await w.go("Code", "Terminal");
			await w.see(page.getByRole("main"), "no terminal page");
		},
		true,
	);
});
