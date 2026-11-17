import type { ReactNode } from "react";
import type { RunScopeData } from "@/features/factory/runs/run-detail";
import {
	focusRunTitle,
	type Primary,
	primaryOf,
	RunSummary,
} from "@/features/factory/runs/run-summary";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { stopAction } from "../stop-action";

/** The agent card of the side column: the facts of the run, the one action of its state, Talk and Stop (`spec:factory#REQ-030`). */
export function AgentCard({ scope, onTalk }: { scope: RunScopeData; onTalk: () => void }) {
	const { t } = useI18n();
	const f = t.factory;
	const { run, act, guard, openPr, again, active } = scope;
	const id = run.id;
	const primary: Partial<Record<Primary, ReactNode>> = {
		approvePlan: (
			<RightButton
				right="runs.approve"
				className="min-h-control"
				variant="primary"
				onClick={() => void guard(() => act.planApprove(id)).then((ok) => ok && focusRunTitle())}
			>
				{f.planApprove}
			</RightButton>
		),
		openPr: (
			<Button className="min-h-control" variant="primary" onClick={() => openPr(run.pr?.reference)}>
				{f.openPullRequest}
			</Button>
		),
		again: (
			<RightButton right="runs.start" className="min-h-control" variant="primary" onClick={again}>
				{f.why.again}
			</RightButton>
		),
	};
	// A stopped run has its one main action on the card of the Story (`spec:app-redesign#REQ-014`).
	const kind = stopAction(run) ? null : primaryOf(run.state, run.pr !== null);
	return (
		<RunSummary
			run={run}
			events={scope.events}
			live={active}
			primary={kind ? (primary[kind] ?? null) : null}
			onStop={
				active
					? () => void guard(() => act.cancel(id)).then((ok) => ok && focusRunTitle())
					: undefined
			}
			onOpenPr={openPr}
			onTalk={onTalk}
		/>
	);
}
