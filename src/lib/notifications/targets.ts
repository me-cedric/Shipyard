/** Where a notice leads: a page or a ref (it opens in the inspector). `anchor` is the id of the block to show. */
export type NoticeTarget = ({ route: string } | { ref: string }) & { anchor?: string };

/** What a notice is about. One case for each source that the app emits. */
export type NoticeWhere =
	| { source: "question"; run: string; question: string }
	| { source: "approval"; run: string; approval: number | string }
	| { source: "run" | "run-ended" | "plan"; run: string }
	| { source: "pr-checks" | "review-draft"; ref?: string | null }
	| { source: "scan-failed"; name: string }
	| { source: "sync-failure" }
	| { source: "remote-head" }
	| { source: "update" };

/**
 * The one place that maps a source to its target. `undefined`: the notice stays plain text (the
 * update notice has its own Open button).
 */
export function noticeTarget(w: NoticeWhere): NoticeTarget | undefined {
	switch (w.source) {
		case "question":
			return { ref: `run:${w.run}`, anchor: `question-${w.question}` };
		case "approval":
			return { ref: `run:${w.run}`, anchor: `approval-${w.approval}` };
		case "plan":
			return { ref: `run:${w.run}`, anchor: "plan" };
		case "run":
		case "run-ended":
			return { ref: `run:${w.run}` };
		case "pr-checks":
		case "review-draft":
			return w.ref ? { ref: w.ref } : { route: "/code/pull-requests" };
		case "scan-failed":
			return { route: "/code/quality", anchor: `check-${w.name}` };
		case "sync-failure":
			return { route: "/settings/project", anchor: "issue-tracker" };
		case "remote-head":
			return { route: "/code/branches" };
		case "update":
			return undefined;
	}
}

/** Scrolls to the block of a target once it is on the page. It waits up to 2 s: a drawer or a page needs a moment to mount. */
export function showAnchor(anchor: string | undefined, tries = 20) {
	if (!anchor) return;
	const el = document.getElementById(anchor);
	if (el) el.scrollIntoView?.({ block: "center" });
	else if (tries > 0) setTimeout(() => showAnchor(anchor, tries - 1), 100);
}
