import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { commands, type RunLogEvent_Serialize, type RunState, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { countsOf } from "@/ui/molecules/diff-file-list";
import { isImportant } from "./runs/run-live";
import { duration, endOf, primaryOf, stepperOf, useScrollClear, webUrl } from "./runs/run-summary";

const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};
// The first heading of the page is not always ours: the summary is the header of the open run.
const summaryOf = async () =>
	(await screen.findByRole("region", { name: /^ACME-\d+$/ })).querySelector(
		"header",
	) as HTMLElement;
const ev = (kind: string, payload: object): RunLogEvent_Serialize =>
	({
		id: 1,
		step: null,
		kind,
		payload: JSON.stringify(payload),
		ts: null,
	}) as RunLogEvent_Serialize;

function Probe() {
	const head = useRef<HTMLElement>(null);
	useScrollClear(head);
	return (
		<div data-testid="box" style={{ overflowY: "auto" }}>
			<header ref={head}>summary</header>
		</div>
	);
}

describe("Factory / run page: pure rules", () => {
	it.each<[RunState, boolean, string | null]>([
		["Queued", false, null],
		["Claimed", false, null],
		["Planning", false, null],
		["PlanReview", false, "approvePlan"],
		["Working", false, null],
		["SelfReview", false, null],
		["PROpen", true, "openPr"],
		["ChangesRequested", true, "openPr"],
		["Merged", true, "openPr"],
		["Merged", false, null],
		["Done", true, "openPr"],
		["Done", false, null],
		["WaitingForAnswer", false, "answer"],
		["Blocked", false, "unblock"],
		["RetryQueued", false, null],
		["Paused", false, "resume"],
		["Failed", false, "again"],
		["Cancelled", false, "again"],
	])("the primary action of %s (pull request: %s) is %s", (state, pr, want) => {
		expect(primaryOf(state, pr)).toBe(want);
	});

	it("reads the step as n of m with its name", () => {
		const steps = [
			{ id: "plan", state: "done", units: [] },
			{ id: "self-review", state: "running", units: [] },
			{ id: "pr", state: "pending", units: [] },
		];
		expect(stepperOf({ steps } as never)).toEqual({ n: 2, total: 3, name: "Self review" });
		expect(stepperOf({ steps: [{ id: "plan", state: "pending", units: [] }] } as never).n).toBe(0);
	});

	it("shows a time as hours and minutes, or minutes and seconds", () => {
		expect(duration(7_500_000)).toBe("2h 05m");
		expect(duration(312_000)).toBe("5m 12s");
	});

	it("shows days and hours above 48 hours, with the units of the language", () => {
		expect(duration(47 * 3_600_000)).toBe("47h 00m");
		expect(duration((14 * 24 + 2) * 3_600_000)).toBe("14d 2h");
		expect(duration((14 * 24 + 2) * 3_600_000, "fr")).toMatch(/^14\s?j 2\s?h$/);
	});

	it("marks questions, errors, state changes and results as important, and tool calls not", () => {
		expect(isImportant(ev("question", {}))).toBe(true);
		expect(isImportant(ev("state", { to: "Working" }))).toBe(true);
		expect(isImportant(ev("runner", { error: "boom" }))).toBe(true);
		expect(isImportant(ev("runner", { cost_usd: 1 }))).toBe(false);
		expect(isImportant(ev("tool", { tool: "read_file" }))).toBe(false);
		expect(isImportant(ev("tool", { tool: "report" }))).toBe(true);
	});

	it("marks alerts and failed steps as important too", () => {
		expect(isImportant(ev("alert", { budget: 0.8 }))).toBe(true);
		expect(isImportant(ev("note", { step_failed: "boom" }))).toBe(true);
		expect(isImportant(ev("note", { text: "edited" }))).toBe(false);
		expect(isImportant(ev("message", { text: "hi" }))).toBe(false);
	});

	it("opens a ticket link only for a web address", () => {
		expect(webUrl("https://acme.test/ACME-1")).toBe("https://acme.test/ACME-1");
		expect(webUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
		expect(webUrl("javascript:alert(1)")).toBeUndefined(); // nosemgrep: no-script-url -- the test of the filter
		expect(webUrl("file:///etc/passwd")).toBeUndefined();
		expect(webUrl("")).toBeUndefined();
		expect(webUrl("not a url")).toBeUndefined();
	});

	it("takes the end of an ended run from its sessions, and gives none when they have no time", () => {
		const unit = (last: number | null) => ({ last });
		const run = (...last: (number | null)[]) =>
			({ steps: [{ units: last.map(unit) }, { units: [] }] }) as never;
		expect(endOf(run(100, 250, null))).toBe(250_000);
		expect(endOf(run(null, 0))).toBeUndefined();
		expect(endOf({ steps: [] } as never)).toBeUndefined();
	});

	it("keeps the sticky summary clear: scroll-padding-top of the scroll box is its height", () => {
		const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
		const { unmount } = render(<Probe />);
		expect(screen.getByTestId("box").style.scrollPaddingTop).toBe("96px");
		const box = screen.getByTestId("box");
		unmount();
		expect(box.style.scrollPaddingTop).toBe("");
		height.mockRestore();
	});

	it("counts the added and removed lines of a file", () => {
		expect(countsOf("--- a\n+++ b\n@@ -1,2 +1,2 @@\n-old\n+new\n+more\n ctx\n")).toEqual({
			added: 2,
			removed: 1,
		});
	});
});

describe("Factory / run page", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("shows the summary with the step, the cost and the pull request number, and no raw id", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-8");
		mountApp(`/factory/runs/${run.id}`);
		const summary = await summaryOf();
		expect(await within(summary).findByRole("link", { name: "#42" })).toBeVisible();
		expect(within(summary).getByRole("group", { name: /^Step \d+ of \d+$/ })).toBeVisible();
		expect(within(summary).getByRole("group", { name: "Cost" })).toHaveTextContent("$0.88");
		expect(within(summary).getByRole("heading", { level: 1 })).toHaveTextContent(run.title);
		// One h1 on the run page: the title in the summary (the assistant panel has its own).
		expect(
			within(summary.parentElement as HTMLElement).getAllByRole("heading", { level: 1 }),
		).toHaveLength(1);
		expect(within(summary).getByRole("button", { name: "Open pull request" })).toBeVisible();
		expect(summary.textContent).not.toMatch(/pr:|run:/);
	});

	it("opens the page of the pull request of the run from Open pull request", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-8");
		const router = mountApp(`/factory/runs/${run.id}`);
		const summary = await summaryOf();
		await user.click(await within(summary).findByRole("button", { name: "Open pull request" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toMatch(/^\/code\/pull-requests\/.+-42$/),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("puts the added budget, the message and Resume in one form for a paused run", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-6");
		mountApp(`/factory/runs/${run.id}`);
		const needs = await screen.findByRole("region", { name: "Needs you" });
		const form = needs.querySelector("form") as HTMLFormElement;
		expect(within(form).getByRole("textbox", { name: "Added budget (USD)" })).toBeVisible();
		expect(within(form).getByRole("textbox", { name: "Message to the agent" })).toBeVisible();
		expect(within(form).getByRole("button", { name: "Resume" })).toBeVisible();
		expect(needs).not.toHaveTextContent("first tick");
		// The fact sits in the layout: two numbers and a meter, and no sentence of help.
		expect(within(needs).getByRole("meter", { name: "Cost" })).toBeVisible();
		expect(needs).not.toHaveTextContent("resumes by itself");
	});

	it("shows no chip of the run on its own question and approval rows", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-1");
		mountApp(`/factory/runs/${run.id}`);
		const needs = await screen.findByRole("region", { name: "Needs you" });
		expect(needs.querySelector('[id^="question-"], [id^="approval-"]')).not.toBeNull();
		expect(needs.querySelector('[aria-label*="run:"]')).toBeNull();
	});

	it("moves the focus to the form when the person picks the primary action of a paused run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-6");
		mountApp(`/factory/runs/${run.id}`);
		const summary = await summaryOf();
		await user.click(within(summary).getByRole("button", { name: "Resume" }));
		expect(screen.getByRole("textbox", { name: "Added budget (USD)" })).toHaveFocus();
	});

	it("offers Start again on a cancelled run and opens the new run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-3");
		await unwrap(commands.runCancel(run.id));
		const router = mountApp(`/factory/runs/${run.id}`);
		const summary = await summaryOf();
		await user.click(await within(summary).findByRole("button", { name: "Start again" }));
		await waitFor(() => {
			const path = router.state.location.pathname;
			expect(path).toMatch(/^\/factory\/runs\//);
			expect(path).not.toBe(`/factory/runs/${run.id}`);
		});
	});

	it("shows only the important events when there are many, and all of them on All", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-2");
		const log = mockState().factory.runs.find((x) => x.id === run.id)?.log;
		for (let i = 0; i < 25; i++)
			log?.push({
				id: 8000 + i,
				step: "build",
				kind: "tool",
				payload: JSON.stringify({ tool: "read_file" }),
				ts: Date.now(),
			});
		mountApp(`/factory/runs/${run.id}`);
		const events = await screen.findByRole("region", { name: /^Events/ });
		await within(events).findByText("ACME-2 moved to Claimed");
		expect(within(events).queryByText("The agent used read file")).toBeNull();
		await user.click(within(events).getByRole("button", { name: "All" }));
		expect((await within(events).findAllByText("The agent used read file")).length).toBe(25);
	});

	it("lists a live run newest first and an ended run oldest first", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const live = await find("ACME-2");
		const ended = (await unwrap(commands.runsList())).find((r) => r.state === "Done");
		if (!ended) throw new Error("a run that is done");
		for (const r of [live, ended]) {
			const log = mockState().factory.runs.find((x) => x.id === r.id)?.log;
			log?.splice(0);
			for (const [i, to] of ["Queued", "Paused"].entries())
				log?.push({
					id: 7000 + i,
					step: null,
					kind: "state",
					payload: JSON.stringify({ from: "Working", to }),
					ts: 1_000 + i,
				});
		}
		const order = async (id: string) => {
			const router = mountApp(`/factory/runs/${id}`);
			const events = await screen.findByRole("region", { name: /^Events/ });
			await within(events).findByText(/moved to Paused/);
			const rows = within(events)
				.getAllByRole("listitem")
				.map((li) => li.textContent ?? "");
			const at = (word: string) => rows.findIndex((x) => x.includes(`moved to ${word}`));
			await waitFor(() => expect(router.state.status).toBe("idle"));
			return at("Queued") < at("Paused");
		};
		expect(await order(live.id)).toBe(false);
		cleanup();
		expect(await order(ended.id)).toBe(true);
	});

	it("loads every page of a live run: event 120 is on top and in the live line", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const live = await find("ACME-2");
		const log = mockState().factory.runs.find((x) => x.id === live.id)?.log;
		log?.splice(0);
		// Only the 120th event says Paused: it is the newest.
		for (let i = 1; i <= 120; i++)
			log?.push({
				id: 9000 + i,
				step: null,
				kind: "state",
				payload: JSON.stringify({ from: "Working", to: i === 120 ? "Paused" : "Queued" }),
				ts: 1_000 + i,
			});
		const router = mountApp(`/factory/runs/${live.id}`);
		const events = await screen.findByRole("region", { name: /^Events/ });
		await waitFor(
			() => {
				expect(within(events).getAllByRole("listitem")[0]).toHaveTextContent("moved to Paused");
			},
			{ timeout: 4000 },
		);
		expect(screen.getByText("ACME-2 moved to Paused", { selector: "p[aria-live]" })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("past the cap of 1000 events the live line shows the last loaded event and the list stays oldest first", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const live = await find("ACME-2");
		const log = mockState().factory.runs.find((x) => x.id === live.id)?.log;
		log?.splice(0);
		// Event 1000 is the last one read on its own; 100 more wait behind "Load more".
		for (let i = 1; i <= 1100; i++)
			log?.push({
				id: 9000 + i,
				step: null,
				kind: "state",
				payload: JSON.stringify({ from: "Working", to: i === 1000 ? "Paused" : "Queued" }),
				ts: 1_000 + i,
			});
		const router = mountApp(`/factory/runs/${live.id}`);
		const events = await screen.findByRole("region", { name: /^Events/ });
		expect(
			await screen.findByText(
				"ACME-2 moved to Paused",
				{ selector: "p[aria-live]" },
				{ timeout: 20_000 },
			),
		).toBeVisible();
		expect(within(events).getByRole("button", { name: "More" })).toBeVisible();
		expect(within(events).getAllByRole("listitem")[0]).toHaveTextContent("moved to Queued");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	}, 30_000);

	it("draws no box for a live conversation with nothing in it", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-2");
		const unit = run.steps.flatMap((x) => x.units).find((u) => u.state === "running" && u.runner);
		const log = mockState().factory.runs.find((x) => x.id === run.id)?.log;
		log?.splice(0);
		const router = mountApp(`/factory/runs/${run.id}`);
		await screen.findByRole("region", { name: /^Events/ });
		expect(screen.queryByRole("log", { name: "Session transcript" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
		cleanup();
		log?.push({
			id: 7100,
			step: unit?.id ?? null,
			kind: "runner",
			payload: JSON.stringify({ type: "text", text: "Hello" }),
			ts: 1_000,
		});
		const again = mountApp(`/factory/runs/${run.id}`);
		expect(await screen.findByRole("log", { name: "Session transcript" })).toBeInTheDocument();
		await waitFor(() => expect(again.state.status).toBe("idle"));
	});

	it("lists each changed file closed, with its counts, and opens it on a click", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = await find("ACME-2");
		mountApp(`/factory/runs/${run.id}`);
		await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
		const diff = await screen.findByRole("region", { name: "Diff" });
		const files = await within(diff).findAllByRole("button", { expanded: false });
		const file = files.find((b) => b.hasAttribute("aria-expanded")) as HTMLElement;
		expect(file).toHaveTextContent(/added/);
		expect(within(diff).queryByRole("table")).toBeNull();
		await user.click(file);
		expect(file).toHaveAttribute("aria-expanded", "true");
		await user.click(within(diff).getByRole("button", { name: "Expand all" }));
		await user.click(within(diff).getByRole("button", { name: "Collapse all" }));
		expect(file).toHaveAttribute("aria-expanded", "false");
	});
});
