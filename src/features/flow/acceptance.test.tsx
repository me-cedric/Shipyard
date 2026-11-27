import { screen, waitFor, within } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize, Mark, RunState, Stage } from "@/lib/ipc/bindings";
import { stageOf, stopOf } from "@/lib/ipc/mock-features";
import { mountApp } from "@/test/mount";

// spec:app-redesign#REQ-010 and spec:factory#REQ-038: the table of the spec, written out.
// The Flow page and the mock read model must put each state where this table says.
// `Working` is the state that a side state returns to.
const TABLE: [RunState, Stage, Mark | null, string][] = [
	["Queued", "spec", null, "Waits"],
	["Claimed", "spec", null, "Waits"],
	["Planning", "spec", null, "Working"],
	["PlanReview", "spec", "needs_you", "Review the plan"],
	["Working", "build", null, "Working"],
	["SelfReview", "build", null, "Reads the change"],
	["PROpen", "review", null, "Pull request open"],
	["ChangesRequested", "review", null, "Changes asked"],
	["Merged", "ready", null, "Done"],
	["Done", "ready", null, "Done"],
	["WaitingForAnswer", "build", "needs_you", "Answer a question"],
	["Blocked", "build", "blocked", "Blocked"],
	["RetryQueued", "build", null, "Waits"],
	["Paused", "build", "stopped", "Paused"],
	["Failed", "build", "stopped", "Failed"],
	["Cancelled", "build", "stopped", "Stopped"],
];

const MAIN: RunState[] = [
	"Queued",
	"Claimed",
	"Planning",
	"PlanReview",
	"Working",
	"SelfReview",
	"PROpen",
	"ChangesRequested",
	"Merged",
	"Done",
	"Failed",
	"Cancelled",
];

const feature = (state: RunState): FlowFeature_Serialize => {
	// A side state returns to Working; a main state has no return state.
	const [stage, mark] = stageOf(state, MAIN.includes(state) ? null : "Working");
	return {
		title: `Run in ${state}`,
		stage,
		mark,
		ticket: null,
		change: null,
		run: `run:${state}`,
		pr: null,
		who: null,
		runState: state,
		approvals: 0,
		questions: 0,
		checks: null,
		stop: stopOf(state, null, null),
	};
};

describe("Flow shows each of the 16 run states in one stage, with its mark (REQ-010)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("puts each state in the column and with the mark of the table", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const list = TABLE.map(([state]) => feature(state));
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: list });
		const router = mountApp("/flow/flow");
		await screen.findAllByText("Run in Queued");
		for (const [state, stage, mark, said] of TABLE) {
			const title = `Run in ${state}`;
			expect(
				list.find((f) => f.runState === state),
				title,
			).toMatchObject({ stage, mark });
			// The feature shows once on the page, and in its stage.
			expect(screen.getAllByText(title), title).toHaveLength(1);
			const column = within(
				await screen.findByRole("region", { name: new RegExp(`^${stage}`, "i") }),
			);
			const heading = column.getByText(title);
			expect(heading, title).toBeVisible();
			// The mark: the card of a state that a person must act on has the attention frame.
			const attention = ["PlanReview", "WaitingForAnswer", "Blocked", "Paused", "Failed"].includes(
				state,
			);
			const article = heading.closest("article");
			expect(article !== null, title).toBe(attention);
			expect((article ?? heading.closest("button")) as HTMLElement, title).toHaveTextContent(said);
		}
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

// spec:app-redesign#REQ-023: the old address of the impacts opens them.
describe("Impacts", () => {
	it("opens from the old address /code/impacts", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/code/impacts");
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/impacts"));
		expect(await screen.findByRole("heading", { name: "What this change touches" })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
