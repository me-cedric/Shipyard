import { useState } from "react";
import { StopCard } from "@/features/flow/feature/stop-card";
import { stopAction } from "@/features/flow/stop-action";
import { ApprovalsQuestion, QuestionRow } from "@/features/home/inbox/inbox";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import type { useRunWaits } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { PlanBlock, planOf } from "./plan";

/**
 * What waits for the person, directly under the summary (REQ-031): the questions, the approvals,
 * the plan with its note, and the card of a stopped run (its reason and its one main action). The
 * approvals of the run are one question. It shows nothing when nothing waits. The summary moves the focus here with its one action.
 */
export function RunNeeds({
	run,
	events,
	waits,
}: {
	run: RunView;
	events: RunLogEvent_Serialize[];
	waits: ReturnType<typeof useRunWaits>;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const act = useRunActions();
	const { error, run: guard } = useGuard();
	const [note, setNote] = useState("");
	const [folded, setFolded] = useState(false);
	const id = run.id;
	const plan = planOf(events);
	const action = stopAction(run);
	const planning = run.state === "PlanReview";
	if (!(waits.questions.length || waits.approvals.length || action || planning)) return null;
	const field = "scroll-mt-32";
	const questions = waits.questions.map((x) => (
		<div key={`${x.run}:${x.question.id}`} id={`question-${x.question.id}`}>
			<QuestionRow item={x} noRun />
		</div>
	));
	return (
		<section aria-label={t.home.needsYou} className="flex flex-col gap-3">
			{action === "reply" ? (
				<StopCard run={run} events={events} action={action}>
					{questions}
				</StopCard>
			) : (
				questions
			)}
			{waits.approvals.length === 0 ? null : folded ? (
				<Button className="min-h-control w-fit" onClick={() => setFolded(false)}>
					{format(t.home.effectsWait, { count: waits.approvals.length })}
				</Button>
			) : (
				<ApprovalsQuestion approvals={waits.approvals} noRun onNotYet={() => setFolded(true)} />
			)}
			{action && action !== "reply" ? <StopCard run={run} events={events} action={action} /> : null}
			{planning ? (
				<>
					{plan ? <PlanBlock plan={plan} /> : null}
					<div className="flex flex-wrap items-center gap-2">
						<Input
							label={f.note}
							className={`max-w-40 ${field}`}
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
						<RightButton
							right="runs.approve"
							onClick={() => void guard(() => act.planReject(id, note))}
						>
							{f.planReject}
						</RightButton>
					</div>
				</>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</section>
	);
}
