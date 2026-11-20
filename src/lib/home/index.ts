import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef } from "react";
import { stopReason } from "@/features/factory/runs/run-live";
import { routeInbox } from "@/features/home/inbox/routing";
import { format, type Messages } from "@/lib/i18n";
import {
	type ApprovalView,
	commands,
	isTauri,
	type MessageView,
	type QuestionChoice,
	type QuestionView_Serialize,
	type ReviewWait,
	type RunView_Serialize,
	unwrap,
} from "@/lib/ipc";
import type { Notice } from "@/lib/notifications";
import { noticeTarget } from "@/lib/notifications/targets";
import { useRights } from "@/lib/rights";
import { useWorkItems } from "@/lib/sync";
import { useWorkContext } from "@/lib/work";

export type QuestionItem = QuestionView_Serialize;
export type ApprovalItem = ApprovalView;
export type MessageItem = MessageView;
export type ReviewItem = ReviewWait;
export type RunItem = RunView_Serialize;

/** The factory tells the views with these events. The payload is `{ run, id }`. */
export const FACTORY_EVENTS = [
	"factory-run",
	"factory-approval",
	"factory-question",
	"factory-message",
	"factory-review",
] as const;
export type FactoryEvent = (typeof FACTORY_EVENTS)[number];
export type FactoryPayload = { run: string; id: string };

export const homeKeys = {
	all: ["home"] as const,
	questions: ["home", "questions"] as const,
	approvals: ["home", "approvals"] as const,
	runs: ["home", "runs"] as const,
	messages: ["home", "messages"] as const,
	reviews: ["home", "reviews"] as const,
};

/** Runs the handler at each factory event. The mock emits none. */
export function useFactoryEvents(handler: (event: FactoryEvent, payload: FactoryPayload) => void) {
	// The listener reads the latest handler, so it is set once.
	const latest = useRef(handler);
	latest.current = handler;
	useEffect(() => {
		if (!isTauri()) return;
		const offs = FACTORY_EVENTS.map((name) =>
			listen<FactoryPayload>(name, (e) => latest.current(name, e.payload)),
		);
		return () => offs.forEach((off) => void off.then((f) => f()));
	}, []);
}

/** A run of a ticket with a newer run is superseded (the ids sort by start). Each view of what is live uses this. */
export function latestPerTicket<T extends { id: string; project: string; key: string }>(
	runs: T[],
): T[] {
	const last = new Map<string, string>();
	for (const r of runs) {
		const k = `${r.project}\0${r.key}`;
		if ((last.get(k) ?? "") < r.id) last.set(k, r.id);
	}
	return runs.filter((r) => last.get(`${r.project}\0${r.key}`) === r.id);
}

// The same four states as `ENDED` of `@/lib/factory`, which imports this file.
const ENDED_STATES = ["Merged", "Done", "Failed", "Cancelled"];

type Timed = { steps: { units: { last: number | null }[] }[] };

/** The end of an ended run: the newest `last` of its sessions (Unix seconds) as milliseconds. */
export function endOf(run: Timed): number | undefined {
	const last = Math.max(0, ...run.steps.flatMap((s) => s.units.map((u) => u.last ?? 0)));
	return last > 0 ? last * 1000 : undefined;
}

/**
 * Every ended run and each older run of a ticket, for History. The newest end comes first; a run
 * with no end time follows, in start order (newest first).
 */
export function historyRuns<
	T extends Timed & { id: string; project: string; key: string; state: string },
>(runs: T[]): T[] {
	const current = new Set(latestPerTicket(runs).map((r) => r.id));
	return runs
		.filter((r) => ENDED_STATES.includes(r.state) || !current.has(r.id))
		.sort((a, b) => {
			const [x, y] = [endOf(a), endOf(b)];
			if (x !== undefined && y !== undefined && x !== y) return y - x;
			if ((x === undefined) !== (y === undefined)) return x === undefined ? 1 : -1;
			return a.id < b.id ? 1 : -1;
		});
}

const localDay = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Timesheet day" shows Monday to Friday. It is one item, until a time entry of that day exists. */
export function timesheetDue(now: Date, loggedDays: string[]): boolean {
	return now.getDay() >= 1 && now.getDay() <= 5 && !loggedDays.includes(localDay(now));
}

/** What waits for the person: open questions first, approvals, plans to review, messages. */
export function useInbox() {
	const qc = useQueryClient();
	useFactoryEvents(() => void qc.invalidateQueries({ queryKey: homeKeys.all }));
	const questions = useQuery({
		queryKey: homeKeys.questions,
		queryFn: () => unwrap(commands.questionsList()),
	});
	const approvals = useQuery({
		queryKey: homeKeys.approvals,
		queryFn: () => unwrap(commands.approvalsList()),
	});
	const runs = useQuery({ queryKey: homeKeys.runs, queryFn: () => unwrap(commands.runsList()) });
	const messages = useQuery({
		queryKey: homeKeys.messages,
		queryFn: () => unwrap(commands.messagesList()),
	});
	const reviews = useQuery({
		queryKey: homeKeys.reviews,
		queryFn: () => unwrap(commands.prReviewWaiting()),
	});
	const now = new Date();
	// Only on the day: other days ask the tracker nothing.
	const time = useQuery({
		queryKey: ["work", "time", null, localDay(now).slice(0, 7)],
		queryFn: () => unwrap(commands.timeList(null, localDay(now).slice(0, 7))),
		enabled: now.getDay() >= 1 && now.getDay() <= 5,
	});
	return {
		loading: [questions, approvals, runs, messages, reviews].some((q) => q.isPending),
		timesheet: time.data
			? timesheetDue(
					now,
					time.data.rows.flatMap((r) => (r.entry ? [r.entry.day] : [])),
				)
			: false,
		questions: questions.data ?? [],
		approvals: approvals.data ?? [],
		plans: latestPerTicket(runs.data ?? []).filter((r) => r.state === "PlanReview"),
		messages: messages.data ?? [],
		reviews: reviews.data ?? [],
	};
}

/** One thing that needs the person, with the data of its row. */
export type NeedsYouItem = {
	/** Stable: the same thing keeps its id while it waits. */
	id: string;
	/** `agent` always today: a person asks through a review or a message of an agent. */
	who: "agent" | "person";
	/** The workflow or step that asks (REQ-007 names who asks). Empty when unknown. */
	by: string;
	/** The ticket key of the feature, `#12` for a pull request. */
	key: string;
	/** The title of the feature. */
	title: string;
	/** What is asked, in one line. */
	text: string;
	/** The ref that opens the thing, empty when it has none. */
	ref: string;
} & (
	| { kind: "question"; item: QuestionItem }
	/** `items`: every effect that waits for the run, as one question (`spec:app-redesign#REQ-013`). */
	| { kind: "approval"; item: ApprovalItem; items: ApprovalItem[] }
	| { kind: "plan"; item: RunItem }
	| { kind: "review"; item: ReviewItem }
	| { kind: "message"; item: MessageItem }
);

/** The approvals of one run are one question: one group for each run, in the order of the first. */
function approvalsByRun(list: ApprovalItem[]): [ApprovalItem, ...ApprovalItem[]][] {
	const groups = new Map<string, [ApprovalItem, ...ApprovalItem[]]>();
	for (const a of list) {
		const g = groups.get(a.run);
		if (g) g.push(a);
		else groups.set(a.run, [a]);
	}
	return [...groups.values()];
}

/**
 * The one list of what needs the person (spec:app-redesign#REQ-007, REQ-008), routed by role. Order:
 * questions, approvals, plan reviews, agent reviews, messages. The time reminder is not in it.
 * Today, the count of the menu and the menu bar panel read this list.
 */
export function useNeedsYou(everyone = false) {
	const raw = useInbox();
	const { can, role, person } = useRights();
	const me = useWorkContext().data?.me ?? null;
	const work = useWorkItems({}).data ?? [];
	const inbox = routeInbox(raw, {
		everyone,
		can,
		role,
		roles: person?.roles,
		me,
		assignee: (key) => work.find((i) => i.key === key)?.member,
	});
	const runs = useQuery({
		queryKey: homeKeys.runs,
		queryFn: () => unwrap(commands.runsList()),
	}).data;
	const named = (run: string) => runs?.find((r) => r.id === run)?.workflow ?? "";
	const items: NeedsYouItem[] = [
		...inbox.questions.map(
			(item): NeedsYouItem => ({
				id: `question:${item.run}:${item.question.id}`,
				kind: "question",
				who: "agent",
				by: named(item.run),
				key: item.key,
				title: item.title,
				text: item.question.question,
				ref: `run:${item.run}`,
				item,
			}),
		),
		...approvalsByRun(inbox.approvals).map(
			(items): NeedsYouItem => ({
				id: `approvals:${items[0].run}`,
				kind: "approval",
				who: "agent",
				by: named(items[0].run),
				key: items[0].key,
				title: items[0].title,
				text: items.map((a) => a.summary).join(" · "),
				ref: `run:${items[0].run}`,
				item: items[0],
				items,
			}),
		),
		...inbox.plans.map(
			(item): NeedsYouItem => ({
				id: `plan:${item.id}`,
				kind: "plan",
				who: "agent",
				by: item.workflow,
				key: item.key,
				title: item.title,
				text: item.title,
				ref: `run:${item.id}`,
				item,
			}),
		),
		...inbox.reviews.map(
			(item): NeedsYouItem => ({
				id: `review:${item.number}:${item.headSha}`,
				kind: "review",
				who: "agent",
				by: "",
				key: `#${item.number}`,
				title: item.title,
				text: item.title,
				ref: item.reference,
				item,
			}),
		),
		...inbox.messages.map(
			(item): NeedsYouItem => ({
				id: `message:${item.run}:${item.n}`,
				kind: "message",
				who: "agent",
				by: item.from || named(item.run),
				key: item.key,
				title: item.title,
				text: item.text,
				ref: `run:${item.run}`,
				item,
			}),
		),
	];
	// The time reminder is its own card: it is not in `items`.
	return { items, loading: raw.loading, timesheet: raw.timesheet };
}

/** Each write reads the Inbox again, also when it fails. */
export function useInboxActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: homeKeys.all });
			}
		};
		return {
			answer: (r: string, id: string, choice: QuestionChoice) =>
				run(commands.questionAnswer(r, id, choice)),
			approve: (id: number) => run(commands.approvalApprove(id)),
			reject: (id: number) => run(commands.approvalReject(id)),
			/** Approves these waiting effects of one run and stores the permission of the recipe for their kinds. */
			allowRecipe: (ids: number[]) => run(commands.approvalsAllowRecipe(ids)),
			planApprove: (r: string) => run(commands.runPlanApprove(r)),
			planReject: (r: string, note: string) => run(commands.runPlanReject(r, note)),
			markRead: (r: string, n: number) => run(commands.messageReadMark(r, n)),
			refresh: () => qc.invalidateQueries({ queryKey: homeKeys.all }),
		};
	}, [qc]);
}

/** The open questions and the approvals of one run: what the run waits for. */
export function useRunWaits(run: string) {
	const qc = useQueryClient();
	useFactoryEvents(() => void qc.invalidateQueries({ queryKey: homeKeys.all }));
	// The view of a run reads again every few seconds: not each change comes with an event.
	const questions = useQuery({
		queryKey: homeKeys.questions,
		queryFn: () => unwrap(commands.questionsList()),
		refetchInterval: 3000,
	});
	const approvals = useQuery({
		queryKey: homeKeys.approvals,
		queryFn: () => unwrap(commands.approvalsList()),
		refetchInterval: 3000,
	});
	return {
		questions: (questions.data ?? []).filter((x) => x.run === run && x.question.state === "open"),
		approvals: (approvals.data ?? []).filter((x) => x.run === run),
	};
}

/**
 * The ids of the notices that still ask for an action, and when the read was. `null` until the
 * three reads are in. The ids match `needsYouNotice`.
 */
export function usePendingNoticeIds(): { live: Set<string>; at: number } | null {
	const poll = { refetchInterval: 3000 };
	const questions = useQuery({
		queryKey: homeKeys.questions,
		queryFn: () => unwrap(commands.questionsList()),
		...poll,
	});
	const approvals = useQuery({
		queryKey: homeKeys.approvals,
		queryFn: () => unwrap(commands.approvalsList()),
		...poll,
	});
	const runs = useQuery({
		queryKey: homeKeys.runs,
		queryFn: () => unwrap(commands.runsList()),
		...poll,
	});
	return useMemo(() => {
		if (!questions.data || !approvals.data || !runs.data) return null;
		const live = new Set([
			...questions.data
				.filter((q) => q.question.state === "open")
				.map((q) => `question:${q.run}:${q.question.id}`),
			...approvals.data.map((a) => `approval:${a.id}`),
			...latestPerTicket(runs.data)
				.filter((r) => r.lane === "needs_you")
				.map((r) => `run:${r.id}:${r.state}`),
		]);
		const at = Math.min(questions.dataUpdatedAt, approvals.dataUpdatedAt, runs.dataUpdatedAt);
		return { live, at };
	}, [
		questions.data,
		approvals.data,
		runs.data,
		questions.dataUpdatedAt,
		approvals.dataUpdatedAt,
		runs.dataUpdatedAt,
	]);
}

/**
 * The "Needs you" entry of a factory event, or null when the thing needs nobody (shell REQ-008).
 * The id names the thing, so the centre shows it once.
 */
export async function needsYouNotice(
	event: FactoryEvent,
	p: FactoryPayload,
	t: Messages,
): Promise<Pick<Notice, "id" | "kind" | "title" | "body" | "detail" | "target"> | null> {
	const kind = "needs-you" as const;
	if (event === "factory-question") {
		const q = (await unwrap(commands.questionsList())).find(
			(x) => x.run === p.run && x.question.id === p.id && x.question.state === "open",
		);
		return q
			? {
					id: `question:${q.run}:${q.question.id}`,
					kind,
					title: format(t.home.notice.question, { key: q.key }),
					body: q.question.question,
					target: noticeTarget({ source: "question", run: q.run, question: q.question.id }),
				}
			: null;
	}
	if (event === "factory-approval") {
		const a = (await unwrap(commands.approvalsList())).find((x) => String(x.id) === p.id);
		return a
			? {
					id: `approval:${a.id}`,
					kind,
					title: format(t.home.notice.approval, { key: a.key }),
					body: a.summary,
					detail: [a.kind, a.detail].filter(Boolean).join("\n"),
					target: noticeTarget({ source: "approval", run: a.run, approval: a.id }),
				}
			: null;
	}
	if (event === "factory-run") {
		const r = await unwrap(commands.runGetOne(p.run));
		const current =
			r && latestPerTicket(await unwrap(commands.runsList())).some((x) => x.id === r.id);
		// A run that stopped says why in the detail.
		const stopped = r?.state === "Failed" || r?.state === "Paused" || r?.state === "Blocked";
		const log = stopped ? await unwrap(commands.runLogPage(p.run, 0, 500)) : null;
		return r?.lane === "needs_you" && current
			? {
					id: `run:${r.id}:${r.state}`,
					kind,
					title: format(t.home.notice.run, { key: r.key }),
					body: r.title,
					detail: log ? stopReason(t.factory.why, r, log.events) : undefined,
					target: noticeTarget({ source: r.state === "PlanReview" ? "plan" : "run", run: r.id }),
				}
			: null;
	}
	return null;
}
