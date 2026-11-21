import { type ReactNode, useEffect, useState } from "react";
import type { RunScopeData } from "@/features/factory/runs/run-detail";
import {
	agentOf,
	duration,
	focusRunTitle,
	type Primary,
	primaryOf,
	stepperOf,
} from "@/features/factory/runs/run-summary";
import { useSessions } from "@/lib/factory";
import { endOf } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { LinkButton, linkClass } from "@/ui/atoms/link-button";
import { Progress } from "@/ui/atoms/progress";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { stopAction } from "../stop-action";

/** The time the run has worked: it moves each second while the run works (the summary of the run page of before). */
function Elapsed({ start, end, live }: { start?: number; end?: number; live: boolean }) {
	const { lang, t } = useI18n();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!live) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [live]);
	const to = live ? now : end;
	if (start == null || to == null) return null;
	return (
		<span>
			<span className="sr-only">{t.factory.elapsed}: </span>
			<time>{duration(to - start, lang)}</time>
		</span>
	);
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** The states where an agent works: only there can a person pause the run (`runs-recipes` REQ-001). */
const WORKS: RunState[] = ["Planning", "Working", "SelfReview"];

/**
 * The agent card of the side column (`spec:factory#REQ-030`, picture 003): the agent with its AI tool,
 * the cost against the limit, the step, then Talk, the one action of the state and Stop.
 */
export function AgentCard({
	scope,
	onTalk,
	compact,
}: {
	scope: RunScopeData;
	onTalk: () => void;
	/** The ticket page (picture 026): no agent row, equal buttons, and "More actions" for the rest. */
	compact?: boolean;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const x = t.flow.look.page;
	const { gate } = useRights();
	const { run, act, guard, openPr, again, active } = scope;
	const id = run.id;
	const sessions = useSessions().data;
	const agent = agentOf(run);
	const step = stepperOf(run);
	const stepText = format(f.stepOf, { n: step.n, total: step.total });
	const units = run.steps.flatMap((s) => s.units).filter((u) => u.runner !== "");
	const session = units.findLast((u) => u.state === "running") ?? units.at(-1);
	// The model of the session that ran, not the one that the workflow asks for.
	const model = session && sessions?.find((s) => s.run === id && s.step === session.id)?.model;
	const cost = run.costUsd ?? 0;
	const pr = run.pr;
	// The agent ends its turn first: the button waits until the run is paused.
	const [asked, setAsked] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new state ends the wait
	useEffect(() => setAsked(false), [run.state]);
	const primary: Partial<Record<Primary, ReactNode>> = {
		openPr: (
			<Button className="flex-[1_1_120px]" onClick={() => openPr(pr?.reference)}>
				{f.openPullRequest}
			</Button>
		),
		again: (
			<RightButton right="runs.start" className="flex-[1_1_120px]" onClick={again}>
				{compact ? t.flow.stop.tryAgain : f.why.again}
			</RightButton>
		),
	};
	// A stopped run has its one main action on the card of the Story (`spec:app-redesign#REQ-014`).
	const kind = stopAction(run) ? null : primaryOf(run.state, pr !== null);
	return (
		<section
			aria-label={t.flow.feature.agent}
			className="flex flex-col gap-2.5 rounded-lg bg-surface-2 p-5 shadow-2"
		>
			<h2 className="text-13 font-semibold text-n-11">{t.flow.feature.agent}</h2>
			{compact ? null : (
				<p className="flex flex-wrap items-center gap-x-3 text-n-12">
					<Avatar agent name={agent} />
					<span className="font-semibold">{agent}</span>
					{session ? (
						<span className="text-n-11">
							{[runnerName(session.runner), model].filter(Boolean).join(", ")}
						</span>
					) : null}
				</p>
			)}
			{run.budgetUsd === null ? null : (
				<Progress value={cost} max={run.budgetUsd} label={f.cost} over={cost > run.budgetUsd} />
			)}
			<p className="flex flex-wrap justify-between gap-x-3 text-n-12">
				<span>
					{run.budgetUsd === null
						? usd(cost)
						: format(x.spent, { spent: usd(cost), budget: usd(run.budgetUsd) })}
				</span>
				<span className="flex gap-3 text-n-11">
					<Elapsed start={scope.events[0]?.ts ?? undefined} end={endOf(run)} live={active} />
					<fieldset aria-label={stepText} className="m-0 min-w-0 border-0 p-0">
						{stepText}
					</fieldset>
				</span>
			</p>
			<div className="flex flex-wrap gap-2.5">
				{active && !compact ? (
					<Button className="flex-[1_1_120px]" onClick={onTalk}>
						{format(x.talkTo, { agent })}
					</Button>
				) : null}
				{kind ? (primary[kind] ?? null) : compact && stopAction(run) ? primary.again : null}
				{WORKS.includes(run.state) ? (
					<Button
						{...gate("runs.start")}
						className="flex-[1_1_80px]"
						disabled={asked || gate("runs.start").disabled}
						onClick={() =>
							void guard(() => act.pause(id)).then((ok) => (ok ? setAsked(true) : undefined))
						}
					>
						{t.factory.runsRecipes.pause}
					</Button>
				) : null}
				{active ? (
					<ConfirmButton
						{...gate("runs.start")}
						className="flex-[1_1_80px]"
						confirm={format(f.machine.confirmStop, { name: run.title })}
						onConfirm={() => void guard(() => act.cancel(id)).then((ok) => ok && focusRunTitle())}
					>
						{f.kill}
					</ConfirmButton>
				) : null}
			</div>
			{compact ? <LinkButton onClick={onTalk}>{x.moreActions}</LinkButton> : null}
			{pr ? (
				<a
					href="/code/now"
					onClick={(e) => {
						e.preventDefault();
						openPr(pr.reference);
					}}
					className={linkClass}
				>
					{format(f.pullRequest, { n: `#${pr.number}` })}
				</a>
			) : null}
		</section>
	);
}
