import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// The one question of the approvals (`spec:app-redesign#REQ-013`) and the card of a stopped run
// (`spec:app-redesign#REQ-014`) on the feature page.
async function runOf(key: string, state?: string) {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	const run = (await unwrap(commands.runsList())).find(
		(r) => r.key === key && (!state || r.state === state),
	);
	if (!run) throw new Error(`no run ${key}`);
	return run;
}
const needsOf = async (id: string) => {
	mountApp(`/factory/runs/${id}`);
	return within(await screen.findByRole("region", { name: "Needs you" }));
};
const OPEN_PR = "Open a pull request for ACME-2";
const MOVE = "Change the status of ACME-2";

afterEach(() => vi.restoreAllMocks());

const openHappened = async (user: ReturnType<typeof userEvent.setup>) => {
	// "What happened" is in the More menu of the page, next to the title.
	const title = await waitFor(() => {
		const h = document.querySelector("[data-run-title]");
		if (!h) throw new Error("no page title");
		return h;
	});
	const row = title.parentElement as HTMLElement;
	await user.click(within(row).getByRole("button", { name: "More" }));
	await user.click(await screen.findByRole("menuitem", { name: "What happened" }));
};

describe("One question for the approvals of one run (REQ-013)", () => {
	async function ready() {
		const run = await runOf("ACME-2");
		const ids = (await unwrap(commands.approvalsList()))
			.filter((a) => a.run === run.id)
			.map((a) => a.id);
		expect(ids).toHaveLength(2);
		return { run, ids };
	}

	it("Send for review: one question names the pull request and the ticket move, with no Reject yet", async () => {
		const { run } = await ready();
		const needs = await needsOf(run.id);
		const effects = within(await needs.findByRole("list", { name: "Approvals" }));
		expect(effects.getAllByRole("listitem").map((li) => li.textContent)).toEqual([MOVE, OPEN_PR]);
		expect(needs.getByRole("button", { name: "Send for review" })).toBeEnabled();
		expect(needs.queryByRole("button", { name: "Reject" })).toBeNull();
		expect(
			needs.getByRole("checkbox", { name: "Do not ask again for the feature recipe" }),
		).toHaveAttribute("aria-checked", "false");
	});

	it("sends one approval for each effect with the main button", async () => {
		const user = userEvent.setup();
		const { run, ids } = await ready();
		const approve = vi.spyOn(commands, "approvalApprove");
		const allow = vi.spyOn(commands, "approvalsAllowRecipe");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Send for review" }));
		await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
		expect(approve.mock.calls.map((c) => c[0]).sort()).toEqual([...ids].sort());
		expect(allow).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(mockState().factory.approvals.filter((a) => a.run === run.id)).toEqual([]),
		);
	});

	it("with the box ticked, sends one approvalsAllowRecipe with the two ids and stores the recipe", async () => {
		const user = userEvent.setup();
		const { run, ids } = await ready();
		const approve = vi.spyOn(commands, "approvalApprove");
		const allow = vi.spyOn(commands, "approvalsAllowRecipe");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("checkbox", { name: /Do not ask again/ }));
		await user.click(needs.getByRole("button", { name: "Send for review" }));
		await waitFor(() => expect(allow).toHaveBeenCalledTimes(1));
		expect([...(allow.mock.calls[0]?.[0] ?? [])].sort()).toEqual([...ids].sort());
		expect(approve).not.toHaveBeenCalled();
		await waitFor(() =>
			expect([...(mockState().sync.automation.recipe_writes?.feature ?? [])].sort()).toEqual([
				"open_pr",
				"transition",
			]),
		);
	});

	it("Each step approves one effect alone", async () => {
		const user = userEvent.setup();
		const { run, ids } = await ready();
		const approve = vi.spyOn(commands, "approvalApprove");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Each step" }));
		const bar = within(needs.getByRole("region", { name: OPEN_PR }));
		// The text that goes out stays readable here.
		expect(bar.getByText("Add export endpoint")).toBeVisible();
		await user.click(bar.getByRole("button", { name: "Approve" }));
		await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
		expect(ids).toContain(approve.mock.calls[0]?.[0]);
		await waitFor(() =>
			expect(mockState().factory.approvals.filter((a) => a.run === run.id)).toHaveLength(1),
		);
		expect(await needs.findByRole("list", { name: "Approvals" })).toHaveTextContent(MOVE);
	});

	it("Each step rejects one effect alone, and Reject is nowhere else", async () => {
		const user = userEvent.setup();
		const { run } = await ready();
		const reject = vi.spyOn(commands, "approvalReject");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Each step" }));
		await user.click(
			within(needs.getByRole("region", { name: MOVE })).getByRole("button", { name: "Reject" }),
		);
		await waitFor(() => expect(reject).toHaveBeenCalledTimes(1));
	});

	it("Not yet sends and rejects nothing, and the question folds", async () => {
		const user = userEvent.setup();
		const { run } = await ready();
		const approve = vi.spyOn(commands, "approvalApprove");
		const reject = vi.spyOn(commands, "approvalReject");
		const allow = vi.spyOn(commands, "approvalsAllowRecipe");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Not yet" }));
		expect(needs.queryByRole("list", { name: "Approvals" })).toBeNull();
		expect(approve).not.toHaveBeenCalled();
		expect(reject).not.toHaveBeenCalled();
		expect(allow).not.toHaveBeenCalled();
		await user.click(needs.getByRole("button", { name: "2 to approve" }));
		expect(needs.getByRole("list", { name: "Approvals" })).toBeVisible();
	});

	it("keeps a push with force out of the main button and of the durable permission", async () => {
		const user = userEvent.setup();
		const { run, ids } = await ready();
		const force = {
			id: 99,
			run: run.id,
			key: run.key,
			title: run.title,
			workflow: run.workflow,
			kind: "push",
			summary: "Force push fix/ACME-2 with lease",
			detail: "git push --force-with-lease origin fix/ACME-2",
			force: true,
			right: "code.write" as const,
		};
		mockState().factory.approvals.push(force);
		const approve = vi.spyOn(commands, "approvalApprove");
		const allow = vi.spyOn(commands, "approvalsAllowRecipe");
		const needs = await needsOf(run.id);
		const chip = await needs.findByText("Replace the code of ACME-2 on the server");
		expect(chip.className).toContain("danger");
		await user.click(needs.getByRole("checkbox", { name: /Do not ask again/ }));
		await user.click(needs.getByRole("button", { name: "Send for review" }));
		await waitFor(() => expect(allow).toHaveBeenCalledTimes(1));
		expect([...(allow.mock.calls[0]?.[0] ?? [])].sort()).toEqual([...ids].sort());
		expect(approve).not.toHaveBeenCalled();
		// The push still waits and needs its own click.
		expect(mockState().factory.approvals.map((a) => a.id)).toContain(99);
	});

	it("shows no box and no main button for a question that holds only a push with force", async () => {
		const { run } = await ready();
		mockState().factory.approvals = mockState().factory.approvals.filter(
			(a) => a.run !== run.id || a.kind === "push",
		);
		mockState().factory.approvals.push({
			id: 99,
			run: run.id,
			key: run.key,
			title: run.title,
			workflow: run.workflow,
			kind: "push",
			summary: "Force push",
			detail: "git push --force-with-lease origin x",
			force: true,
			right: "code.write",
		});
		const needs = await needsOf(run.id);
		await needs.findByRole("list", { name: "Approvals" });
		expect(needs.queryByRole("checkbox")).toBeNull();
		expect(needs.queryByRole("button", { name: /^Approve all$|^Approve$/ })).not.toBeNull();
		// The only Approve is the one of the effect itself, under Each step (open by itself).
		expect(needs.getAllByRole("button", { name: "Approve" })).toHaveLength(1);
		expect(needs.getByRole("button", { name: "Each step" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});

	it("says Approve, not Approve all, when a push with force is left out and one effect remains", async () => {
		const { run } = await ready();
		mockState().factory.approvals = mockState().factory.approvals.filter(
			(a) => a.run !== run.id || a.kind === "transition",
		);
		mockState().factory.approvals.push({
			id: 98,
			run: run.id,
			key: run.key,
			title: run.title,
			workflow: run.workflow,
			kind: "push",
			summary: "Force push",
			detail: "git push --force-with-lease origin x",
			force: true,
			right: "code.write",
		});
		const needs = await needsOf(run.id);
		await needs.findByRole("list", { name: "Approvals" });
		expect(needs.queryByRole("button", { name: "Approve all" })).toBeNull();
		expect(needs.getAllByRole("button", { name: "Approve" }).length).toBeGreaterThan(0);
	});

	it("turns the controls off, with the reason, for a person without the rights", async () => {
		const { run } = await ready();
		mockState().person = {
			member: "eve",
			found: "email",
			role: "pm",
			admin: false,
			readOnly: false,
			rights: ["costs.view"],
		};
		const needs = await needsOf(run.id);
		const main = await needs.findByRole("button", { name: "Send for review" });
		expect(main).toBeDisabled();
		expect(main).toHaveAccessibleDescription(/^Needs the right/);
		expect(needs.getByRole("checkbox", { name: /Do not ask again/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});

	it("shows the error and keeps the effect that still waits when one approval fails", async () => {
		const user = userEvent.setup();
		const { run } = await ready();
		const approve = vi.spyOn(commands, "approvalApprove");
		approve.mockResolvedValueOnce({
			status: "error",
			error: { code: "unknown", details: "the code host is down", action: null },
		});
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Send for review" }));
		await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
		expect(await needs.findByRole("alert")).toBeVisible();
		// The first call failed and the second went out: one effect still waits and still shows.
		expect(mockState().factory.approvals.filter((a) => a.run === run.id)).toHaveLength(1);
		await waitFor(() =>
			expect(needs.getByRole("list", { name: "Approvals" }).children).toHaveLength(1),
		);
	});
});

describe("One main action for a stopped run (REQ-014)", () => {
	const budgetNote = (key: string) => async () => {
		const run = await runOf(key);
		mockState()
			.factory.runs.find((r) => r.id === run.id)
			?.log.push({
				id: 9970,
				step: null,
				kind: "note",
				payload: JSON.stringify({ stop: "budget" }),
				ts: Date.now(),
			});
		return run;
	};

	it("Budget reached: the main action is Add budget, and the click resumes with the added budget", async () => {
		const user = userEvent.setup();
		const run = await budgetNote("ACME-6")();
		const resume = vi.spyOn(commands, "runResume");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		expect(card.getByText("Stopped at the limit")).toBeVisible();
		expect(card.getByRole("group", { name: "Budget to add (USD)" })).toHaveTextContent("$2");
		await user.click(card.getByRole("button", { name: "More budget" }));
		await user.click(card.getByRole("button", { name: "Add budget" }));
		await waitFor(() => expect(resume).toHaveBeenCalledWith(run.id, 3, 0, null));
	});

	it("Add budget adds the default 2 USD when the stepper is not used", async () => {
		const user = userEvent.setup();
		const run = await budgetNote("ACME-6")();
		const resume = vi.spyOn(commands, "runResume");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Add budget" }));
		await waitFor(() => expect(resume).toHaveBeenCalledWith(run.id, 2, 0, null));
	});

	it("Paused by a person: Resume, with Stop it", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-6");
		// The mock pauses ACME-6 at its budget: lift the budget so the pause is a person's.
		const rec = mockState().factory.runs.find((r) => r.id === run.id);
		if (rec) rec.budgetUsd = null;
		const resume = vi.spyOn(commands, "runResume");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		expect(card.getByText("Paused by a person")).toBeVisible();
		expect(card.getByRole("button", { name: "Stop it" })).toBeVisible();
		// The message to the agent is behind "What happened".
		await openHappened(user);
		await user.type(card.getByRole("textbox", { name: "Message to the agent" }), "go on");
		await user.click(card.getByRole("button", { name: "Resume" }));
		await waitFor(() => expect(resume).toHaveBeenCalledWith(run.id, 0, 0, "go on"));
	});

	it("Blocked: Unblock sends the note", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-9");
		const unblock = vi.spyOn(commands, "runUnblock");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		// The blocked agent speaks: its tile, "cannot go on", the cause as the heading, the answer field.
		expect(card.getByText("Fix cannot go on", { exact: true })).toBeVisible();
		// A ticket of an issue tracker shows the page of the ticket: the Comments card replies on it.
		const comments = (await screen.findByRole("heading", { name: "Comments" }))
			.parentElement as HTMLElement;
		expect(within(comments).getByRole("textbox", { name: "Comment" })).toBeVisible();
		await user.type(card.getByRole("textbox", { name: "Answer to Fix" }), "Keep both.{Enter}");
		await waitFor(() => expect(unblock).toHaveBeenCalledWith(run.id, "Keep both."));
	});

	it("Blocked, on the ticket page: Edit the text opens the field, and the Comments card sends one comment", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-9");
		const add = vi.spyOn(commands, "workTicketCommentAdd");
		await needsOf(run.id);
		await user.click(await screen.findByRole("button", { name: "Edit the text" }));
		expect(screen.getByRole("textbox", { name: "Description" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
		const box = await screen.findByRole("textbox", { name: "Comment" });
		await user.type(box, "Looks good");
		const form = box.closest("form");
		if (!form) throw new Error("the comment box has a form");
		await user.click(within(form).getByRole("button", { name: "Send" }));
		await waitFor(() => expect(add).toHaveBeenCalledWith("ACME-9", "Looks good", true));
		expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("");
	});

	it("Failed: Try again starts a new run, and What happened opens the details", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-11", "Failed");
		const start = vi.spyOn(commands, "runStart");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		expect(card.getByText("Failed")).toBeVisible();
		const what = card.getByRole("button", { name: "What happened" });
		expect(what).toHaveAttribute("aria-expanded", "false");
		await user.click(what);
		expect(what).toHaveAttribute("aria-expanded", "true");
		await user.click(card.getByRole("button", { name: "Try again" }));
		await waitFor(() => expect(start).toHaveBeenCalledWith("ACME-11"));
	});

	it("Waits for an answer: one Answer field with Reply on the card, the options in Choices, no approval button", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-1");
		// The demo question takes options only: a question with free text shows the Answer field.
		// The demo question takes options only and recommends one: this one takes free text and recommends none.
		for (const x of mockState().factory.questions)
			if (x.q.id === "Q-101") Object.assign(x.q, { free_text: true, recommended: 0 });
		const answer = vi.spyOn(commands, "questionAnswer");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		expect(card.getByText("Waits for an answer")).toBeVisible();
		// No option panel inside the card; the options are one menu.
		expect(card.queryAllByRole("radio")).toHaveLength(0);
		expect(card.getByRole("button", { name: "Choices" })).toBeVisible();
		// One decision at a time: the approval waits behind the question.
		expect(needs.queryByRole("button", { name: /to approve$/ })).toBeNull();
		const reply = card.getByRole("button", { name: "Reply" });
		expect(reply).toBeDisabled();
		// Choices opens a menu, and the focus lands on its first option.
		card.getByRole("button", { name: "Choices" }).focus();
		await user.keyboard("{Enter}");
		const first = (await screen.findAllByRole("menuitemcheckbox"))[0] as HTMLElement;
		await waitFor(() => expect(first).toHaveFocus());
		await user.keyboard("{Escape}");
		await user.type(card.getByRole("textbox", { name: "Answer" }), "Both.");
		await user.click(reply);
		await waitFor(() =>
			expect(answer).toHaveBeenCalledWith(run.id, expect.any(String), {
				kind: "text",
				text: "Both.",
			}),
		);
	});

	it("Waits for an answer: a choice of the menu picks the option and Reply sends it", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-1");
		const answer = vi.spyOn(commands, "questionAnswer");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		await user.click(card.getByRole("button", { name: "Choices" }));
		const items = await screen.findAllByRole("menuitemcheckbox");
		await user.click(items[1] as HTMLElement);
		// A pick sends nothing: the person checks it, then Reply sends it, as Send of the question card did.
		expect(answer).not.toHaveBeenCalled();
		await user.click(card.getByRole("button", { name: "Reply" }));
		await waitFor(() =>
			expect(answer).toHaveBeenCalledWith(run.id, expect.any(String), { kind: "option", n: 2 }),
		);
	});

	it("Waits for an answer: the recommended option is picked and marked, an unclear reply and an edit show", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-1");
		const q = mockState().factory.questions.find(
			(x) => x.run === run.id && x.q.state === "open",
		)?.q;
		if (!q) throw new Error("the demo run waits for an answer");
		q.recommended = 1;
		q.unclear = "maybe the export page?";
		q.edited = true;
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		expect(card.getByRole("note", { name: "Reply to decide" })).toHaveTextContent(
			"maybe the export page?",
		);
		expect(card.getByText("The reply changed")).toBeVisible();
		// The recommended option is picked at the start, so Reply is on with no typing.
		expect(card.getByRole("button", { name: "Reply" })).toBeEnabled();
		await user.click(card.getByRole("button", { name: "Choices" }));
		const first = (await screen.findAllByRole("menuitemcheckbox"))[0] as HTMLElement;
		expect(first).toHaveTextContent(`${q.options[0]} (Recommended)`);
		expect(first).toHaveAttribute("aria-checked", "true");
	});

	it("Waits for an answer: the typed answer stays when the answer fails", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-1");
		for (const x of mockState().factory.questions) if (x.run === run.id) x.q.free_text = true;
		vi.spyOn(commands, "questionAnswer").mockResolvedValue({
			status: "error",
			error: { code: "unknown", details: "the issue tracker is offline", action: null },
		});
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		const field = card.getByRole("textbox", { name: "Answer" });
		await user.type(field, "Both, please.");
		await user.click(card.getByRole("button", { name: "Reply" }));
		expect(await needs.findByRole("alert")).toBeVisible();
		expect(field).toHaveValue("Both, please.");
	});

	it("Finished outside Shipyard: Close as done, and Keep it open brings back Unblock", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-9");
		mockState()
			.factory.runs.find((r) => r.id === run.id)
			?.log.push({
				id: 9971,
				step: "pr",
				kind: "note",
				payload: JSON.stringify({
					blocked: "nothing to deliver: the run changed no file",
					cause: "nothing_to_deliver",
				}),
				ts: Date.now(),
			});
		const close = vi.spyOn(commands, "runCloseDone");
		const needs = await needsOf(run.id);
		const card = within(await needs.findByRole("article"));
		expect(card.getByText("Finished outside Shipyard")).toBeVisible();
		await user.click(card.getByRole("button", { name: "Keep it open" }));
		// The card changes to the blocked agent: Unblock comes back and Close as done goes.
		const blocked = within(await needs.findByRole("article"));
		expect(blocked.getByRole("button", { name: "Unblock" })).toBeVisible();
		expect(blocked.queryByRole("button", { name: "Close as done" })).toBeNull();
		expect(close).not.toHaveBeenCalled();
	});

	it("Finished outside Shipyard: Close as done calls the command", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-9");
		mockState()
			.factory.runs.find((r) => r.id === run.id)
			?.log.push({
				id: 9972,
				step: "pr",
				kind: "note",
				payload: JSON.stringify({
					blocked: "nothing to deliver: the run changed no file",
					cause: "nothing_to_deliver",
				}),
				ts: Date.now(),
			});
		const close = vi.spyOn(commands, "runCloseDone");
		const needs = await needsOf(run.id);
		await user.click(await needs.findByRole("button", { name: "Close as done" }));
		await waitFor(() => expect(close).toHaveBeenCalledWith(run.id));
	});
	it("Finished outside Shipyard: a pull request closed on the code host gives Close as done alone", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const f = mockState().factory;
		const rec = f.runs.find((r) => r.state === "PROpen" && r.pr !== null);
		if (!rec) throw new Error("the demo has a run with an open pull request");
		const pull = f.pulls.find((p) => p.number === rec.pr);
		if (!pull) throw new Error("the run has its pull request");
		pull.state = "closed";
		const close = vi.spyOn(commands, "runCloseDone");
		const needs = await needsOf(rec.id);
		const card = within(await needs.findByRole("article"));
		expect(card.queryByRole("button", { name: "Keep it open" })).toBeNull();
		await user.click(card.getByRole("button", { name: "Close as done" }));
		await waitFor(() => expect(close).toHaveBeenCalledWith(rec.id));
		await waitFor(() => expect(f.runs.find((r) => r.id === rec.id)?.state).toBe("Cancelled"));
	});
});

describe("The plan in review (picture 024)", () => {
	it("a pencil on a step starts the note of the change for that step, and the card shows no summary line", async () => {
		const user = userEvent.setup();
		const run = await runOf("ACME-4");
		const needs = await needsOf(run.id);
		const note = await needs.findByRole("textbox", { name: "What to change" });
		await user.click(needs.getByRole("button", { name: "Change step 2" }));
		expect(note).toHaveValue("2: ");
		expect(note).toHaveFocus();
		// The summary is read by a screen reader only.
		expect(needs.getByText(/Add the export button\./).closest(".sr-only")).not.toBeNull();
	});
});
