import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { runnerKeys } from "@/features/settings/connections/keys";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { useOpenSetting } from "@/lib/errors";
import { useRunActions, useRuns, useUsage } from "@/lib/factory";
import { latestPerTicket } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { AppFailure, commands, type Lane, type RunState, type RunView, unwrap } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { runHref, useFormIntent } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { LiveDot } from "@/ui/atoms/live-dot";
import { CheckIcon, CpuChipIcon, InboxIcon, PlayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { Panel, type PanelTone } from "@/ui/molecules/panel";
import { RunCard } from "@/ui/molecules/run-card";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { Terms } from "@/ui/molecules/term";
import { ListDetail } from "@/ui/templates/list-detail";
import { AgentsToggle } from "../agents-toggle";
import { TicketPicker } from "../ticket-picker";
import { progressOf } from "./run-detail";

const LANES: [Lane, PanelTone][] = [
	["queued", "neutral"],
	["working", "accent"],
	["needs_you", "warning"],
	["in_review", "info"],
	["ready_to_merge", "success"],
	["done", "neutral"],
];
const WON: RunState[] = ["Merged", "Done"];
const LOST: RunState[] = ["Failed", "Cancelled"];
const ENDED: RunState[] = [...WON, ...LOST];
const TREND_DAYS = 14;

/** The four figures of the factory: live runs, runs that need you, spend today and success rate. */
function RunStats({ runs }: { runs: RunView[] }) {
	const { t, lang } = useI18n();
	const f = t.factory;
	// Newest day first, keyed by the UTC day.
	const days = useUsage().data?.days ?? [];
	const today = new Date().toISOString().slice(0, 10);
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	const won = runs.filter((r) => WON.includes(r.state)).length;
	const ended = won + runs.filter((r) => LOST.includes(r.state)).length;
	const live = runs.filter((r) => progressOf(r).live).length;
	return (
		<StatStrip
			className="px-4"
			items={[
				{
					label: f.liveRuns,
					value: String(live),
					icon: <LiveDot idle={live === 0} />,
					tone: "accent",
				},
				{
					label: f.lane.needs_you,
					value: String(runs.filter((r) => r.lane === "needs_you").length),
					icon: <InboxIcon size={12} />,
					tone: "warning",
				},
				{
					label: t.ui.spendToday,
					value: money.format(days.find((d) => d.key === today)?.usd ?? 0),
					icon: <span className="font-mono text-11">$</span>,
					tone: "info",
					trend: days
						.slice(0, TREND_DAYS)
						.reverse()
						.map((d) => d.usd ?? 0),
				},
				{
					label: f.successRate,
					value: ended ? `${Math.round((won / ended) * 100)} %` : "-",
					icon: <CheckIcon size={12} />,
					tone: "success",
					delta: `${won}/${ended}`,
				},
			]}
		/>
	);
}

/** Factory / Runs: six lanes of runs, the kill switch and one action, start a run (factory REQ-027, REQ-038). */
export function Runs() {
	const { t } = useI18n();
	const menu = useMenus();
	const f = t.factory;
	const active = useActiveProject().data;
	const runs = useRuns();
	const act = useRunActions();
	const openSetting = useOpenSetting();
	// The same cache as Settings / Connections. While it loads, the page shows the usual empty state.
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	}).data;
	const { failure, run: guard } = useGuard();
	const [key, setKey] = useState("");
	const navigate = useNavigate();
	const open = (id: string) => void navigate(runHref(id));
	const field = useRef<HTMLInputElement>(null);
	useFormIntent("run", () => field.current?.focus());
	// A ticket with a run that has not ended cannot start another one: the run, by ticket key.
	const running = useMemo(
		() =>
			new Map((runs.data ?? []).filter((r) => !ENDED.includes(r.state)).map((r) => [r.key, r.id])),
		[runs.data],
	);
	const skip = useMemo(() => new Set(running.keys()), [running]);
	if (active === undefined) return <Loading title={f.runs} icon={<CpuChipIcon size={16} />} />;
	if (active === null) return <NoProject title={f.runs} icon={<CpuChipIcon size={16} />} />;
	const all = runs.data ?? [];
	const board = latestPerTicket(all);
	const start = () =>
		void guard(async () => {
			await act.start(key.trim());
			setKey("");
		});
	// The refusal of a ticket that has a run links to that run.
	const taken =
		failure instanceof AppFailure && failure.code === "run_active"
			? running.get(key.trim())
			: undefined;
	return (
		<ListDetail
			title={f.runs}
			icon={<CpuChipIcon size={16} />}
			count={board.length}
			chips={<AgentsToggle />}
			action={
				<span className="flex items-center gap-2">
					<TicketPicker
						ref={field}
						label={f.ticket}
						className="w-56"
						value={key}
						onChange={setKey}
						onSubmit={start}
						skip={skip}
					/>
					<RightButton right="runs.start" variant="primary" disabled={!key.trim()} onClick={start}>
						<PlayIcon size={14} />
						{f.start}
					</RightButton>
				</span>
			}
			toolbar={
				taken ? (
					<p role="alert" className="flex w-full items-center gap-2 text-ui text-danger-text">
						{format(f.runActive, { key: key.trim() })}
						<Button onClick={() => open(taken)}>{f.openRun}</Button>
					</p>
				) : failure ? (
					<ErrorNotice error={failure} className="w-full" />
				) : undefined
			}
		>
			{all.length === 0 && !runs.isPending ? (
				<div className="p-4">
					{runners && !runners.some((r) => r.state === "detected") ? (
						<EmptyState
							title={<Terms>{t.glossary.noRunner}</Terms>}
							icon={<CpuChipIcon size={28} />}
							action={{
								label: t.glossary.setUpRunner,
								onClick: () => openSetting("/settings/connections#connections-runner"),
							}}
						/>
					) : (
						<EmptyState
							title={t.empty.runs}
							action={{ label: f.start, onClick: () => field.current?.focus() }}
						/>
					)}
				</div>
			) : (
				<>
					<RunStats runs={board} />
					<div className="relative flex min-h-0 flex-1 px-4 pt-3 pb-4">
						<div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
							{LANES.map(([lane, tone]) => {
								const rows = board.filter((r) => r.lane === lane);
								return (
									<Panel
										key={lane}
										title={f.lane[lane]}
										count={rows.length}
										tone={tone}
										className="w-72 shrink-0"
										bodyClassName="min-h-0 flex-1 overflow-y-auto"
									>
										{rows.map((r) => {
											const p = progressOf(r);
											return (
												<RunCard
													key={r.id}
													itemKey={r.key}
													title={r.title}
													state={r.state}
													workflow={r.workflow}
													agent={p.agent}
													live={p.live}
													steps={p.total ? { done: p.done, total: p.total } : undefined}
													costUsd={r.costUsd}
													budgetUsd={r.budgetUsd}
													questions={r.openQuestions}
													approvals={r.approvals}
													pr={lane === "in_review" || lane === "ready_to_merge" ? r.pr : null}
													onOpen={() => open(r.id)}
													menu={menu("run", {
														open: () => open(r.id),
														"copy-ref": () => copyText(`run:${r.id}`),
													})}
												/>
											);
										})}
									</Panel>
								);
							})}
						</div>
					</div>
				</>
			)}
		</ListDetail>
	);
}
