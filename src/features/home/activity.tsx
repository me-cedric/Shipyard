import { useQueries, useQueryClient } from "@tanstack/react-query";
import { PinnedTiles } from "@/features/knowledge/pinned";
import { NoProject } from "@/features/work/no-project";
import { useRuns } from "@/lib/factory";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { useActiveProject } from "@/lib/projects";
import { useWorkItems } from "@/lib/sync";
import { memberName, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, ClockIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { SHAPE } from "@/ui/molecules/notification-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { Timeline, TimelineItem } from "@/ui/molecules/timeline";

const SHOWN = 20;

type Said = Messages["home"]["event"];

/** One event as one sentence: a state change names the new state, the other kinds name what happened. */
export function eventSentence(
	said: Said,
	states: Record<string, string>,
	e: { kind: string; payload: string; key: string },
) {
	if (e.kind === "state") {
		let to = "";
		try {
			to = String(JSON.parse(e.payload).to ?? "");
		} catch {
			// A payload that does not parse still gives a sentence.
		}
		if (to) return format(said.state, { key: e.key, state: states[to] ?? to });
	}
	const kind = e.kind in said && e.kind !== "state" ? (e.kind as keyof Said) : "other";
	return format(said[kind], { key: e.key, state: "" });
}
// shortcut: one page of 50 events for each run, so a very long run misses its newest events; upgrade with a log tail command.
const PAGE = 50;

/** Home / Activity: the newest run log events and the notifications (shell REQ-003). */
export function Activity() {
	const { t, lang } = useI18n();
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const runs = useRuns().data ?? [];
	const { items: notices } = useNotifications();
	const members = useTeam().data?.team.members ?? [];
	const mirrored = useWorkItems({}).data ?? [];
	const logs = useQueries({
		queries: runs.map((r) => ({
			queryKey: ["home", "activity", r.id] as const,
			queryFn: () => unwrap(commands.runLogPage(r.id, 0, PAGE)),
		})),
	});
	const events = runs
		.flatMap((r, n) =>
			(logs[n]?.data?.events ?? []).map((e) => ({ ...e, run: r.id, key: r.key, title: r.title })),
		)
		.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
		.slice(0, SHOWN);
	if (active === undefined) return null;
	if (active === null) return <NoProject title={t.tabs.home.activity} />;
	const time = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
	const refresh = () => void qc.invalidateQueries();
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader
				icon={<ClockIcon size={16} />}
				title={t.tabs.home.activity}
				count={events.length + notices.length}
				menu={[{ label: t.home.refresh, icon: <ArrowPathIcon size={12} />, onClick: refresh }]}
			/>
			<StatStrip
				className="px-4"
				items={[
					{ label: t.home.stat.events, value: String(events.length), tone: "accent" },
					{ label: t.home.stat.notices, value: String(notices.length), tone: "info" },
					{ label: t.home.stat.runs, value: String(runs.length), tone: "success" },
					{
						label: t.home.stat.live,
						value: String(
							runs.filter((r) => r.lane === "working" || r.lane === "needs_you").length,
						),
						tone: "warning",
					},
				]}
			/>
			<PinnedTiles />
			{events.length === 0 && notices.length === 0 ? (
				<EmptyState
					action={{ label: t.home.refresh, icon: <ArrowPathIcon size={14} />, onClick: refresh }}
				/>
			) : (
				<div
					// Without notifications the log takes the full width: an empty panel adds only a blank box.
					className={`grid items-start gap-4 px-4 ${notices.length ? "xl:grid-cols-2" : ""}`}
				>
					<Panel title={t.factory.log} count={events.length} flush>
						<Timeline>
							{events.map((e) => {
								// The actor is the step at work, or the system when no step acts. The body names the
								// item and the person it belongs to.
								const actor = e.step ?? t.ui.activity.system;
								const owner = mirrored.find((i) => i.key === e.key)?.member;
								const by = owner
									? ` · ${format(t.home.stat.by, { name: memberName(members, owner) })}`
									: "";
								return (
									<TimelineItem
										key={`${e.run}:${e.id}`}
										lead={<Avatar name={actor} className="size-6" />}
										title={eventSentence(t.home.event, t.factory.state, e)}
										body={`${e.title}${by}`}
										time={e.ts === null ? "" : time.format(e.ts)}
									/>
								);
							})}
						</Timeline>
					</Panel>
					{notices.length ? (
						<Panel title={t.notifications.title} count={notices.length} flush>
							<Timeline>
								{notices.map((n) => (
									<TimelineItem
										key={n.id}
										lead={<StatusDot status={SHAPE[n.kind]} label={t.notifications.kind[n.kind]} />}
										title={n.title}
										body={n.body}
										time={time.format(n.time)}
									/>
								))}
							</Timeline>
						</Panel>
					) : null}
				</div>
			)}
		</div>
	);
}
