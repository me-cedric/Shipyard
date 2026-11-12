import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { useGuard } from "@/features/work/guard";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useDailySpend, useRunActions, useRuns } from "@/lib/factory";
import { useInbox } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { usePrefs } from "@/lib/prefs";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useWorkItems } from "@/lib/sync";
import { memberName, useTeam, useWorkActions, useWorkContext } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Select } from "@/ui/atoms/select";
import { Sparkline } from "@/ui/atoms/sparkline";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, ClockIcon } from "@/ui/icons";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { RUN_STATUS } from "@/ui/molecules/run-card";
import { TicketRow, type WorkCategory } from "@/ui/molecules/ticket-row";
import { Timeline, TimelineItem } from "@/ui/molecules/timeline";
import { eventSentence } from "./event-sentence";
import { NeedsYou, needsYouTotal } from "./inbox/inbox";
import { RolePanels } from "./role-panels";
import { useMyItems } from "./stats";

const SHOWN = 20;
const TREND_DAYS = 14;
const WEEK = 7 * 24 * 3600 * 1000;
// shortcut: one page of 50 events for each run, so a very long run misses its newest events; upgrade with a log tail command.
const PAGE = 50;

/** The time of the last visit of Today. It moves to now after the first render, so this visit still shows what was new. */
function useLastVisit() {
	const { todaySeen, setPrefs, loaded } = usePrefs();
	const since = useRef<number | null>(null);
	// The pref holds seconds; the events hold milliseconds.
	if (loaded && since.current === null) since.current = todaySeen * 1000;
	// biome-ignore lint/correctness/useExhaustiveDependencies: write once, when the prefs are read
	useEffect(() => {
		if (loaded) setPrefs({ todaySeen: Math.floor(Date.now() / 1000) });
	}, [loaded]);
	return since.current;
}

/** One ticket of the person: the row opens the ticket; the status and Start run sit in the row. */
function MyTicket({ itemKey, statuses }: { itemKey: string; statuses: string[] }) {
	const { t } = useI18n();
	const menu = useMenus();
	const { openDetail } = useShell();
	const members = useTeam().data?.team.members ?? [];
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const caps = useWorkContext().data?.capabilities;
	const act = useWorkActions();
	const runs = useRunActions();
	const { error, run } = useGuard();
	const edit = useRights().gate("work.edit");
	if (!item) return null;
	const open = () => openDetail(item.key, <TicketDetail key={item.key} itemKey={item.key} />);
	return (
		<div className="border-b last:border-b-0">
			<div className="flex items-center gap-2 pr-3">
				<div className="min-w-0 flex-1">
					<TicketRow
						itemKey={item.key}
						title={item.title}
						status={item.status}
						category={item.category as WorkCategory}
						assignee={memberName(members, item.member)}
						claimed={item.claimed ? t.sync.runState.Claimed : undefined}
						onOpen={open}
						menu={menu("ticket", {
							open,
							"copy-ref": () => copyText(`wi:${item.key}`),
						})}
					/>
				</div>
				<Select
					label={`${t.sync.backlog.status} ${item.key}`}
					value={item.status}
					disabled={!caps?.transitions || edit.disabled}
					reason={
						edit.reason ??
						(caps?.transitions
							? undefined
							: caps
								? format(t.work.missing, { name: t.connections.flag.transitions })
								: t.work.noTracker)
					}
					onValueChange={(to) => void run(() => act.transition(item.key, to))}
					items={statuses.map((s) => ({ value: s, label: s }))}
				/>
				<RightButton
					right="runs.start"
					aria-label={`${t.factory.start} ${item.key}`}
					onClick={() => void run(() => runs.start(item.key))}
				>
					{t.factory.start}
				</RightButton>
			</div>
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}

/**
 * Home / Today: what to do now (home-today REQ-001 to REQ-006). Needs you, my tickets by state, my
 * agents and what happened on my tickets and runs since the last visit. A section with nothing hides.
 * `start` shows under the header: the Get started steps of a new project.
 */
export function Today({ start }: { start?: ReactNode }) {
	const { t, lang } = useI18n();
	const d = t.home.today;
	const qc = useQueryClient();
	const navigate = useNavigate();
	const stopGate = useRights().gate("runs.start");
	const { openRef } = useShell();
	const inbox = useInbox();
	const members = useTeam().data?.team.members ?? [];
	const all = useWorkItems({}).data ?? [];
	const mine = useMyItems();
	const keys = new Set(mine.map((i) => i.key));
	const myRuns = (useRuns().data ?? []).filter((r) => keys.has(r.key));
	const live = myRuns.filter((r) => r.lane === "working" || r.lane === "needs_you");
	const { cancel } = useRunActions();
	const { error, run } = useGuard();
	const since = useLastVisit();
	// Every AI tool on this computer, as the menu bar panel shows it.
	const spend = useDailySpend(TREND_DAYS);
	const logs = useQueries({
		queries: myRuns.map((r) => ({
			queryKey: ["home", "activity", r.id] as const,
			queryFn: () => unwrap(commands.runLogPage(r.id, 0, PAGE)),
		})),
	});
	const events = myRuns
		.flatMap((r, n) =>
			(logs[n]?.data?.events ?? []).map((e) => ({ ...e, run: r.id, key: r.key, title: r.title })),
		)
		.filter((e) => (e.ts ?? 0) > (since ?? Number.POSITIVE_INFINITY))
		.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
		.slice(0, SHOWN);
	const statuses = [...new Set(all.map((i) => i.status))];
	const recent = (i: { updated: string }) => {
		const at = Date.parse(i.updated);
		return Number.isNaN(at) || Date.now() - at <= WEEK;
	};
	const groups: [string, string, typeof mine][] = [
		["in-progress", d.inProgress, mine.filter((i) => i.category === "in-progress")],
		["todo", d.todo, mine.filter((i) => i.category === "todo")],
		["done", d.done, mine.filter((i) => i.category === "done" && recent(i))],
	];
	const nothing =
		needsYouTotal(inbox) === 0 &&
		groups.every((g) => g[2].length === 0) &&
		live.length === 0 &&
		events.length === 0;
	const time = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
	return (
		// tabIndex -1: where the focus lands when the last row of Needs you or of the checklist leaves (`Leave`).
		<div tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-4 pb-4 outline-none">
			<PageHeader
				icon={<ClockIcon size={16} />}
				title={t.tabs.home.today}
				menu={[
					{
						label: t.home.refresh,
						icon: <ArrowPathIcon size={12} />,
						onClick: () => void qc.invalidateQueries(),
					},
				]}
			/>
			{start}
			<RolePanels />
			<NeedsYou />
			{mine.length ? (
				<h2
					aria-label={format(t.count, { name: t.ui.myItems, count: mine.length })}
					className="flex items-center gap-2 px-4 text-14 font-medium text-n-12"
				>
					{t.ui.myItems}
					<Badge className="font-mono">{mine.length}</Badge>
				</h2>
			) : null}
			{groups.map(([id, name, rows]) =>
				rows.length ? (
					<div key={id} className="px-4">
						<Panel title={name} count={rows.length} flush>
							{rows.map((i) => (
								<MyTicket key={i.key} itemKey={i.key} statuses={statuses} />
							))}
						</Panel>
					</div>
				) : null,
			)}
			<div className="px-4">
				<Panel
					title={d.agents}
					count={live.length}
					flush
					toolbar={
						<span className="flex items-center gap-2">
							<Sparkline values={spend.series.map((p) => p.usd)} className="h-5 w-16" />
							<Badge className="font-mono">
								<span className="sr-only">{t.ui.spendToday} </span>
								{new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(
									spend.today,
								)}
							</Badge>
						</span>
					}
				>
					{live.length === 0 ? <p className="px-3 py-3 text-n-10">{t.shell.runsNone}</p> : null}
					{live.map((r) => (
						<div key={r.id} className="flex h-row items-center gap-2 border-b px-3 last:border-b-0">
							<StatusDot status={RUN_STATUS[r.state]} label={t.factory.state[r.state]} />
							<RefChip refId={`run:${r.id}`} state="resolved" onOpen={openRef} />
							<span className="font-mono text-12 text-n-11">{r.key}</span>
							<span className="min-w-0 flex-1 truncate text-ui">{r.title}</span>
							<ConfirmButton
								variant="ghost"
								{...stopGate}
								confirm={format(t.factory.machine.confirmStop, { name: r.key })}
								onConfirm={() => void run(() => cancel(r.id))}
							>
								{format(t.factory.machine.stop, { name: r.key })}
							</ConfirmButton>
						</div>
					))}
				</Panel>
			</div>
			{error ? (
				<p role="alert" className="px-4 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{events.length ? (
				<div className="px-4">
					<Panel title={d.away} count={events.length} flush>
						<Timeline>
							{events.map((e) => (
								<TimelineItem
									key={`${e.run}:${e.id}`}
									lead={<Avatar name={e.step ?? t.ui.activity.system} className="size-6" />}
									title={eventSentence(t.home.event, t.factory.state, e)}
									body={`${e.title} · ${format(t.home.stat.by, { name: memberName(members, mine.find((i) => i.key === e.key)?.member ?? null) })}`}
									time={e.ts === null ? "" : time.format(e.ts)}
								/>
							))}
						</Timeline>
					</Panel>
				</div>
			) : null}
			{nothing && !inbox.loading ? (
				<EmptyState
					title={t.empty.needsYou}
					action={{
						label: d.backlog,
						onClick: () => void navigate({ to: "/work/backlog" }),
					}}
				/>
			) : null}
		</div>
	);
}
