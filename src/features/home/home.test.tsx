import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const SPEC = "docs/openspec/changes/add-export/specs/export/spec.md";

/** Today shows one thing on its card; `pick` makes a thing of the queue the card. */
async function renderNeedsYou() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp("/today/today");
}
async function pick(user: ReturnType<typeof userEvent.setup>, text: RegExp) {
	const queue = within(await screen.findByRole("list", { name: "Needs you" }));
	// The queue shows three things: "N more" shows the rest in place.
	if (!queue.queryByRole("button", { name: text }))
		await user.click(queue.getByRole("button", { name: /^\d+ more$/ }));
	await user.click(queue.getByRole("button", { name: text }));
}
/** The card of Today: the first article, since a row inside it can be an article too. */
const card = async () => within((await screen.findAllByRole("article"))[0] as HTMLElement);
const run = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

describe("Home / Today, Needs you", () => {
	it("counts what waits in the title, in one list, and shows who asks, the feature and the question on the card", async () => {
		await renderNeedsYou();
		const [questions, approvals, plans, messages] = await Promise.all([
			unwrap(commands.questionsList()),
			unwrap(commands.approvalsList()),
			unwrap(commands.runsList()).then((r) => r.filter((x) => x.state === "PlanReview")),
			unwrap(commands.messagesList()),
		]);
		// The approvals of one run are one question: each run counts once.
		const total =
			questions.filter((q) => q.question.state === "open" || q.question.spec).length +
			new Set(approvals.map((a) => a.run)).size +
			plans.length +
			messages.length;
		expect(
			await screen.findByRole("heading", { level: 1, name: `${total} things need you` }),
		).toBeInTheDocument();
		const waiting = await run("ACME-1");
		const on = await card();
		// The feature name opens the run. The card shows no raw id.
		expect(await on.findByRole("button", { name: waiting.title })).toBeInTheDocument();
		expect(on.queryByText(waiting.workflow)).toBeNull();
		expect(
			on.getByRole("heading", {
				level: 2,
				name: "Where should the user land after the session expires?",
			}),
		).toBeInTheDocument();
		expect(on.queryByText(/Q-101|run:/)).toBeNull();
	});

	it("answers an open question with a digit and Enter, and the question leaves the queue", async () => {
		const user = userEvent.setup();
		// Q-103 is the decision about a screen that Design shows: Q-101 stays the last question.
		const design = mockState().factory.questions.find((x) => x.q.id === "Q-103");
		if (design) design.q.state = "answered";
		await renderNeedsYou();
		const on = await card();
		await user.click(await on.findByRole("button", { name: "The home page" }));
		await user.keyboard("{Enter}");
		// The answered question leaves the card and the count.
		await waitFor(() =>
			expect(
				screen.queryByRole("heading", { level: 2, name: /Where should the user land/ }),
			).toBeNull(),
		);
		const q = mockState().factory.questions.find((x) => x.q.id === "Q-101")?.q;
		expect(q?.answer?.choice).toEqual({ kind: "option", n: 2 });
	});

	it("approves a write with one click", async () => {
		const user = userEvent.setup();
		await renderNeedsYou();
		const before = (await unwrap(commands.approvalsList())).length;
		const heading = await screen.findByRole("heading", { level: 1, name: /things need you$/ });
		const count = Number(/^(\d+)/.exec(heading.textContent ?? "")?.[1]);
		await pick(user, /Post a comment on ACME-1/);
		const on = await card();
		expect(
			await on.findByRole("heading", { level: 2, name: "Post a comment on ACME-1" }),
		).toBeVisible();
		await user.click(on.getByRole("button", { name: "Approve" }));
		await waitFor(async () =>
			expect((await unwrap(commands.approvalsList())).length).toBe(before - 1),
		);
		// The title count drops by one and the approved write leaves the card.
		expect(
			await screen.findByRole("heading", { level: 1, name: `${count - 1} things need you` }),
		).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByText("Post a comment on ACME-1")).toBeNull());
	});

	it("names a force push in plain words, in the danger colour, with the command hidden", async () => {
		const user = userEvent.setup();
		await renderNeedsYou();
		await pick(user, /Replace the code of ACME-10 on the server/);
		const bar = await screen.findByRole("region", {
			name: "Replace the code of ACME-10 on the server",
		});
		expect(within(bar).getByRole("button", { name: "Approve" }).className).toContain("bg-danger");
		const command = within(bar).getByText("git push --force-with-lease origin fix/ACME-10");
		expect(command.closest("details")).not.toHaveAttribute("open");
	});

	it("shows the start of the plan on the plan row, with an Open plan action", async () => {
		const user = userEvent.setup();
		await renderNeedsYou();
		await pick(user, new RegExp(`Review the plan ${(await run("ACME-4")).title}`));
		expect(await screen.findByText(/Add the export button\./)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open plan" })).toBeInTheDocument();
	});

	it("approves a plan, and the run goes on", async () => {
		const user = userEvent.setup();
		await renderNeedsYou();
		await pick(user, new RegExp(`Review the plan ${(await run("ACME-4")).title}`));
		await user.click(await screen.findByRole("button", { name: "Approve plan" }));
		await waitFor(async () => expect((await run("ACME-4")).state).toBe("Working"));
	});

	it("marks a message read", async () => {
		const user = userEvent.setup();
		await renderNeedsYou();
		const before = (await unwrap(commands.messagesList())).filter((m) => !m.read).length;
		await pick(user, /Blocked: the French catalog/);
		await user.click(await screen.findByRole("button", { name: "Mark read" }));
		await waitFor(async () =>
			expect((await unwrap(commands.messagesList())).filter((m) => !m.read).length).toBe(
				before - 1,
			),
		);
	});

	it("previews the fold of an answered spec question and folds on a click", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.runsList());
		const item = mockState().factory.questions.find((x) => x.q.id === "Q-101");
		if (!item) throw new Error("no Q-101");
		Object.assign(item.q, {
			id: "Q-035",
			spec: "spec:export#REQ-001",
			state: "answered",
			answer: { choice: { kind: "option", n: 1 }, source: { kind: "inbox" }, text: "" },
		});
		mountApp("/today/today");
		await pick(user, /Where should the user land/).catch(() => {});
		const preview = await screen.findByRole("group", { name: "Preview" }, { timeout: 5000 });
		expect(preview).toHaveTextContent("NEEDS CLARIFICATION: Q-035");
		await waitFor(() => expect(screen.getByRole("button", { name: "Fold" })).toBeEnabled());
		await user.click(screen.getByRole("button", { name: "Fold" }));
		await waitFor(() =>
			expect(mockState().specs.files[SPEC]?.text).toContain("### Clarifications"),
		);
	});

	it("shows one action without a project", async () => {
		mountApp("/home/today");
		await userEvent.setup().click(await screen.findByRole("button", { name: "Continue" }));
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
	});
});
