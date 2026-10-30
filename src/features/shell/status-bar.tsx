import { Link } from "@tanstack/react-router";
import { useWatchNotice } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { useHealth, worstStatus } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useWhatsNew } from "@/lib/updates/whats-new";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import type { Action } from "./actions";

const button =
	"inline-flex h-4 items-center gap-1.5 rounded-sm px-1.5 text-11 text-n-11 hover:bg-n-3 hover:text-n-12 disabled:pointer-events-none disabled:opacity-50";

function ActionButton({ action }: { action: Action }) {
	const { Icon } = action;
	return (
		<button type="button" className={button} onClick={action.run} disabled={action.disabled}>
			<Icon size={12} />
			{action.label}
		</button>
	);
}

/** The thin bar at the bottom: the one commit action, the watch notice, the sync error and the health. */
export function StatusBar({ commit }: { commit: Action }) {
	const { t } = useI18n();
	const { syncError } = useShell();
	const notice = useWatchNotice().data?.changes[0];
	const health = useHealth();
	const { current } = useWhatsNew();
	const findings = health.data ?? [];
	// The dot shows the worst finding by shape and colour. A click opens Settings / Health.
	const status: Status = health.isError
		? "danger"
		: health.data === undefined
			? "idle"
			: worstStatus(findings.map((f) => f.severity));
	return (
		<>
			<ActionButton action={commit} />
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
			<span className="flex-1" />
			{current ? (
				<span className="font-mono text-11 text-n-11">
					<span className="sr-only">{format(t.shell.version, { version: current })}</span>
					<span aria-hidden="true">v{current}</span>
				</span>
			) : null}
			<Link to="/settings/health" className="inline-flex items-center gap-1 rounded-sm px-1">
				<span className="sr-only">
					{format(t.count, { name: t.shell.health, count: findings.length })}
				</span>
				<StatusDot status={status} />
			</Link>
		</>
	);
}
