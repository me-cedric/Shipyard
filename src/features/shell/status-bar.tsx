import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { commands } from "@/lib/ipc";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon } from "@/ui/icons";
import type { Action } from "./actions";
import { useShell } from "./shell-state";

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
	const health = useQuery({
		queryKey: ["health"],
		queryFn: () => commands.healthPing(),
		refetchInterval: 30_000,
	});
	const status: Status = health.isError
		? "danger"
		: health.data === undefined
			? "idle"
			: health.data === "pong"
				? "success"
				: "danger";
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
			<span className="inline-flex items-center gap-1">
				<span className="sr-only">{t.shell.health}</span>
				<StatusDot status={status} />
			</span>
		</>
	);
}
