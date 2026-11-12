import { useState } from "react";
import { ApprovalRow, QuestionRow } from "@/features/home/inbox/inbox";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import type { useRunWaits } from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { openUrl } from "@/lib/menus";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { PlanBlock, planOf } from "./plan";
import { escalationOf, lastBlock, stopReason } from "./run-live";

const STOPPED = ["Failed", "Paused", "Blocked"];

/**
 * What waits for the person, directly under the summary (REQ-031): the questions, the approvals,
 * the plan with its note, and the reason that a run stopped with the form that restarts it. It shows
 * nothing when nothing waits. The summary moves the focus here with its one action.
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
	const [add, setAdd] = useState("");
	const [message, setMessage] = useState("");
	const id = run.id;
	const plan = planOf(events);
	const esc = escalationOf(events);
	const budget = run.budgetUsd ?? null;
	const stopped = STOPPED.includes(run.state);
	const planning = run.state === "PlanReview";
	if (!(waits.questions.length || waits.approvals.length || stopped || planning)) return null;
	const reason = stopReason(f.why, run, events);
	const field = "scroll-mt-32";
	return (
		<section aria-label={t.home.needsYou} className="flex flex-col gap-3">
			{waits.questions.map((x) => (
				<div key={`${x.run}:${x.question.id}`} id={`question-${x.question.id}`}>
					<QuestionRow item={x} noRun />
				</div>
			))}
			{waits.approvals.map((a) => (
				<div key={a.id} id={`approval-${a.id}`}>
					<ApprovalRow approval={a} noRun />
				</div>
			))}
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
			{stopped ? (
				<div
					role="status"
					className="flex flex-col gap-2 rounded-lg border bg-surface-1 p-3 text-ui text-n-12"
				>
					<span>{reason}</span>
					{esc ? (
						<div className="flex flex-col gap-1.5 text-n-11">
							{esc.lines.length > 0 ? (
								<details className="text-12">
									<summary className="w-fit cursor-pointer select-none rounded-sm focus-visible:shadow-glow">
										{f.why.lastLines}
									</summary>
									<pre className="overflow-x-auto font-mono text-11 whitespace-pre-wrap">
										{esc.lines.join("\n")}
									</pre>
								</details>
							) : null}
							<span>
								{f.why.tried}: {esc.tried}
							</span>
						</div>
					) : null}
					{run.state === "Blocked" ? (
						<form
							className="flex flex-wrap items-center gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								void guard(async () => {
									await act.unblock(id, message);
									setMessage("");
								});
							}}
						>
							<Input
								label={f.unblockNote}
								className={`w-64 ${field}`}
								value={message}
								onChange={(e) => setMessage(e.target.value)}
							/>
							<RightButton right="runs.start" type="submit" variant="primary">
								{f.unblock}
							</RightButton>
							{esc?.cause === "nothing_to_deliver" ||
							lastBlock(events)?.startsWith("nothing to deliver") ? (
								<RightButton right="runs.start" onClick={() => void guard(() => act.closeDone(id))}>
									{f.closeDone}
								</RightButton>
							) : null}
							{/* A reply on the ticket by a team member also unblocks the run. */}
							{run.url ? <Button onClick={() => openUrl(run.url)}>{f.replyOnTicket}</Button> : null}
						</form>
					) : null}
					{run.state === "Paused" ? (
						<form
							className="flex flex-wrap items-center gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								void guard(async () => {
									await act.resume(id, add.trim() === "" ? null : Number(add), message);
									setMessage("");
								});
							}}
						>
							{budget === null ? null : (
								<span className="flex w-48 items-center gap-2 text-12 text-n-12">
									<span className="shrink-0">
										${(run.costUsd ?? 0).toFixed(2)} / ${budget.toFixed(2)}
									</span>
									<SpendMeter usd={run.costUsd ?? 0} budget={budget} label={f.cost} />
								</span>
							)}
							<Input
								label={f.addBudget}
								inputMode="decimal"
								className={`w-40 ${field}`}
								value={add}
								onChange={(e) => setAdd(e.target.value)}
							/>
							<Input
								label={f.unblockNote}
								className={`w-64 ${field}`}
								value={message}
								onChange={(e) => setMessage(e.target.value)}
							/>
							<RightButton right="runs.start" type="submit" variant="primary">
								{f.resume}
							</RightButton>
						</form>
					) : null}
				</div>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</section>
	);
}
