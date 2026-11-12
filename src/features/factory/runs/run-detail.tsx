import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { ENDED, useRunActions, useRunDiff, useRunLog, useRuns, useWorkflow } from "@/lib/factory";
import { useRunWaits } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { RunView } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { RunGraph } from "@/ui/organisms/run-graph";
import { RunChanges } from "./run-changes";
import { EventRows, isImportant, LiveLine, nameOf } from "./run-live";
import { RunNeeds } from "./run-needs";
import { type Primary, primaryOf, RunSummary } from "./run-summary";
import { RunUnits } from "./run-units";
import { UnitTranscript } from "./unit-chat";

/** The steps done out of all steps, and the step that works now. */
export function progressOf(run: RunView) {
	const running = run.steps.find((s) => s.state === "running");
	return {
		done: run.steps.filter((s) => s.state === "done").length,
		total: run.steps.length,
		agent: running?.id,
		live: running !== undefined,
	};
}

export type RunTab = "activity" | "changes" | "workflow";

/** More events than this open on Important. */
const MANY_EVENTS = 20;

/**
 * The run page (factory REQ-027, REQ-028; ux-declutter REQ-029 to REQ-033): a summary that stays in
 * view with the one action of the state, what waits for the person, then three tabs.
 * `tab` and `onTab` keep the open tab in the address.
 * `unit` is the session that the Workflow tab scrolls to and focuses. `onStarted` gets the id of a run that Start again made.
 */
export function RunDetail({
	id,
	tab,
	onTab,
	unit,
	onStarted,
}: {
	id: string;
	tab: RunTab;
	onTab: (tab: RunTab) => void;
	unit?: string;
	onStarted?: (id: string) => void;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const run = useRuns(id).data?.find((r) => r.id === id);
	const workflow = useWorkflow(run?.workflow ?? "").data;
	const diff = useRunDiff(id).data ?? [];
	const active = run !== undefined && !ENDED.includes(run.state);
	const log = useRunLog(id, active);
	const waits = useRunWaits(id);
	// A live run shows its newest event: read each page until the last one.
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
	useEffect(() => {
		if (active && hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [active, hasNextPage, isFetchingNextPage, fetchNextPage]);
	const act = useRunActions();
	const { openRef } = useShell();
	const router = useRouter({ warn: false });
	const { error, run: guard } = useGuard();
	const needs = useRef<HTMLDivElement>(null);
	const [pick, setPick] = useState<"important" | "all" | null>(null);
	if (!run) return null;
	const events = log.events;
	const filter = pick ?? (events.length > MANY_EVENTS ? "important" : "all");
	const shown = filter === "important" ? events.filter(isImportant) : events;
	const session = run.steps
		.flatMap((s) => s.units)
		.find((u) => u.state === "running" && u.runner !== "");
	const focusIn = (selector: string) =>
		needs.current?.querySelector<HTMLElement>(selector)?.focus();
	const openPr = (reference?: string) => {
		if (reference) rememberSelection("code:pull-requests", reference);
		void router?.navigate({ to: "/code/pull-requests" });
	};
	const again = () =>
		void guard(async () => {
			const started = await act.start(run.key);
			if (onStarted) onStarted(started);
			else openRef(`run:${started}`);
		});
	const primary: Record<Primary, ReactNode> = {
		answer: (
			<Button
				variant="primary"
				onClick={() => focusIn('[id^="question-"] input, [id^="question-"] button')}
			>
				{f.answer}
			</Button>
		),
		approvePlan: (
			<RightButton
				right="runs.approve"
				variant="primary"
				onClick={() => void guard(() => act.planApprove(id))}
			>
				{f.planApprove}
			</RightButton>
		),
		unblock: (
			<Button variant="primary" onClick={() => focusIn("form input")}>
				{f.unblock}
			</Button>
		),
		resume: (
			<Button variant="primary" onClick={() => focusIn("form input")}>
				{f.resume}
			</Button>
		),
		openPr: (
			<Button variant="primary" onClick={() => openPr(run.pr?.reference)}>
				{f.openPullRequest}
			</Button>
		),
		again: (
			<RightButton right="runs.start" variant="primary" onClick={again}>
				{f.why.again}
			</RightButton>
		),
	};
	const kind = primaryOf(run.state, run.pr !== null);
	return (
		<div className="flex flex-col gap-4">
			<RunSummary
				run={run}
				events={events}
				live={active}
				primary={kind ? primary[kind] : null}
				onStop={active ? () => void guard(() => act.cancel(id)) : undefined}
				onOpenPr={openPr}
			/>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div ref={needs} className="contents">
				<RunNeeds run={run} events={events} waits={waits} />
			</div>
			<ViewTabs
				label={f.runViews}
				value={tab}
				onValueChange={onTab}
				tabs={[
					{ value: "activity", label: f.tabActivity },
					{
						value: "changes",
						label: diff.length ? `${f.tabChanges} (${diff.length})` : f.tabChanges,
					},
					{ value: "workflow", label: f.workflow },
				]}
			/>
			{tab === "activity" ? (
				<div role="tabpanel" aria-label={f.tabActivity} className="flex flex-col gap-4">
					{active ? <LiveLine run={run} events={events} /> : null}
					{run.state === "RetryQueued" && run.reason ? (
						<p role="status" className="text-ui text-n-11">
							{format(f.why.stop, { text: run.reason })}
						</p>
					) : null}
					{session ? (
						<div className="overflow-hidden rounded-lg border bg-surface-1">
							<UnitTranscript
								events={events.filter((e) => e.step === session.id)}
								ticket={run.key}
								running
							/>
						</div>
					) : null}
					<Panel
						title={f.log}
						count={shown.length}
						flush
						toolbar={
							<div className="w-44">
								<Segmented
									label={f.eventsShow}
									value={filter}
									onValueChange={setPick}
									items={[
										{ value: "important", label: f.eventsImportant },
										{ value: "all", label: f.eventsAll },
									]}
								/>
							</div>
						}
					>
						<EventRows events={shown} ticket={run.key} />
						{log.hasNextPage ? (
							<div className="border-t p-2">
								<Button variant="ghost" onClick={() => void log.fetchNextPage()}>
									{f.more}
								</Button>
							</div>
						) : null}
					</Panel>
				</div>
			) : null}
			{tab === "changes" ? (
				<div role="tabpanel" aria-label={f.tabChanges}>
					<RunChanges run={run} diff={diff} />
				</div>
			) : null}
			{tab === "workflow" ? (
				<div role="tabpanel" aria-label={f.workflow} className="flex flex-col gap-4">
					<StatStrip
						items={[
							{ label: f.tokens, value: run.tokens.toLocaleString(), tone: "accent" },
							{ label: f.turns, value: String(run.turns), tone: "accent" },
						]}
					/>
					{workflow ? (
						<>
							<h2 className="text-14 font-medium text-n-12">{nameOf(run.workflow)}</h2>
							<RunGraph
								label={f.workflow}
								steps={workflow.steps.map((s) => {
									const live = run.steps.find((x) => x.id === s.id);
									return {
										id: s.id,
										name: nameOf(s.id),
										needs: s.needs ?? [],
										state: live?.state ?? "pending",
										units: s.for_each ? live?.units.length : undefined,
									};
								})}
							/>
						</>
					) : null}
					<RunUnits run={run} events={events} unit={unit} />
				</div>
			) : null}
		</div>
	);
}
