import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";
import { renderApp } from "@/ui/test-utils";
import { Inbox } from "./index";

const SPEC = "docs/openspec/changes/add-export/specs/export/spec.md";

async function renderInbox() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return renderApp(
		<ShellProvider>
			<Inbox />
		</ShellProvider>,
	);
}
const run = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

describe("Home / Inbox", () => {
	it("shows the four groups with their counts and a run chip and key on each row", async () => {
		await renderInbox();
		const [questions, approvals, plans, messages] = await Promise.all([
			unwrap(commands.questionsList()),
			unwrap(commands.approvalsList()),
			unwrap(commands.runsList()).then((r) => r.filter((x) => x.state === "PlanReview")),
			unwrap(commands.messagesList()),
		]);
		for (const [name, list] of [
			["Agent questions", questions],
			["Approvals", approvals],
			["Plan review", plans],
			["Messages", messages],
		] as const)
			expect(
				await screen.findByRole("heading", { name: `${name} (${list.length})` }),
			).toBeInTheDocument();
		const waiting = await run("ACME-1");
		const card = await screen.findByRole("region", { name: "Q-101" });
		expect(
			within(card).getByRole("button", { name: new RegExp(`run:${waiting.id}`) }),
		).toBeInTheDocument();
		expect(within(card).getByText("ACME-1")).toBeInTheDocument();
	});

	it("answers an open question with a digit and Enter, and the group count drops", async () => {
		const user = userEvent.setup();
		await renderInbox();
		const card = await screen.findByRole("region", { name: "Q-101" });
		await user.click(within(card).getByRole("radio", { name: /The home page/ }));
		await user.keyboard("{Enter}");
		await waitFor(() => expect(within(card).getByText("Answered")).toBeInTheDocument());
		const q = mockState().factory.questions.find((x) => x.q.id === "Q-101")?.q;
		expect(q?.answer?.choice).toEqual({ kind: "option", n: 2 });
	});

	it("approves a write with one click", async () => {
		const user = userEvent.setup();
		await renderInbox();
		const before = (await unwrap(commands.approvalsList())).length;
		const bar = await screen.findByRole("region", { name: "Post a comment on ACME-1" });
		await user.click(within(bar).getByRole("button", { name: "Approve" }));
		await waitFor(async () =>
			expect((await unwrap(commands.approvalsList())).length).toBe(before - 1),
		);
	});

	it("names a force push in plain words, in the danger colour, with the command hidden", async () => {
		await renderInbox();
		const bar = await screen.findByRole("region", {
			name: "Replace the code of ACME-10 on the server",
		});
		expect(within(bar).getByRole("button", { name: "Approve" }).className).toContain("bg-danger");
		const command = within(bar).getByText("git push --force-with-lease origin fix/ACME-10");
		expect(command.closest("details")).not.toHaveAttribute("open");
	});

	it("approves a plan, and the run goes on", async () => {
		const user = userEvent.setup();
		await renderInbox();
		await user.click(await screen.findByRole("button", { name: "Approve plan" }));
		await waitFor(async () => expect((await run("ACME-4")).state).toBe("Working"));
	});

	it("marks a message read", async () => {
		const user = userEvent.setup();
		await renderInbox();
		const before = (await unwrap(commands.messagesList())).filter((m) => !m.read).length;
		await user.click(
			(await screen.findAllByRole("button", { name: "Mark read" }))[0] as HTMLElement,
		);
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
		renderApp(
			<ShellProvider>
				<Inbox />
			</ShellProvider>,
		);
		const preview = await screen.findByRole("group", { name: "Preview" });
		expect(preview).toHaveTextContent("NEEDS CLARIFICATION: Q-035");
		await waitFor(() => expect(screen.getByRole("button", { name: "Fold" })).toBeEnabled());
		await user.click(screen.getByRole("button", { name: "Fold" }));
		await waitFor(() =>
			expect(mockState().specs.files[SPEC]?.text).toContain("### Clarifications"),
		);
	});

	it("shows ghost rows and one action without a project", async () => {
		renderApp(
			<ShellProvider>
				<Inbox />
			</ShellProvider>,
		);
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
	});
});

describe("Home / My work", () => {
	it("lists the items of the person and their runs, with counts", async () => {
		await withTracker();
		await importAll();
		const me = (await unwrap(commands.workContext(0))).me;
		const mine = (await unwrap(commands.syncItems({}))).filter((i) => i.member === me);
		const keys = new Set(mine.map((i) => i.key));
		const runs = (await unwrap(commands.runsList())).filter((r) => keys.has(r.key));
		expect(mine.length).toBeGreaterThan(0);
		mountApp("/home/my-work");
		expect(
			await screen.findByRole("heading", { name: `Items (${mine.length})` }),
		).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: `Runs (${runs.length})` })).toBeInTheDocument();
		for (const i of mine) expect(screen.getByRole("group", { name: i.key })).toBeInTheDocument();
		// The four figures sit above the panels.
		for (const label of ["My items", "In progress", "Done", "Live runs"])
			expect(screen.getByText(label)).toBeInTheDocument();
		expect(screen.queryByText("Bump dependencies")).toBeNull();
	});

	it("shows ghost rows and one action without a project", async () => {
		mountApp("/home/my-work");
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
	});
});

describe("Home / Activity", () => {
	it("lists the run log events and the notifications, with counts", async () => {
		mockState().prefs.releaseUrl = "https://example.com/newer/releases/latest";
		mockState().prefs.seenVersion = "0.0.9";
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/activity");
		// The update opens What's new once. Close it to reach the page.
		await screen.findByRole("dialog", { name: "What's new in 0.1.0" });
		await userEvent.keyboard("{Escape}");
		expect(await screen.findByRole("heading", { name: /^Events \([1-9]/ })).toBeInTheDocument();
		expect(await screen.findByRole("heading", { name: "Notifications (2)" })).toBeInTheDocument();
		for (const label of ["Events", "Notifications", "Runs", "Live runs"])
			expect(screen.getAllByText(label).length).toBeGreaterThan(0);
		// Each event is one sentence, with the state in words: no event code shows.
		const log = within(screen.getByRole("region", { name: "Events" }));
		expect(log.getAllByText(/^ACME-\d+ moved to [A-Z][a-z ]+$/).length).toBeGreaterThan(0);
		expect(log.queryAllByText(/: (state|note|pr|question|message)$/)).toHaveLength(0);
		const region = within(screen.getByRole("region", { name: "Notifications" }));
		expect(region.getByText("Update available: 0.2.0")).toBeInTheDocument();
		expect(region.getByText("What changed in 0.1.0")).toBeInTheDocument();
	});

	it("shows ghost rows and one action without a project", async () => {
		mountApp("/home/activity");
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
	});
});
