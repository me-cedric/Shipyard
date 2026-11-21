import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { focusOnRunPage } from "@/features/factory/runs/run-summary";
import { format, type Messages } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize as Feature, Stage } from "@/lib/ipc/bindings";
import { showAnchor } from "@/lib/notifications/targets";
import type { Section } from "./sections";
import { stopAction } from "./stop-action";

export { SECTIONS, type Section, sectionOfRef } from "./sections";

export const STAGES: Stage[] = ["idea", "spec", "build", "review", "ready"];

/** The same cache as the Ask bar: each feature of the project once. */
export const useFeatures = () =>
	useQuery({ queryKey: ["features", "list"], queryFn: () => unwrap(commands.featuresList()) });

/** The key of a feature in a list: its first part. */
export const featureKey = (f: Feature) => f.ticket ?? f.change ?? f.run ?? f.pr ?? f.title;

/** The id of a feature in its address: the ref of its first part (the brief, decision 1). */
export const featureId = featureKey;

/** The refs of the parts of a feature. */
export const partsOf = (f: Feature) =>
	[f.ticket, f.change, f.run, f.pr].filter((x) => !!x) as string[];

/** Where a card opens: the feature page (`spec:app-redesign#REQ-012`), on a section when one is named. */
export const featureHref = (f: Feature, section?: Section) => ({
	to: "/flow/feature/$featureId" as const,
	params: { featureId: featureId(f) },
	search: section ? { section } : {},
});

/** The control of the feature page that takes the focus when a card opens a run that waits for a person. */
function waitOf(f: Feature): { focus: string; anchor?: string } | undefined {
	if (f.runState === "WaitingForAnswer")
		return { focus: '[id^="question-"] input, [id^="question-"] button' };
	if (f.runState === "PlanReview") return { focus: "#plan", anchor: "plan" };
	if (f.runState === "Blocked" || f.runState === "Paused") return { focus: "form input" };
	if (f.approvals > 0) return { focus: '[id^="approval-"] button' };
}

/** Opens a feature at the address of `featureHref`, and moves the focus to what its run waits for. */
export function useOpenFeature() {
	const navigate = useNavigate();
	return (f: Feature) => {
		// The back link of the feature page names Flow when it goes back there.
		void navigate({ ...featureHref(f), state: (prev) => ({ ...prev, from: "flow" }) });
		const wait = waitOf(f);
		if (wait) {
			showAnchor(wait.anchor);
			focusOnRunPage(wait.focus);
		}
	};
}

/** A person must act: the mark says so, or an approval or a question waits. */
export const needsPerson = (f: Feature) =>
	f.mark === "needs_you" ||
	f.mark === "blocked" ||
	f.approvals > 0 ||
	f.questions > 0 ||
	stopAction(f) !== null;

/** The state of a feature in plain words. A person's duty comes first, then the run, then the checks. */
export function stateText(t: Messages, f: Feature): string {
	const s = t.flow.state;
	const checks = { failing: s.checksFail, passing: s.ready, pending: s.checksRun };
	if (f.runState === "WaitingForAnswer" || f.questions > 0) return s.answer;
	if (f.approvals > 0)
		return f.approvals === 1 ? s.approveOne : format(s.approveMany, { count: f.approvals });
	switch (f.runState) {
		case "PlanReview":
			return s.reviewPlan;
		case "Blocked":
			return s.blocked;
		case "Paused":
			return f.stop === "add_budget" ? s.budget : s.paused;
		case "Failed":
			return s.failed;
		case "Cancelled":
			return s.stopped;
		case "SelfReview":
			return s.reads;
		case "Queued":
		case "Claimed":
		case "RetryQueued":
			return s.waits;
		case "Planning":
		case "Working":
			return s.working;
		case "ChangesRequested":
			return s.changes;
		case "Merged":
		case "Done":
			return s.done;
		case "PROpen":
			return (f.checks && checks[f.checks]) ?? s.open;
		default:
			if (f.pr) return (f.checks && checks[f.checks]) ?? s.open;
			return f.stage === "ready" ? s.done : s.idle;
	}
}

declare module "@tanstack/react-router" {
	interface HistoryState {
		/** The place that opened a feature page: its back link names it (`src/features/flow/feature/feature-page.tsx`). */
		from?: "flow";
	}
}
