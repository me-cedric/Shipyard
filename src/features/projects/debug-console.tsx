import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { ClipboardIcon, CommandLineIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

const LEVELS = ["all", "info", "warn", "error"] as const;
const TONE = { info: "neutral", warn: "warning", error: "danger" } as const;

/**
 * Settings / Health: the app log with a level filter and a copy button. The backend hides a line
 * that holds a secret, so the copy never holds a value. Source: Legacy `debug-console.tsx`.
 */
export function DebugConsole() {
	const { t } = useI18n();
	const d = t.doctor.console;
	const [level, setLevel] = useState<(typeof LEVELS)[number]>("all");
	const log = useQuery({
		queryKey: ["debug", "log"],
		queryFn: () => unwrap(commands.debugLog()),
		refetchInterval: 3000,
	});
	const lines = (log.data ?? []).filter((l) => level === "all" || l.level === level);
	return (
		<Panel
			title={d.title}
			count={lines.length}
			icon={<CommandLineIcon size={14} />}
			toolbar={
				<>
					<Select
						label={d.level}
						value={level}
						items={LEVELS.map((v) => ({ value: v, label: d[v] }))}
						onValueChange={(v) => setLevel(v as (typeof LEVELS)[number])}
					/>
					<Button
						variant="secondary"
						onClick={() =>
							copyText(lines.map((l) => `${l.at} [${l.level}] ${l.message}`).join("\n"))
						}
					>
						<ClipboardIcon size={14} />
						{d.copy}
					</Button>
				</>
			}
			flush
		>
			<ol className="max-h-64 overflow-auto font-mono text-12" aria-label={d.title}>
				{lines.map((l, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: a log line has no id and the list only grows
						key={`${l.at}-${i}`}
						className="flex items-baseline gap-2 border-b px-3 py-1 last:border-b-0"
					>
						<span className="text-n-10">{l.at}</span>
						<Badge variant={TONE[l.level as keyof typeof TONE] ?? "neutral"}>{l.level}</Badge>
						<span className="min-w-0 flex-1 break-words">{l.message}</span>
					</li>
				))}
			</ol>
		</Panel>
	);
}
