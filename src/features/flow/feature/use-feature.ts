import { useRuns } from "@/lib/factory";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { featureKey, partsOf, useFeatures } from "../feature";

/** The parts of the open feature: the ref of each one, as the address names it or as `features_list` joins it. */
export type Parts = { ticket?: string; change?: string; run?: string; pr?: string };

/**
 * Finds the feature of the page by the ref of one of its parts (`spec:app-redesign#REQ-012`). A run or a
 * pull request that no feature lists (an older run of the same ticket, a pull request that the mirror
 * lacks) still opens: its own part stands in. A ref that names nothing gives `feature: null`.
 */
export function useFeature(ref: string) {
	const list = useFeatures();
	const runId = ref.startsWith("run:") ? ref.slice(4) : "";
	const runs = useRuns(runId || undefined);
	const found = list.data?.find((f) => partsOf(f).includes(ref) || featureKey(f) === ref);
	const run = runs.data?.find((r) => r.id === runId);
	const stand: Feature | null = run
		? {
				title: run.title,
				stage: "build",
				ticket: null,
				change: null,
				run: ref,
				pr: run.pr?.reference ?? null,
				mark: null,
				who: null,
				runState: run.state,
				approvals: 0,
				questions: 0,
				checks: null,
				stop: run.stop,
			}
		: ref.startsWith("pr:")
			? {
					title: "",
					stage: "review",
					ticket: null,
					change: null,
					run: null,
					pr: ref,
					mark: null,
					who: null,
					runState: null,
					approvals: 0,
					questions: 0,
					checks: null,
					stop: null,
				}
			: null;
	const feature = found ?? stand;
	const part = (kind: keyof Parts, prefix: string): string | undefined =>
		ref.startsWith(prefix) ? ref : (feature?.[kind] ?? undefined);
	const parts: Parts = {
		ticket: part("ticket", "wi:"),
		change: part("change", "change:"),
		run: part("run", "run:"),
		pr: part("pr", "pr:"),
	};
	return {
		feature,
		parts,
		pending: list.isPending || (runId !== "" && runs.isPending),
	};
}
