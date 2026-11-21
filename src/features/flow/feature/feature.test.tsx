import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// The feature page of `spec:app-redesign#REQ-012` and `spec:app-redesign#REQ-015`.
const feature = (f: Partial<FlowFeature_Serialize> & { title: string }): FlowFeature_Serialize => ({
	stage: "build",
	mark: null,
	ticket: null,
	change: null,
	run: null,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop: null,
	...f,
});

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const switcher = async () => within(await screen.findByRole("navigation", { name: "Sections" }));
const pressed = async (name: string) =>
	expect((await switcher()).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");

/** ACME-2 has a running run; the first change of the demo is its spec. */
async function setup() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
	const change = (await unwrap(commands.specsChanges()))[0];
	if (!(run && change)) throw new Error("the demo has no run or no change");
	const build = feature({
		title: "Add the health dot",
		stage: "build",
		ticket: "wi:ACME-2",
		change: `change:${change.id}`,
		run: `run:${run.id}`,
		runState: "Working",
	});
	vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [build] });
	return { run, change, build };
}

afterEach(() => vi.restoreAllMocks());

describe("Feature page: the agent card and the back link", () => {
	it("shows how long the run has worked on the agent card", async () => {
		await setup();
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const agent = await screen.findByRole("region", { name: "Agent" });
		const label = await within(agent).findByText("Elapsed time:");
		expect(label).toHaveClass("sr-only");
		expect(label.nextElementSibling?.tagName).toBe("TIME");
		expect(label.nextElementSibling).toHaveTextContent(/\d/);
		await idle(router);
	});

	it("goes back to the page that opened the feature, as Escape does, and to Flow from a deep link", async () => {
		const user = userEvent.setup();
		await setup();
		const router = mountApp("/today/today");
		await idle(router);
		router.history.push("/flow/feature/wi%3AACME-2");
		await user.click(await screen.findByRole("link", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/today/today"));
		await idle(router);
	});

	it("names Flow when a card of Flow opened the feature, and goes back there", async () => {
		const user = userEvent.setup();
		await setup();
		const router = mountApp("/flow/flow");
		await user.click(await screen.findByRole("button", { name: /^Add the health dot/ }));
		const page = await screen.findByRole("region", { name: "ACME-2" });
		// A section change keeps the origin: the link still names Flow.
		await user.click((await switcher()).getByRole("button", { name: "Changes" }));
		await pressed("Changes");
		await user.click(within(page).getByRole("link", { name: /^Flow$/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
		await idle(router);
	});

	it("leads to Flow from a deep link, where no page came before", async () => {
		await setup();
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const page = await screen.findByRole("region", { name: "ACME-2" });
		const back = within(page).getByRole("link", { name: /^Flow$/ });
		expect(back).toHaveAttribute("href", "/flow/flow");
		expect(back).toHaveAttribute("aria-keyshortcuts", "Escape");
		await idle(router);
	});
});

describe("Feature page (REQ-012)", () => {
	it("shows the stage line and the six sections of a feature in Build with a spec and a run", async () => {
		const { run } = await setup();
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const page = await screen.findByRole("region", { name: "ACME-2" });
		expect(within(page).getByRole("heading", { level: 1 })).toHaveTextContent("Add the health dot");
		const stages = within(within(page).getByRole("list", { name: "Stages" }));
		expect(stages.getByText("Build").closest("li")).toHaveAttribute("aria-current", "step");
		const names = (await switcher()).getAllByRole("button").map((b) => b.textContent);
		expect(names).toEqual(["Story", "Brief", "Design", "Changes", "Checks", "Chat"]);
		await pressed("Story");
		// Story: the agent, the brief, the changes and the people in the side column.
		expect(await within(page).findByRole("region", { name: "Agent" })).toBeVisible();
		expect(within(page).getByRole("region", { name: "Brief" })).toBeVisible();
		expect(within(page).getByRole("region", { name: "Changes" })).toBeVisible();
		expect(run.key).toBe("ACME-2");
		await idle(router);
	});

	it("marks the stage of a failed run as stopped, like a blocked or stopped one", async () => {
		const { build } = await setup();
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [{ ...build, runState: "Failed" }],
		});
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const page = await screen.findByRole("region", { name: "ACME-2" });
		const stages = within(within(page).getByRole("list", { name: "Stages" }));
		expect(await stages.findByText("Build, stopped")).toBeVisible();
		await idle(router);
	});

	it("shows the stage line on Story, Brief and Changes, and not on Design, Checks and Chat", async () => {
		const user = userEvent.setup();
		await setup();
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const page = await screen.findByRole("region", { name: "ACME-2" });
		for (const [name, shown] of [
			["Story", true],
			["Brief", true],
			["Design", false],
			["Changes", true],
			["Checks", false],
			["Chat", false],
		] as const) {
			await user.click((await switcher()).getByRole("button", { name }));
			await pressed(name);
			expect(within(page).queryByRole("list", { name: "Stages" }) !== null).toBe(shown);
		}
		await idle(router);
	});

	it("shows the spec link and the open questions in the Brief card, and draws no count of zero", async () => {
		const { change, build } = await setup();
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [{ ...build, questions: 1 }],
		});
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const brief = await screen.findByRole("region", { name: "Brief" });
		expect(
			within(brief).getByRole("button", { name: new RegExp(change.id.split("-")[0] ?? "", "i") }),
		).toBeVisible();
		expect(within(brief).getByText("1 open question")).toBeVisible();
		expect(within(brief).queryByText("No spec yet")).toBeNull();
		// The diff of the demo run adds lines and removes none: only the added count shows.
		const changes = await screen.findByRole("region", { name: "Changes" });
		await waitFor(() =>
			expect(within(changes).getByTitle("Lines added")).toHaveTextContent(/^\+\d+$/),
		);
		expect(within(changes).queryByTitle("Lines removed")).toBeNull();
		expect(changes).not.toHaveTextContent("−0");
		await idle(router);
	});

	it("finds the feature by the ref of any part, and each address opens its own section", async () => {
		const { run, change } = await setup();
		const cases: [string, string][] = [
			[`/flow/feature/${encodeURIComponent("wi:ACME-2")}`, "Story"],
			[`/flow/feature/${encodeURIComponent(`run:${run.id}`)}`, "Story"],
			[`/flow/feature/${encodeURIComponent(`change:${change.id}`)}`, "Brief"],
			[`/factory/runs/${run.id}`, "Story"],
			[`/factory/runs/${run.id}?tab=changes`, "Changes"],
			[`/flow/feature/${encodeURIComponent("wi:ACME-2")}?section=chat`, "Chat"],
		];
		for (const [path, section] of cases) {
			const router = mountApp(path);
			await pressed(section);
			expect(
				await screen.findByRole("heading", { level: 1, name: /Add the health dot/ }),
			).toBeVisible();
			await idle(router);
			cleanup();
		}
	});

	it("opens a pull request address on Changes with its merge box", async () => {
		await unwrap(commands.projectsOpen("/mock/demo", false));
		const pr = feature({ title: "Health route", stage: "review", pr: "pr:github-demo:141" });
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [pr] });
		const router = mountApp("/code/pull-requests/github-demo-141");
		await pressed("Changes");
		expect(await screen.findByRole("region", { name: "Merge status" })).toBeVisible();
		await idle(router);
	});

	it("keeps the section in the address", async () => {
		const user = userEvent.setup();
		await setup();
		const router = mountApp("/flow/feature/wi%3AACME-2");
		await user.click((await switcher()).getByRole("button", { name: "Design" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ section: "design" }));
		await user.click((await switcher()).getByRole("button", { name: "Story" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		await idle(router);
	});

	it("scrolls to a session that the address names and moves the focus there", async () => {
		await setup();
		const router = mountApp("/flow/feature/wi%3AACME-2?unit=t1");
		const first = await screen.findByRole("listitem", { name: "Build 1" });
		await waitFor(() => expect(first).toHaveFocus());
		await idle(router);
	});

	it("says that no feature has the ref, and leads back to Flow", async () => {
		const user = userEvent.setup();
		await setup();
		const router = mountApp("/flow/feature/wi%3ANOPE-1");
		expect(await screen.findByText("Nothing here")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Flow" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
		await idle(router);
	});

	it("shows each section of a feature with no run, no spec and no pull request with its one action", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature({ title: "An idea", stage: "idea", ticket: "wi:IDEA-1" })],
		});
		const router = mountApp("/flow/feature/wi%3AIDEA-1");
		expect(await screen.findByText("No agent yet")).toBeVisible();
		expect(screen.getByRole("button", { name: "Start an agent" })).toBeVisible();
		await user.click((await switcher()).getByRole("button", { name: "Brief" }));
		expect(await screen.findByText("No spec yet")).toBeVisible();
		expect(screen.getByRole("button", { name: "Write the spec" })).toBeVisible();
		await user.click((await switcher()).getByRole("button", { name: "Design" }));
		expect(await screen.findByText("No screen linked")).toBeVisible();
		await user.click((await switcher()).getByRole("button", { name: "Changes" }));
		expect(await screen.findByText("No changes")).toBeVisible();
		expect(screen.getByRole("button", { name: "Start an agent" })).toBeVisible();
		await user.click((await switcher()).getByRole("button", { name: "Checks" }));
		expect(await screen.findByText("No agent yet")).toBeVisible();
		await user.click((await switcher()).getByRole("button", { name: "Chat" }));
		expect(await screen.findByRole("tabpanel", { name: "Chat" })).toBeVisible();
		await idle(router);
	});

	it("lists the design things that cite the feature", async () => {
		const user = userEvent.setup();
		await setup();
		vi.spyOn(commands, "refsBacklinks").mockImplementation(async (ref) => ({
			status: "ok",
			data:
				ref === "wi:ACME-2"
					? [
							{ kind: "adr", count: 1, items: [{ source: "adr:0001", title: "Use SQLite" }] },
							{ kind: "wi", count: 1, items: [{ source: "wi:ACME-9", title: "Other" }] },
						]
					: [],
		}));
		const router = mountApp("/flow/feature/wi%3AACME-2");
		await user.click((await switcher()).getByRole("button", { name: "Design" }));
		// A decision shows by its title in the Decisions card; a ticket is not a design thing.
		const decisions = await screen.findByRole("region", { name: "Decisions" });
		expect(within(decisions).getByRole("button", { name: /Use SQLite/ })).toBeVisible();
		// The cited ticket shows nowhere on Design: not by its title, not by its ref.
		expect(screen.queryByText("Other")).toBeNull();
		expect(screen.queryByText(/ACME-9/)).toBeNull();
		await idle(router);
	});
});

describe("Feature page events (REQ-015)", () => {
	it("names the agent of an event in bold, and shows the time as 24 hours", async () => {
		const { run } = await setup();
		const log = mockState().factory.runs.find((x) => x.id === run.id)?.log;
		log?.splice(0);
		log?.push({
			id: 6001,
			step: "build.t2",
			kind: "review",
			payload: "{}",
			ts: new Date(2026, 0, 5, 15, 7).getTime(),
		});
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const actor = await screen.findByText("Build", { selector: "b" });
		expect(actor.parentElement).toHaveTextContent("Build reviewed the change");
		expect(screen.getByText("15:07")).toBeVisible();
		await idle(router);
	});

	it("shows the plain events, and one control opens all ten", async () => {
		const user = userEvent.setup();
		const { run } = await setup();
		const log = mockState().factory.runs.find((x) => x.id === run.id)?.log;
		log?.splice(0);
		for (let i = 1; i <= 10; i++)
			log?.push({
				id: 5000 + i,
				step: null,
				kind: "state",
				payload: JSON.stringify({ from: "Working", to: i === 10 ? "Paused" : "Queued" }),
				ts: 1_000 + i,
			});
		const router = mountApp("/flow/feature/wi%3AACME-2");
		// A plain sentence, newest first, with no log open yet.
		await screen.findByText("The work moved to Paused", { selector: "li" });
		expect(screen.queryByRole("region", { name: /^Events/ })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "All 10 events" }));
		const events = await screen.findByRole("region", { name: /^Events/ });
		expect(within(events).getAllByRole("listitem")).toHaveLength(10);
		await idle(router);
	});

	it("shows an agent step as an agent with its plain name, not as a person", async () => {
		const { build } = await setup();
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [{ ...build, who: { name: "build", agent: true } }],
		});
		const router = mountApp("/flow/feature/wi%3AACME-2");
		const people = await screen.findByRole("region", { name: "People" });
		expect(within(people).getByText("Build")).toBeInTheDocument();
		expect(people.querySelector("[data-avatar], .rounded-full")).toBeNull();
		await idle(router);
	});
	it("names the state of the checks of the pull request on Checks", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const pull = (await unwrap(commands.pullsList()))[0];
		if (!pull) throw new Error("the demo has a pull request");
		const review = feature({
			title: pull.title,
			stage: "review",
			pr: pull.reference,
			checks: "failing",
		});
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [review] });
		const router = mountApp(`/flow/feature/${encodeURIComponent(pull.reference)}?section=checks`);
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		expect(await within(panel).findByText("CI failing")).toBeVisible();
		await idle(router);
	});

	it("links Checks to the impacts page of the change (REQ-023)", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const idea = feature({ title: "Refuse an empty token", stage: "idea", change: "change:x" });
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [idea] });
		const router = mountApp("/flow/feature/change%3Ax?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		await user.click(await within(panel).findByRole("button", { name: "Impacts on other code" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/flow/feature/change%3Ax/impacts"),
		);
		// Analyze adds a report to the past reports of the full report.
		// Analyze is an item of the More menu of the impacts page.
		await screen.findByRole("region", { name: "What this change touches" });
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Analyze" }));
		await user.click(screen.getByRole("link", { name: "Full impact report" }));
		await user.click(await screen.findByRole("button", { name: "Past reports" }));
		expect(await screen.findByRole("heading", { name: "Past reports (2)" })).toBeVisible();
		// The back links lead to the impacts, then to the Checks panel.
		await user.click(screen.getByRole("link", { name: "What this change touches" }));
		await user.click(await screen.findByRole("link", { name: "Checks" }));
		expect(
			await within(await screen.findByRole("tabpanel", { name: "Checks" })).findByRole("button", {
				name: "Impacts on other code",
			}),
		).toBeVisible();
		await idle(router);
	});

	it("keeps the impacts off, with the reason, for a role with no level on code", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: "tess",
			found: "email",
			role: "qa",
			admin: false,
			readOnly: false,
			rights: [],
			access: {
				work: "read",
				plan: "read",
				specs: "read",
				design: "read",
				knowledge: "read",
				code: "none",
				runs: "read",
				settings: "none",
				costs: "none",
				merge: false,
				approve: false,
			},
		};
		const idea = feature({ title: "Refuse an empty token", stage: "idea", change: "change:x" });
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [idea] });
		const router = mountApp("/flow/feature/change%3Ax?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		const open = await within(panel).findByRole("button", { name: "Impacts on other code" });
		await waitFor(() => expect(open).toBeDisabled());
		expect(open).toHaveAccessibleDescription("No access");
		await idle(router);
	});

	it("shows the two stop links on a stop card and not on the ticket page of a blocked run", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		// ACME-1 waits for an answer: the stop card of picture 081 and its two ways on.
		let router = mountApp("/flow/feature/wi%3AACME-1");
		expect(
			await screen.findByRole("link", { name: "Blocked: the agent cannot go on" }),
		).toHaveAttribute("href", expect.stringContaining("/flow/flow"));
		expect(screen.getByRole("link", { name: "Stopped and cancelled features" })).toHaveAttribute(
			"href",
			"/flow/done",
		);
		await idle(router);
		cleanup();
		// ACME-9 is blocked: the ticket page of picture 026 draws neither link.
		router = mountApp("/flow/feature/wi%3AACME-9?ticket=true");
		expect(await screen.findByRole("button", { name: "Edit the title" })).toBeVisible();
		expect(screen.queryByRole("link", { name: "Blocked: the agent cannot go on" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Stopped and cancelled features" })).toBeNull();
		await idle(router);
	});

	it("draws the agent card of the ticket page with no agent row, equal buttons and More actions", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/flow/feature/wi%3AACME-9?ticket=true");
		const card = within(await screen.findByRole("region", { name: "Agent" }));
		expect(card.queryByRole("img")).toBeNull();
		expect(card.getByRole("button", { name: "Try again" })).toBeVisible();
		expect(card.getByRole("button", { name: "Stop" })).toBeVisible();
		expect(card.queryByRole("button", { name: /^Talk to/ })).toBeNull();
		expect(card.getByRole("button", { name: "More actions" })).toBeVisible();
		await idle(router);
	});
});
