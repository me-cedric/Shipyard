import type {
	ChangeView_Serialize,
	Ci,
	FlowFeature_Serialize,
	Mark,
	PrRowView,
	RunState,
	RunView_Serialize,
	Stage,
	Stop,
	WorkItemView_Serialize,
} from "./bindings";
import { isRef } from "./mock-refs";

/** The stage of a main path state (`null` for a side state) and its mark, as `shipyard_core::feature`. */
const SPLIT: Record<RunState, [Stage | null, Mark | null]> = {
	Queued: ["spec", null],
	Claimed: ["spec", null],
	Planning: ["spec", null],
	PlanReview: ["spec", "needs_you"],
	Working: ["build", null],
	SelfReview: ["build", null],
	PROpen: ["review", null],
	ChangesRequested: ["review", null],
	Merged: ["ready", null],
	Done: ["ready", null],
	Failed: ["build", "stopped"],
	Cancelled: ["build", "stopped"],
	WaitingForAnswer: [null, "needs_you"],
	Blocked: [null, "blocked"],
	RetryQueued: [null, null],
	Paused: [null, "stopped"],
};

/** A side state takes the stage of its return state; with none, Build. */
export function stageOf(state: RunState, returnTo: RunState | null): [Stage, Mark | null] {
	const [stage, mark] = SPLIT[state];
	return [stage ?? (returnTo ? SPLIT[returnTo][0] : null) ?? "build", mark];
}

/**
 * The main action of a stopped run, as `shipyard_core::feature::stop_of`. `cause` is the cause of
 * the stop (`budget`, `nothing_to_deliver`, …), `pr` the state of its pull request.
 */
export function stopOf(state: RunState, cause: string | null, pr: string | null): Stop | null {
	const final = ["Failed", "Cancelled", "Done"].includes(state);
	if ((pr === "merged" || pr === "closed") && !final && state !== "Merged") return "close_done";
	if (state === "WaitingForAnswer") return "reply";
	if (state === "Blocked") return cause === "nothing_to_deliver" ? "close_done" : "unblock";
	if (state === "Paused") return cause === "budget" ? "add_budget" : "resume";
	return state === "Failed" ? "try_again" : null;
}

/** The checks of a pull request; `none` is no checks. */
const CHECKS: Ci[] = ["passing", "failing", "pending"];

type Ticket = WorkItemView_Serialize;
type Change = ChangeView_Serialize;
type Run = RunView_Serialize;
type Pull = PrRowView;

function one(ticket?: Ticket, change?: Change, run?: Run, pr?: Pull): FlowFeature_Serialize {
	const [stage, mark]: [Stage, Mark | null] = run
		? stageOf(run.state, run.returnTo)
		: pr
			? pr.state === "open"
				? ["review", null]
				: pr.state === "merged"
					? ["ready", null]
					: ["review", "stopped"]
			: ticket?.category === "done"
				? ["ready", null]
				: // Each artifact but the proposal sits under `specs/`: with none, the change is an idea.
					change?.artifacts.some((a) => a.artifact !== "proposal" && a.status !== "missing")
					? ["spec", null]
					: ["idea", null];
	// The agent step that works, else the assignee. The mirror keeps no author of a pull request.
	const step = run?.steps.find((x) => x.state === "running")?.id;
	const who = step
		? { name: step, agent: true }
		: ticket?.assignee
			? { name: ticket.assignee, agent: false }
			: null;
	return {
		title: ticket?.title ?? change?.title ?? run?.title ?? pr?.title ?? "",
		stage,
		mark,
		ticket: ticket ? `wi:${ticket.key}` : null,
		change: change ? `change:${change.id}` : null,
		run: run?.reference ?? null,
		pr: pr?.reference ?? null,
		who,
		runState: run?.state ?? null,
		approvals: run?.approvals ?? 0,
		questions: run?.openQuestions ?? 0,
		checks: CHECKS.find((c) => c === pr?.ci) ?? null,
		stop: run?.stop ?? null,
	};
}

/**
 * The features of Flow, as `features_list` joins them: each ticket, change, run and pull request
 * once. `runs` is newest first. `proposal` gives the text of the proposal of a change.
 */
export function features(
	tickets: Ticket[],
	changes: Change[],
	runs: Run[],
	prs: Pull[],
	proposal: (c: Change) => string,
): FlowFeature_Serialize[] {
	const cited = (c: Change) => {
		const key = /wi:([A-Za-z0-9-]*)/.exec(proposal(c))?.[1] ?? "";
		return isRef(`wi:${key}`) ? key : null;
	};
	const parts = changes.map((c) => ({
		c,
		ticket: tickets.find((t) => t.linked === `change:${c.id}`)?.key ?? cited(c),
	}));
	const changeOf = (k: string) => parts.find((p) => p.ticket === k);
	const keys = [
		...new Set([
			...tickets.map((t) => t.key),
			...parts.flatMap((p) => (p.ticket ? [p.ticket] : [])),
			...runs.map((r) => r.key),
		]),
	];
	return [
		...keys.map((k) => {
			const run = runs.find((r) => r.key === k);
			const pr = prs.find((p) => p.number === run?.pr?.number);
			const t = tickets.find((x) => x.key === k);
			return { ...one(t, changeOf(k)?.c, run, pr), ticket: `wi:${k}` };
		}),
		...parts.filter((p) => !p.ticket || changeOf(p.ticket) !== p).map((p) => one(undefined, p.c)),
		...prs
			.filter((p) => !runs.some((r) => r.pr?.number === p.number))
			.map((p) => one(undefined, undefined, undefined, p)),
	];
}
