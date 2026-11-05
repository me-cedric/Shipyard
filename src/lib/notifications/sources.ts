import { format, type Messages } from "@/lib/i18n";
import {
	commands,
	type MyChecks,
	type QualityReport_Serialize,
	type QualityView_Serialize,
	unwrap,
} from "@/lib/ipc";
import type { NoticeInput } from "./index";
import { noticeTarget } from "./targets";

/**
 * The reports that a click made. The page shows their result, so they make no notice. The key is
 * the report, not the click: a scan that starts without a click makes a report with a new time.
 */
const clicked = new Set<string>();
const reportId = (r: QualityReport_Serialize) => `${r.kind}:${r.name}:${r.at}`;

/** Marks the report of a scan or a check that a person started. */
export function markClicked<T extends QualityReport_Serialize>(r: T): T {
	clicked.add(reportId(r));
	return r;
}

/**
 * The entries that no earlier read made. The first read of a session is `quiet`: it records the
 * state that exists at the start and makes no entry.
 */
export function fresh(items: NoticeInput[], seen: Set<string>, quiet: boolean): NoticeInput[] {
	const out = items.filter((i) => !seen.has(i.id));
	for (const i of out) seen.add(i.id);
	return quiet ? [] : out;
}

/**
 * A run that ended, done or failed. `covered` is true when the "needs you" entry of the same
 * failed run was added: the failure then shows once.
 */
export async function runEndedNotice(
	run: string,
	t: Messages,
	covered: boolean,
): Promise<NoticeInput | null> {
	const r = await unwrap(commands.runGetOne(run));
	if (!r || (r.state !== "Done" && r.state !== "Failed")) return null;
	const failed = r.state === "Failed";
	if (failed && covered) return null;
	return {
		id: `run-ended:${r.id}:${r.state}`,
		kind: failed ? "needs-you" : "info",
		title: format(failed ? t.notifications.runFailed : t.notifications.runDone, { key: r.key }),
		body: r.title,
		target: noticeTarget({ source: "run-ended", run: r.id }),
	};
}

/** The checks of the pull requests of the person that ended: one entry for each head and result. */
export function checkNotices(rows: MyChecks[], t: Messages): NoticeInput[] {
	return rows
		.filter((r) => r.ci === "passing" || r.ci === "failing")
		.map((r) => {
			const failed = r.ci === "failing";
			return {
				id: `pr-checks:${r.reference}:${r.headSha}:${r.ci}`,
				kind: failed ? "needs-you" : "info",
				title: format(failed ? t.notifications.checksFailed : t.notifications.checksPassed, {
					number: r.number,
				}),
				body: r.title,
				target: noticeTarget({ source: "pr-checks", ref: r.reference }),
			};
		});
}

/** The scans and checks that failed and that no click started. */
export function scanNotices(view: QualityView_Serialize, t: Messages): NoticeInput[] {
	return [...view.checks, ...view.scanners].flatMap((row) => {
		const r = row.last;
		if (!r || r.passed || clicked.has(reportId(r))) return [];
		return [
			{
				id: `scan-failed:${reportId(r)}`,
				kind: "error" as const,
				title: format(t.notifications.scanFailed, { name: row.label ?? r.name }),
				body: r.tail,
				target: noticeTarget({ source: "scan-failed", name: row.name }),
			},
		];
	});
}

/** An automatic review of a pull request, ready to post. A review that a click started shows on the page. */
export async function reviewDraftNotice(number: string, t: Messages): Promise<NoticeInput | null> {
	const w = (await unwrap(commands.prReviewWaiting())).find((x) => String(x.number) === number);
	const d = w && (await unwrap(commands.prReviewGet(w.number, w.headSha)));
	if (!w || !d?.auto || d.posted) return null;
	return {
		id: `review-draft:${w.number}:${w.headSha}`,
		kind: "needs-you",
		title: format(t.notifications.reviewDraft, { number: w.number }),
		body: w.title,
		target: noticeTarget({ source: "review-draft", ref: w.reference }),
	};
}
