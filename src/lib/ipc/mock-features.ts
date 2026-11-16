import type {
	ChangeView_Serialize,
	FlowFeature_Serialize,
	Mark,
	PrRowView,
	RunState,
	RunView_Serialize,
	Stage,
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
				: change
					? ["spec", null]
					: ["idea", null];
	return {
		title: ticket?.title ?? change?.title ?? run?.title ?? pr?.title ?? "",
		stage,
		mark,
		ticket: ticket ? `wi:${ticket.key}` : null,
		change: change ? `change:${change.id}` : null,
		run: run?.reference ?? null,
		pr: pr?.reference ?? null,
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
