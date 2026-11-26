import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Providers } from "@/app/providers";
import { commands, type Finding_Serialize, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { routers } from "@/test/routers";
import { importAll, withTracker } from "@/test/tracker";
import { HealthActions } from "./doctor-compliance";

const finding = (id: string, detail: string): Finding_Serialize => ({
	id,
	group: "refs",
	severity: "warning",
	code: "ref-broken",
	detail,
	source: null,
	fix: { kind: "recheck" },
});
const THREE = [finding("a", "adr:0001"), finding("b", "adr:0002"), finding("c", "adr:0003")];
const LINES = [
	"A link points to a document that does not exist: adr:0001",
	"A link points to a document that does not exist: adr:0002",
	"A link points to a document that does not exist: adr:0003",
];

/** The actions alone, on a router of their own: the page that holds them moves in this wave. */
function mount(findings: Finding_Serialize[]) {
	vi.spyOn(commands, "healthRun").mockResolvedValue({ status: "ok", data: findings });
	const router = createRouter({
		routeTree: createRootRoute({ component: HealthActions }),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	routers().push(router as never);
	render(
		<Providers>
			<RouterProvider router={router as never} />
		</Providers>,
	);
}

/** The mock mirror cannot adopt a ticket that the issue tracker just made: the test puts it there. */
function adoptWritten() {
	vi.spyOn(commands, "syncAdopt").mockImplementation(async (key) => {
		const state = mockState();
		const made = Object.values(state.work.written).find((w) => w.key === key);
		const like = state.sync.mirror[0];
		if (!(made && like)) throw new Error(`no ticket ${key}`);
		const item = {
			...like,
			key,
			title: made.row.title,
			description: made.row.description,
			labels: [],
			linked: made.row.reference,
			assignee: null,
		};
		state.sync.mirror.push(item);
		return { status: "ok", data: item as never };
	});
}

/** The recipe of a new story gets a budget of 3 USD. */
async function budget() {
	const recipe = await unwrap(commands.workflowGet("feature"));
	await unwrap(
		commands.workflowWrite(
			"feature",
			recipe.text.includes("budget_usd")
				? recipe.text
				: recipe.text.replace("limits:\n", "limits:\n  budget_usd: 3\n"),
		),
	);
}

/** Clicks the action, then its confirmation. */
async function fixAll(user: ReturnType<typeof userEvent.setup>, confirm: string) {
	const fix = await screen.findByRole("button", { name: "Fix all with an agent" });
	await waitFor(() => expect(fix).toBeEnabled());
	await user.click(fix);
	await user.click(await screen.findByRole("button", { name: confirm }));
}
const CONFIRM = "Start one agent to fix 3 findings? Budget of the run: $3";

const fixes = async () =>
	(await unwrap(commands.featuresList())).filter((f) => f.title.startsWith("Fix the findings"));

describe("Health of the project / Fix all with an agent (spec:app-redesign#REQ-031)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("makes one feature with the three findings in its Brief, asks the same approval, and stops", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		adoptWritten();
		await budget();
		mount(THREE);
		// The confirmation names the number of findings and the budget of the run.
		await fixAll(user, CONFIRM);
		const link = await screen.findByRole("link", { name: "Open the feature" });

		// One feature, with its ticket, its spec change and its run.
		const [feature, ...more] = await fixes();
		expect(more).toEqual([]);
		expect(feature?.run).not.toBeNull();
		expect(link).toHaveAttribute(
			"href",
			`/flow/feature/${encodeURIComponent(feature?.ticket ?? "")}`,
		);
		// The Brief is the ticket and the proposal of the change: each holds the three findings.
		const key = feature?.ticket?.replace("wi:", "");
		const ticket = (await unwrap(commands.syncItems({}))).find((t) => t.key === key);
		const change = (await unwrap(commands.specsChanges())).find(
			(c) => `change:${c.id}` === feature?.change,
		);
		const proposal = (await unwrap(commands.specsRead(`${change?.path}/proposal.md`))).text;
		for (const line of LINES) {
			expect(ticket?.description).toContain(line);
			expect(proposal).toContain(line);
		}

		// The mock has no engine: the test moves the run to the state of an agent that works.
		const run = mockState().factory.runs.find((r) => r.key === key);
		if (!run) throw new Error("no run");
		expect(run.workflow).toBe("feature");
		run.state = "Working";
		expect((await fixes())[0]).toMatchObject({ stage: "build", runState: "Working" });
		// It is a session of Crew while it works.
		expect((await unwrap(commands.runsList())).find((r) => r.id === run.id)?.lane).toBe("working");

		// No second run while this one works.
		expect(screen.queryByRole("button", { name: "Fix all with an agent" })).toBeNull();

		// The write of the run waits in the approvals list of every run: it merges nothing on its own.
		mockState().factory.approvals.push({
			id: 9001,
			run: run.id,
			key: run.key,
			title: run.title,
			workflow: run.workflow,
			kind: "open_pr",
			summary: "Open the pull request",
			detail: "",
			force: false,
			right: "code.write",
		});
		expect((await unwrap(commands.approvalsList())).map((a) => a.id)).toContain(9001);
		expect((await fixes())[0]?.approvals).toBe(1);

		// Stop is the stop of a run of today.
		await user.click(screen.getByRole("button", { name: "Stop" }));
		await user.click(await screen.findByRole("button", { name: "Stop the agent?" }));
		await waitFor(() => expect(run.state).toBe("Cancelled"));
		expect(await screen.findByRole("button", { name: "Fix all with an agent" })).toBeEnabled();
		expect(await fixes()).toHaveLength(1);

		// A new start runs on the same ticket: it makes no second feature.
		await fixAll(user, CONFIRM);
		await screen.findByRole("button", { name: "Stop" });
		expect(await fixes()).toHaveLength(1);
		expect(mockState().factory.runs.filter((r) => r.key === key)).toHaveLength(2);
	});

	it("makes one feature when the run does not start and the person clicks again", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		adoptWritten();
		await budget();
		const start = vi
			.spyOn(commands, "runStart")
			.mockResolvedValueOnce({ status: "error", error: "no runner" } as never);
		mount(THREE);
		await fixAll(user, CONFIRM);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		// The feature of the failed start stays, with its link.
		expect(await screen.findByRole("link", { name: "Open the feature" })).toBeInTheDocument();
		expect(await fixes()).toHaveLength(1);
		await fixAll(user, CONFIRM);
		await screen.findByRole("button", { name: "Stop" });
		expect(start).toHaveBeenCalledTimes(2);
		const [feature, ...more] = await fixes();
		expect(more).toEqual([]);
		expect(feature?.run).not.toBeNull();
		const made = (await unwrap(commands.specsChanges())).filter((c) =>
			c.title.startsWith("Fix the findings"),
		);
		expect(made).toHaveLength(1);
	});

	it("takes the change of a start that made no ticket", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		adoptWritten();
		await budget();
		vi.spyOn(commands, "workItemCreate").mockResolvedValueOnce({
			status: "error",
			error: "no issue tracker",
		} as never);
		mount(THREE);
		await fixAll(user, CONFIRM);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		await fixAll(user, CONFIRM);
		await screen.findByRole("button", { name: "Stop" });
		const made = (await unwrap(commands.specsChanges())).filter((c) =>
			c.title.startsWith("Fix the findings"),
		);
		expect(made).toHaveLength(1);
		expect(await fixes()).toHaveLength(1);
	});

	it("refuses the start, with the reason, when the recipe of the run has no budget (REQ-033)", async () => {
		await withTracker();
		const recipe = await unwrap(commands.workflowGet("feature"));
		await unwrap(
			commands.workflowWrite("feature", recipe.text.replace(/^ {2}budget_usd: .*\n/m, "")),
		);
		const start = vi.spyOn(commands, "runStart");
		mount(THREE);
		const fix = await screen.findByRole("button", { name: "Fix all with an agent" });
		await waitFor(() => expect(fix).not.toHaveAttribute("aria-busy"));
		expect(fix).toBeDisabled();
		expect(fix).toHaveAccessibleDescription("Set a budget in the recipe feature first");
		expect(start).not.toHaveBeenCalled();
	});

	it("says 1 finding in the confirmation of one finding", async () => {
		const user = userEvent.setup();
		await withTracker();
		await budget();
		mount(THREE.slice(0, 1));
		const fix = await screen.findByRole("button", { name: "Fix all with an agent" });
		await waitFor(() => expect(fix).toBeEnabled());
		await user.click(fix);
		expect(
			await screen.findByRole("button", {
				name: "Start one agent to fix 1 finding? Budget of the run: $3",
			}),
		).toBeInTheDocument();
	});

	it("shows only Check again when there is no finding", async () => {
		await withTracker();
		mount([]);
		expect(await screen.findByRole("button", { name: "Check again" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Fix all with an agent" })).toBeNull();
	});

	it("is off, with the reason, for a person who cannot start a run", async () => {
		await withTracker();
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mount(THREE);
		const button = await screen.findByRole("button", { name: "Fix all with an agent" });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription("Needs the right runs.start (your role: Viewer)");
	});
});
