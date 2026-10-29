import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useHealth, worstStatus } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon } from "@/ui/icons";
import type { Action } from "./actions";

const button =
	"inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-11 text-n-11 hover:bg-n-3 hover:text-n-12";

function ActionButton({ action, children }: { action: Action; children?: ReactNode }) {
	const { Icon } = action;
	return (
		<button type="button" className={button} onClick={action.run}>
			{children ?? <Icon size={12} />}
			{action.label}
		</button>
	);
}

export function StatusBar({ sync, commit }: { sync: Action; commit: Action }) {
	const { t } = useI18n();
	const { syncing } = useShell();
	const health = useHealth();
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
			<ActionButton action={commit} />
			<span className="flex-1" />
			<span className="inline-flex items-center gap-1">
				<CpuChipIcon size={12} />
				<span className="sr-only">{t.shell.runs}</span>0
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
