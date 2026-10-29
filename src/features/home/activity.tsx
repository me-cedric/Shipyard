import { useQueries, useQueryClient } from "@tanstack/react-query";
import { NoProject } from "@/features/work/no-project";
import { useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { useActiveProject } from "@/lib/projects";
import { ArrowPathIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { GroupSection } from "@/ui/molecules/group-section";
import { NotificationRow } from "@/ui/molecules/notification-row";
import { ListDetail } from "@/ui/templates/list-detail";

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
	return (
		<ListDetail title={t.tabs.home.activity}>
			{events.length === 0 && notices.length === 0 ? (
				<div className="p-4">
					<EmptyState
						action={{
							label: t.home.refresh,
							icon: <ArrowPathIcon size={14} />,
							onClick: () => void qc.invalidateQueries(),
						}}
					/>
				</div>
			) : (
				<>
					<GroupSection name={t.factory.log} count={events.length}>
						{events.map((e) => (
							<NotificationRow
								key={`${e.run}:${e.id}`}
								kind="info"
								kindLabel={t.notifications.kind.info}
								title={`${e.key} ${e.step ? `${e.step} ` : ""}${e.kind}`}
								time={e.ts === null ? "" : time.format(e.ts)}
							/>
						))}
					</GroupSection>
					<GroupSection name={t.notifications.title} count={notices.length}>
						{notices.map((n) => (
							<NotificationRow
								key={n.id}
								kind={n.kind}
								kindLabel={t.notifications.kind[n.kind]}
								title={n.title}
								body={n.body}
								time={time.format(n.time)}
							/>
						))}
					</GroupSection>
				</>
			)}
		</ListDetail>
	);
}
