import { useQueries, useQueryClient } from "@tanstack/react-query";
import { PinnedTiles } from "@/features/knowledge";
import { NoProject } from "@/features/work/no-project";
import { useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { useActiveProject } from "@/lib/projects";
import { Avatar } from "@/ui/atoms/avatar";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, ClockIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { SHAPE } from "@/ui/molecules/notification-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { Timeline, TimelineItem } from "@/ui/molecules/timeline";

const SHOWN = 20;
// shortcut: one page of 50 events for each run, so a very long run misses its newest events; upgrade with a log tail command.
const PAGE = 50;

/** Home / Activity: the newest run log events and the notifications (shell REQ-003). */
export function Activity() {
	const { t, lang } = useI18n();
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const runs = useRuns().data ?? [];
	const { items: notices } = useNotifications();
	const logs = useQueries({
		queries: runs.map((r) => ({
			queryKey: ["home", "activity", r.id] as const,
			queryFn: () => unwrap(commands.runLogPage(r.id, 0, PAGE)),
		})),
	});
	const events = runs
		.flatMap((r, n) => (logs[n]?.data?.events ?? []).map((e) => ({ ...e, run: r.id, key: r.key })))
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
			<PinnedTiles />
			{events.length === 0 && notices.length === 0 ? (
				<EmptyState
					action={{ label: t.home.refresh, icon: <ArrowPathIcon size={14} />, onClick: refresh }}
				/>
			) : (
				<div className="grid items-start gap-4 px-4 xl:grid-cols-2">
					<Panel title={t.factory.log} count={events.length} flush>
						<Timeline>
							{events.map((e) => (
								<TimelineItem
									key={`${e.run}:${e.id}`}
									// The step is the agent at work: its avatar leads the event.
									lead={<Avatar name={e.step ?? e.key} className="size-6" />}
									title={`${e.key} ${e.step ? `${e.step} ` : ""}${e.kind}`}
									time={e.ts === null ? "" : time.format(e.ts)}
								/>
							))}
						</Timeline>
					</Panel>
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
				</div>
			)}
		</div>
	);
}
