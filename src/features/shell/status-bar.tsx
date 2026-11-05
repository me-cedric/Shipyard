import { Link } from "@tanstack/react-router";
import { useChanges, useWatchNotice } from "@/lib/code";
import { useErrorNotice } from "@/lib/errors";
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
	const { syncFailure } = useShell();
	const failed = useErrorNotice(syncFailure);
	const notice = useWatchNotice().data?.changes[0];
	const health = useHealth();
	const changes = useChanges().data;
	const n = (v: number) => v.toLocaleString();
	// "Changes: {added} lines added, {removed} removed": the text around the two numbers.
	const lines = t.shell.lines.split(/\{added\}|\{removed\}/);
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
			{changes && (changes.added > 0 || changes.removed > 0) ? (
				// Lines added and removed since the last commit. A click opens the changes.
				// The visible numbers sit inside the spoken sentence (WCAG 2.5.3, label in name).
				<Link to="/code/changes" className={button}>
					<span className="sr-only">{lines[0]?.trim()}</span>{" "}
					<span className="font-mono text-success-text">+{n(changes.added)}</span>{" "}
					<span className="sr-only">{lines[1]?.trim()}</span>{" "}
					<span className="font-mono text-danger-text">−{n(changes.removed)}</span>{" "}
					<span className="sr-only">{lines[2]?.trim()}</span>
				</Link>
			) : null}
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
			{failed ? (
				<>
					<span role="alert" className="truncate text-danger-text">
						{failed.message}
					</span>
					{failed.action ? (
						<button
							type="button"
							className={button}
							disabled={failed.action.busy}
							onClick={() => void failed.action?.run()}
						>
							{failed.action.label}
						</button>
					) : null}
				</>
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
