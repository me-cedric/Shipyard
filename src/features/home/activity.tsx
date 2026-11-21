import { SessionsPart } from "@/features/shell/active-sessions";
import { RunsPart } from "@/features/shell/activity";
import { useRuns } from "@/lib/factory";
import { latestPerTicket } from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { InboxIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";

/** Today / Activity: the live runs with stop and the sessions on this computer (spec:app-redesign#REQ-008). */
export function ActivityView() {
	const { t } = useI18n();
	const live = latestPerTicket(useRuns().data ?? []).filter(
		(r) => r.lane === "working" || r.lane === "needs_you",
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader icon={<InboxIcon size={16} />} title={t.tabs.home.activity} />
			<div className="grid gap-4 px-4 lg:grid-cols-2">
				<div className="rounded-lg border bg-surface-2">
					<RunsPart live={live} />
				</div>
				<div className="rounded-lg border bg-surface-2">
					<SessionsPart />
				</div>
			</div>
		</div>
	);
}
