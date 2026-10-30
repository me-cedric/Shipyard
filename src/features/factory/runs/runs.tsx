import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useKillSwitch, useRunActions, useRuns, useUsage } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { Lane, RunState, RunView } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CheckIcon, ChevronLeftIcon, CpuChipIcon, InboxIcon, PlayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel, type PanelTone } from "@/ui/molecules/panel";
import { RunCard } from "@/ui/molecules/run-card";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { SPRING } from "@/ui/motion";
import { ListDetail } from "@/ui/templates/list-detail";
import { progressOf, RunDetail } from "./run-detail";

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
				{ label: f.liveRuns, value: String(live), icon: <LiveDot />, tone: "accent" },
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
	const kill = useKillSwitch().data;
	const act = useRunActions();
	const { error, run: guard } = useGuard();
	const [key, setKey] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const field = useRef<HTMLInputElement>(null);
	const back = useRef<HTMLButtonElement>(null);
	// The sheet covers the lanes: move the focus into it when it opens.
	useEffect(() => {
		if (selected) back.current?.focus();
	}, [selected]);
	if (active === null) return <NoProject title={f.runs} />;
	const all = runs.data ?? [];
	const open = all.find((r) => r.id === selected);
	const start = () =>
		void guard(async () => {
			await act.start(key.trim());
			setKey("");
		});
	return (
		<ListDetail
			title={f.runs}
			icon={<CpuChipIcon size={16} />}
			count={all.length}
			chips={
				<Badge variant={kill ? "danger" : "success"}>
					<StatusDot
						status={kill ? "danger" : "success"}
						label={kill ? f.killOn : f.killOff}
						className="size-2"
					/>
					{kill ? f.killOn : f.killOff}
				</Badge>
			}
			action={
				<span className="flex items-center gap-2">
					<Input
						ref={field}
						label={f.ticket}
						className="max-w-40"
						value={key}
						onChange={(e) => setKey(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && key.trim()) start();
						}}
					/>
					<Button variant="primary" disabled={!key.trim()} onClick={start}>
						<PlayIcon size={14} />
						{f.start}
					</Button>
				</span>
			}
			toolbar={
				error ? (
					<p role="alert" className="w-full text-ui text-danger-text">
						{error}
					</p>
				) : undefined
			}
		>
			{all.length === 0 && !runs.isPending ? (
				<div className="p-4">
					<EmptyState
						layout="cards"
						action={{ label: f.start, onClick: () => field.current?.focus() }}
					/>
				</div>
			) : (
				<>
					<RunStats runs={all} />
					<div className="relative flex min-h-0 flex-1 px-4 pt-3 pb-4">
						<div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
							{LANES.map(([lane, tone]) => {
								const rows = all.filter((r) => r.lane === lane);
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
													selected={selected === r.id}
													onOpen={() => setSelected(r.id)}
													menu={menu("run", {
														open: () => setSelected(r.id),
														"copy-ref": () => copyText(`run:${r.id}`),
													})}
												/>
											);
										})}
									</Panel>
								);
							})}
						</div>
						<AnimatePresence>
							{open ? (
								<motion.aside
									key="run"
									aria-label={open.key}
									initial={{ opacity: 0, y: 16, scale: 0.99 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									exit={{ opacity: 0, y: 16, scale: 0.99 }}
									transition={SPRING.smooth}
									onKeyDown={(e) => {
										if (e.key === "Escape") setSelected(null);
									}}
									className="absolute inset-x-4 top-3 bottom-4 z-10 flex flex-col overflow-hidden rounded-xl border bg-surface-1 shadow-3"
								>
									<div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
										<Button
											ref={back}
											variant="ghost"
											aria-keyshortcuts="Escape"
											onClick={() => setSelected(null)}
										>
											<ChevronLeftIcon size={14} />
											{t.ui.back}
										</Button>
										<span className="font-mono text-12 text-n-11">{open.reference}</span>
									</div>
									<div className="min-h-0 flex-1 overflow-y-auto">
										<div className="mx-auto max-w-6xl p-5">
											<RunDetail key={open.id} id={open.id} />
										</div>
									</div>
								</motion.aside>
							) : null}
						</AnimatePresence>
					</div>
				</>
			)}
		</ListDetail>
	);
}
