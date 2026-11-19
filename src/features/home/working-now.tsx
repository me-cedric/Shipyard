import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { STAGES, stateText, useFeatures } from "@/features/flow/feature";
import { doStop, type StopAction, stopAction } from "@/features/flow/stop-action";
import { useGuard } from "@/features/work/guard";
import { useDailySpend, useRunActions, useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { RunView_Serialize } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { runHref, useShell } from "@/lib/shell";
import { Avatar } from "@/ui/atoms/avatar";
import { LinkButton, linkClass } from "@/ui/atoms/link-button";
import { StepBar } from "@/ui/atoms/step-bar";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { Row } from "@/ui/molecules/row";
import { useMyItems } from "./stats";

/** The one main action of a stopped run, in one click (`spec:app-redesign#REQ-014`). A reply has its question card. */
function StopButton({
	run,
	guard,
}: {
	run: { id: string; key: string; stop: RunView_Serialize["stop"] };
	guard: ReturnType<typeof useGuard>["run"];
}) {
	const { t } = useI18n();
	const { openRef } = useShell();
	const act = useRunActions();
	const action = stopAction(run);
	if (!action || action === "reply") return null;
	const label: Record<StopAction, string> = {
		reply: t.flow.stop.reply,
		unblock: t.factory.unblock,
		addBudget: t.flow.stop.addBudget,
		tryAgain: t.flow.stop.tryAgain,
		resume: t.factory.resume,
		closeDone: t.factory.closeDone,
	};
	return (
		<RightButton
			right="runs.start"
			variant="primary"
			className="min-h-control"
			aria-label={`${label[action]} ${run.key}`}
			onClick={() =>
				void guard(() => doStop(act, run, action, { open: (id) => openRef(`run:${id}`) }))
			}
		>
			{label[action]}
		</RightButton>
	);
}

/**
 * The live runs of the person (spec:app-redesign#REQ-007, picture 001): one row for each agent that
 * works, with the feature, the stage and the current act, then the link to the flow. More holds
 * the spend of today and the stop of each run.
 */
export function WorkingNow() {
	const { t, lang } = useI18n();
	const stopGate = useRights().gate("runs.start");
	const keys = new Set(useMyItems().map((i) => i.key));
	const live = (useRuns().data ?? []).filter(
		(r) => keys.has(r.key) && (r.lane === "working" || r.lane === "needs_you"),
	);
	const features = useFeatures().data ?? [];
	const { cancel } = useRunActions();
	const { error, run } = useGuard();
	// Every AI tool on this computer, as the menu bar panel shows it.
	const spend = useDailySpend(14);
	const [more, setMore] = useState(false);
	const title = useId();
	return (
		<section aria-labelledby={title} className="rounded-lg bg-surface-2 py-2 shadow-2">
			<h3 id={title} className="px-5 pt-3.5 pb-1.5 font-semibold text-n-12">
				{t.home.workingNow}
			</h3>
			{live.length === 0 ? <p className="px-5 py-3 text-n-11">{t.shell.runsNone}</p> : null}
			{live.map((r) => {
				const feature = features.find((f) => f.run === r.reference);
				// A run with no feature yet is in the build stage: an agent works on it.
				const stage = feature?.stage ?? "build";
				return (
					<Row key={r.id} className="min-h-19 px-5 py-2">
						<Avatar agent name={r.workflow || t.home.agent} />
						<span className="flex min-w-0 flex-col gap-1.5">
							<Link {...runHref(r.id)} className="truncate font-semibold hover:underline">
								{r.title}
							</Link>
							<StepBar
								total={STAGES.length}
								current={STAGES.indexOf(stage) + 1}
								label={`${t.ui.flow.label}: ${t.ui.flow[stage]}`}
							/>
						</span>
						<span className="ml-auto text-n-11">
							{feature ? stateText(t, feature) : t.factory.state[r.state]}
						</span>
						{stopAction(r) ? <StopButton run={r} guard={run} /> : null}
						{more ? (
							<ConfirmButton
								variant="ghost"
								className="min-h-control"
								{...stopGate}
								confirm={format(t.factory.machine.confirmStop, { name: r.key })}
								onConfirm={() => void run(() => cancel(r.id))}
							>
								{format(t.factory.machine.stop, { name: r.key })}
							</ConfirmButton>
						) : null}
					</Row>
				);
			})}
			<div className="flex min-h-12 items-center gap-4 px-5">
				<Link to="/flow/flow" className={linkClass}>
					{t.home.openFlow}
				</Link>
				<LinkButton
					aria-expanded={more}
					aria-label={`${t.ui.more}: ${t.home.workingNow}`}
					className="ml-auto text-n-11"
					onClick={() => setMore(!more)}
				>
					{t.ui.more}
				</LinkButton>
			</div>
			{more ? (
				<p className="flex min-h-control items-center justify-between gap-4 px-5 text-n-11">
					{t.ui.spendToday}
					<span className="font-mono text-n-12">
						{new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(
							spend.today,
						)}
					</span>
				</p>
			) : null}
			{error ? (
				<p role="alert" className="px-5 pb-2 text-danger-text">
					{error}
				</p>
			) : null}
		</section>
	);
}
