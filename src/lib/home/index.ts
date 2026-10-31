import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef } from "react";
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

const THURSDAY = 4;
const localDay = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Timesheet day" shows on Thursday. It is one item, until a time entry of that day exists. */
export function timesheetDue(now: Date, loggedDays: string[]): boolean {
	return now.getDay() === THURSDAY && !loggedDays.includes(localDay(now));
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
		enabled: now.getDay() === THURSDAY,
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
		plans: (runs.data ?? []).filter((r) => r.state === "PlanReview"),
		messages: messages.data ?? [],
		reviews: reviews.data ?? [],
	};
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
			planApprove: (r: string) => run(commands.runPlanApprove(r)),
			planReject: (r: string, note: string) => run(commands.runPlanReject(r, note)),
			markRead: (r: string, n: number) => run(commands.messageReadMark(r, n)),
			refresh: () => qc.invalidateQueries({ queryKey: homeKeys.all }),
		};
	}, [qc]);
}

/**
 * The "Needs you" entry of a factory event, or null when the thing needs nobody (shell REQ-008).
 * The id names the thing, so the centre shows it once.
 */
export async function needsYouNotice(
	event: FactoryEvent,
	p: FactoryPayload,
	t: Messages,
): Promise<Pick<Notice, "id" | "kind" | "title" | "body"> | null> {
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
				}
			: null;
	}
	if (event === "factory-run") {
		const r = await unwrap(commands.runGetOne(p.run));
		return r?.lane === "needs_you"
			? {
					id: `run:${r.id}:${r.state}`,
					kind,
					title: format(t.home.notice.run, { key: r.key }),
					body: r.title,
				}
			: null;
	}
	return null;
}
