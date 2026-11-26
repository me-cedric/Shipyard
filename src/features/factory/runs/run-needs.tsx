import { useRef, useState } from "react";
import { AgentAsk } from "@/features/flow/feature/agent-ask";
import { DecisionCard } from "@/features/flow/feature/decision-card";
import { StopCard, TicketReply } from "@/features/flow/feature/stop-card";
import { stopAction } from "@/features/flow/stop-action";
import { QuestionRow } from "@/features/home/inbox/inbox";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import { useInboxActions, type useRunWaits } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { PlanBlock, planOf } from "./plan";
import { agentOf, focusRunTitle } from "./run-summary";

/**
 * What waits for the person (REQ-031), one decision at a time: the card of a stopped run (its fact
 * and its one main action, with the question of Reply), else the plan with its note, else the
 * approvals of the run as one decision. While another decision shows, the approvals fold to one
 * button. It shows nothing when nothing waits. `ticket` is false on the ticket page: its Comments
 * card already replies on the ticket.
 */
export function RunNeeds({
	run,
	events,
	waits,
	ticket = true,
	onFiles,
}: {
	run: RunView;
	events: RunLogEvent_Serialize[];
	waits: ReturnType<typeof useRunWaits>;
	ticket?: boolean;
	/** The plan in review: a link to the files that it changes. */
	onFiles?: () => void;
}) {
	const { t } = useI18n();
	const x = t.flow.look.page;
	const act = useRunActions();
	const inbox = useInboxActions();
	const { error, run: guard } = useGuard();
	const [note, setNote] = useState("");
	const changeRow = useRef<HTMLDivElement>(null);
	const [pick, setPick] = useState<boolean | null>(null);
	const id = run.id;
	const plan = planOf(events);
	const action = stopAction(run);
	const planning = run.state === "PlanReview";
	if (!(waits.questions.length || waits.approvals.length || action || planning)) return null;
	const agent = agentOf(run, t.factory.agentNames);
	const folded = pick ?? (action !== null || planning || waits.questions.length > 0);
	const [first] = waits.questions;
	// The card of Reply holds the first question as one plain Answer field; the others are rows below.
	const asked = action === "reply" ? first : undefined;
	const questions = waits.questions
		.filter((q) => q !== asked)
		.map((q) => (
			<div key={`${q.run}:${q.question.id}`} id={`question-${q.question.id}`}>
				<QuestionRow item={q} noRun />
			</div>
		));
	return (
		<section aria-label={t.home.needsYou} className="flex flex-col gap-4">
			{action === "reply" ? (
				<div id={asked ? `question-${asked.question.id}` : undefined}>
					<StopCard
						run={run}
						events={events}
						action={action}
						agent={agent}
						question={asked?.question.question}
						answer={
							asked && {
								options: asked.question.options,
								freeText: asked.question.free_text,
								recommended: asked.question.recommended,
								unclear: asked.question.unclear,
								edited: asked.question.edited,
								// The card keeps the typed text until the answer went out (the guard resolves true).
								onAnswer: (choice) =>
									guard(() => inbox.answer(asked.run, asked.question.id, choice)),
							}
						}
					/>
				</div>
			) : null}
			{questions}
			{action && action !== "reply" ? (
				<StopCard run={run} events={events} action={action} agent={agent} />
			) : null}
			{planning ? (
				<AgentAsk soft agent={agent} who={format(x.plan.has, { agent })} title={x.plan.ask}>
					{plan ? (
						<PlanBlock
							plan={plan}
							onEdit={(n) => {
								setNote(`${n}: `);
								changeRow.current?.querySelector("input")?.focus();
							}}
						/>
					) : null}
					{onFiles ? <LinkButton onClick={onFiles}>{x.plan.files}</LinkButton> : null}
					<div ref={changeRow} className="flex flex-wrap items-center gap-2.5">
						<Input
							label={x.plan.change}
							className="flex-[1_1_200px] scroll-mt-32"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
						<RightButton
							right="runs.approve"
							disabled={!note.trim()}
							onClick={() => void guard(() => act.planReject(id, note))}
						>
							{x.plan.back}
						</RightButton>
						<RightButton
							right="runs.approve"
							variant="primary"
							onClick={() =>
								void guard(() => act.planApprove(id)).then((ok) => ok && focusRunTitle())
							}
						>
							{x.plan.approve}
						</RightButton>
					</div>
				</AgentAsk>
			) : null}
			{waits.approvals.length === 0 ? null : folded ? (
				// One decision at a time: while a question waits, the approvals wait behind it.
				waits.questions.length > 0 ? null : (
					<Button className="w-fit" onClick={() => setPick(false)}>
						{format(t.home.effectsWait, { count: waits.approvals.length })}
					</Button>
				)
			) : (
				<DecisionCard
					approvals={waits.approvals}
					agent={agent}
					summary={plan?.summary.trim().split("\n")[0]}
					onNotYet={() => setPick(true)}
				/>
			)}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{action && ticket ? <TicketReply run={run} /> : null}
		</section>
	);
}
