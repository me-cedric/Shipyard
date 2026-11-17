import { type ReactNode, useRef, useState } from "react";
import { escalationOf, stopReason } from "@/features/factory/runs/run-live";
import { useGuard } from "@/features/work/guard";
import { useRunActions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { openUrl } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { DEFAULT_BUDGET, doStop, type StopAction } from "../stop-action";

/**
 * The card of a stopped run (`spec:app-redesign#REQ-014`, picture 081): the state in plain words, the
 * reason in one sentence, the one main action and the second control of that state. `children` is the
 * answer field of Reply.
 */
export function StopCard({
	run,
	events,
	action,
	children,
}: {
	run: RunView;
	events: RunLogEvent_Serialize[];
	action: StopAction;
	children?: ReactNode;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const s = t.flow.stop;
	const act = useRunActions();
	const { gate } = useRights();
	const { openRef } = useShell();
	const { error, run: guard } = useGuard();
	const [note, setNote] = useState("");
	const [usd, setUsd] = useState(DEFAULT_BUDGET);
	const [kept, setKept] = useState(false);
	const [happened, setHappened] = useState(false);
	const field = useRef<HTMLDivElement>(null);
	// Keep it open: a run blocked with nothing to deliver can still be unblocked.
	const view: StopAction = kept ? "unblock" : action;
	const esc = escalationOf(events);
	const budget = run.budgetUsd ?? null;
	const what = esc ? (
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
	) : null;
	const labels: Record<StopAction, string> = {
		reply: s.reply,
		unblock: f.unblock,
		addBudget: s.addBudget,
		tryAgain: s.tryAgain,
		resume: f.resume,
		closeDone: f.closeDone,
	};
	const go = () =>
		void guard(() =>
			doStop(act, run, view, { usd, note, open: (id) => openRef(`run:${id}`) }),
		).then((ok) => ok && setNote(""));
	const noted = view === "unblock" || view === "addBudget" || view === "resume";
	return (
		<AttentionCard who={s.state[view]} title={stopReason(f.why, run, events)}>
			{(view === "addBudget" || view === "resume") && budget !== null ? (
				<span className="flex w-48 items-center gap-2 text-12 text-n-12">
					<span className="shrink-0">
						${(run.costUsd ?? 0).toFixed(2)} / ${budget.toFixed(2)}
					</span>
					<SpendMeter usd={run.costUsd ?? 0} budget={budget} label={f.cost} />
				</span>
			) : null}
			{view === "tryAgain" ? (happened ? (what ?? <span>{f.why.none}</span>) : null) : what}
			{/* Enter in the note sends the main action. */}
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (view !== "reply") go();
				}}
			>
				{noted ? (
					<Input
						label={f.unblockNote}
						className="max-w-80 min-h-control scroll-mt-32"
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				) : null}
				<div ref={field} className="flex flex-wrap items-center gap-2">
					{view === "reply" ? children : null}
					{view === "addBudget" ? (
						<fieldset
							aria-label={s.budgetAdd}
							className="m-0 flex items-center gap-1 rounded-md border p-0"
						>
							<Button
								variant="ghost"
								className="min-h-control"
								aria-label={s.budgetLess}
								disabled={usd <= 1}
								onClick={() => setUsd(usd - 1)}
							>
								-
							</Button>
							<output className="min-w-10 text-center font-mono text-ui">${usd}</output>
							<Button
								variant="ghost"
								className="min-h-control"
								aria-label={s.budgetMore}
								onClick={() => setUsd(usd + 1)}
							>
								+
							</Button>
						</fieldset>
					) : null}
					{view === "tryAgain" ? (
						<Button
							className="min-h-control"
							aria-expanded={happened}
							onClick={() => setHappened(!happened)}
						>
							{s.whatHappened}
						</Button>
					) : null}
					{view === "resume" ? (
						<ConfirmButton
							className="min-h-control"
							{...gate("runs.start")}
							confirm={format(f.machine.confirmStop, { name: run.key })}
							onConfirm={() => void guard(() => act.cancel(run.id))}
						>
							{s.stopIt}
						</ConfirmButton>
					) : null}
					{/* Only a blocked run can go on: a run whose pull request ended has nothing to keep open. */}
					{action === "closeDone" && !kept && run.state === "Blocked" ? (
						<Button className="min-h-control" onClick={() => setKept(true)}>
							{s.keepOpen}
						</Button>
					) : null}
					{/* A reply on the ticket by a team member also unblocks the run. */}
					{view === "unblock" && run.url ? (
						<Button className="min-h-control" onClick={() => openUrl(run.url)}>
							{f.replyOnTicket}
						</Button>
					) : null}
					{view === "reply" ? (
						<Button
							variant="primary"
							className="min-h-control"
							onClick={() =>
								field.current?.querySelector<HTMLElement>("input, textarea, button")?.focus()
							}
						>
							{s.reply}
						</Button>
					) : (
						<RightButton
							right="runs.start"
							variant="primary"
							className="min-h-control"
							type="submit"
						>
							{labels[view]}
						</RightButton>
					)}
				</div>
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</AttentionCard>
	);
}
