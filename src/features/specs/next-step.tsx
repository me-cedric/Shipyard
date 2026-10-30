import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { usePulls } from "@/lib/code";
import { useRunActions, useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc";
import { rememberSelection } from "@/lib/shell/selection";
import { type Change, useChanges, useSpecsActions } from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { useWorkActions, useWorkContext } from "@/lib/work";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { NextStep as NextButton } from "@/ui/molecules/next-step";
import { useGuard } from "./guard";
import { SplitFlow } from "./split";

export type Step = "plan" | "split" | "assign" | "start" | "answer" | "review" | "merge";

/** The kinds that become a plan first: an idea, a question, a decision, a spec or a design item. */
const PLAN = new Set(["q", "adr", "spec", "diagram", "flow", "screen", "api", "data", "model"]);

/**
 * The single next step of a ref along the loop: plan, split, assign, start run, answer, review,
 * merge. `null` when the item has no step left. A plan with the title of the item counts as written.
 */
export function nextStep(
	refId: string,
	facts: {
		plan?: Change | null;
		assigned?: boolean;
		run?: RunState | null;
		pr?: { state: string; draft: boolean } | null;
	},
): Step | null {
	const kind = refId.split(":")[0] ?? "";
	if (PLAN.has(kind)) return facts.plan ? "split" : "plan";
	if (kind === "change") return "split";
	if (kind === "wi") return facts.assigned === false ? "assign" : "start";
	if (kind === "run") {
		if (facts.run === "WaitingForAnswer") return "answer";
		if (facts.run === "PlanReview" || facts.run === "PROpen" || facts.run === "ChangesRequested")
			return "review";
		return null;
	}
	if (kind === "pr") return facts.pr?.state === "open" && !facts.pr.draft ? "merge" : null;
	return null;
}

/** The next-step button of a ref. Each write runs on its click; a page change only navigates. */
export function NextStepAction({ refId, title }: { refId: string; title: string }) {
	const { t } = useI18n();
	const kind = refId.split(":")[0] ?? "";
	const rest = refId.slice(kind.length + 1);
	const router = useRouter({ warn: false });
	const specs = useSpecsActions();
	const work = useWorkActions();
	const runs = useRunActions();
	const { failure, run } = useGuard();
	const [splitting, setSplitting] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const changes = useChanges().data;
	const me = useWorkContext().data?.me ?? null;
	const item = useWorkItems({ text: rest, status: null, assignee: null, label: null }).data?.find(
		(i) => i.key === rest,
	);
	const runState = useRuns().data?.find((r) => r.id === rest.split("/")[0])?.state ?? null;
	const pr = usePulls().data?.find((p) => p.reference === refId) ?? null;
	const plan =
		kind === "change"
			? changes?.find((c) => c.id === rest)
			: changes?.find((c) => c.title.toLowerCase() === title.toLowerCase());
	const step = nextStep(refId, {
		plan,
		assigned: item ? !!item.assignee || !me : undefined,
		run: runState,
		pr,
	});
	if (!step) return null;

	const go = (to: "/specs/changes" | "/home/inbox" | "/factory/runs" | "/code/pull-requests") =>
		void router?.navigate({ to });
	const act = () => {
		setBusy(true);
		void run(async () => {
			if (step === "plan") {
				const c = await specs.createChange(title);
				rememberSelection("specs:changes", c.id);
				go("/specs/changes");
			} else if (step === "split") setSplitting(plan?.id ?? rest);
			else if (step === "assign" && me) await work.assign(rest, me);
			else if (step === "start") {
				await runs.start(rest);
				go("/factory/runs");
			} else if (step === "answer") go("/home/inbox");
			else if (step === "review")
				go(runState === "PlanReview" ? "/factory/runs" : "/code/pull-requests");
			else if (step === "merge") {
				rememberSelection("code:pull-requests", refId);
				go("/code/pull-requests");
			}
		}).finally(() => setBusy(false));
	};

	return (
		<div className="flex flex-col gap-2">
			<NextButton label={t.editing.next[step]} onClick={act} busy={busy} />
			<ErrorNotice error={failure} />
			{splitting ? <SplitFlow change={splitting} onClose={() => setSplitting(null)} /> : null}
		</div>
	);
}
