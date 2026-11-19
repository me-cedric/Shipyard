import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";

const LEVELS = ["all", "info", "warn", "error"] as const;
const TONE: Record<string, string> = { warn: "text-warning", error: "text-danger" };

/**
 * Setup / Logs and feedback: the app log with a level filter and a copy button. The backend hides
 * a line that holds a secret, so the copy never holds a value.
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
		<section
			id="doctor-console"
			aria-label={d.title}
			className="min-w-0 overflow-hidden rounded-lg bg-surface-2 shadow-2"
		>
			<div className="flex min-h-15 flex-wrap items-center gap-3 px-6 py-2">
				<h2 className="mr-auto font-semibold text-n-12">{t.personal.setup.console}</h2>
				<span className="inline-flex">
					<Segmented
						label={d.level}
						value={level}
						onValueChange={setLevel}
						items={LEVELS.map((v) => ({ value: v, label: d[v] }))}
					/>
				</span>
				<Button
					variant="secondary"
					onClick={() => copyText(lines.map((l) => `${l.at} [${l.level}] ${l.message}`).join("\n"))}
				>
					{d.copy}
				</Button>
			</div>
			{/* The log block is dark in each theme, as a terminal. */}
			<ol
				aria-label={d.title}
				className="canvas-dark max-h-80 min-h-24 overflow-auto bg-surface-0 px-6 py-4 font-mono text-ui leading-[1.8] text-n-11"
			>
				{lines.map((l, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: a log line has no id and the list only grows
						key={`${l.at}-${i}`}
						className="break-words"
					>
						<span className="opacity-70">{l.at}</span>{" "}
						<span className={TONE[l.level]}>[{l.level}]</span> {l.message}
					</li>
				))}
			</ol>
		</section>
	);
}
