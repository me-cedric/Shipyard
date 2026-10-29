import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useWatchNotice } from "@/lib/code";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { useNotifications } from "@/lib/notifications";
import { useHealth, worstStatus } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon } from "@/ui/icons";
import { NotificationCentre } from "@/ui/organisms/notification-centre";
import type { Action } from "./actions";

const button =
	"inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-11 text-n-11 hover:bg-n-3 hover:text-n-12 disabled:pointer-events-none disabled:opacity-50";

function ActionButton({ action, children }: { action: Action; children?: ReactNode }) {
	const { Icon } = action;
	return (
		<button type="button" className={button} onClick={action.run} disabled={action.disabled}>
			{children ?? <Icon size={12} />}
			{action.label}
		</button>
	);
}

export function StatusBar({
	sync,
	commit,
	assistant,
}: {
	sync: Action;
	commit: Action;
	assistant: Action;
}) {
	const { t } = useI18n();
	const { syncing, syncError } = useShell();
	const { items, unread, markRead, clear } = useNotifications();
	const notice = useWatchNotice().data?.changes[0];
	const health = useHealth();
	// A run is active while it works or waits for the person.
	const active = (useRuns().data ?? []).filter(
		(r) => r.lane === "working" || r.lane === "needs_you",
	).length;
	const findings = health.data ?? [];
	// The dot shows the worst finding by shape and colour. A click opens Settings / Health.
	const status: Status = health.isError
		? "danger"
		: health.data === undefined
			? "idle"
			: worstStatus(findings.map((f) => f.severity));
	return (
		<>
			<ActionButton action={sync}>
				{syncing ? <StatusDot status="active" className="size-2" /> : undefined}
			</ActionButton>
			{notice ? (
				<span role="status" className="truncate">
					{format(t.code.notice, {
						count: notice.count,
						branch: notice.name,
						author: notice.author,
						subject: notice.subject,
					})}
				</span>
			) : null}
			{syncError ? (
				<span role="alert" className="truncate text-danger-text">
					{syncError}
				</span>
			) : null}
			<ActionButton action={commit} />
			<ActionButton action={assistant} />
			<span className="flex-1" />
			<NotificationCentre items={items} unread={unread} onOpen={markRead} onClear={clear} />
			<span className="inline-flex items-center gap-1">
				<CpuChipIcon size={12} />
				<span className="sr-only">{t.shell.runs}</span>
				{active}
			</span>
			<Link to="/settings/health" className="inline-flex items-center gap-1 rounded-sm px-1">
				<span className="sr-only">
					{format(t.count, { name: t.shell.health, count: findings.length })}
				</span>
				<StatusDot status={status} />
			</Link>
		</>
	);
}
