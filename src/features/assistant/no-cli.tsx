import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@/ui/icons";

// The cache key of Settings / Connections, so a detect there shows here.
const key = ["runners", "list"] as const;

/** The runners on this machine. `none` is true once the list is read and no CLI is installed. */
export function useRunnersMissing() {
	const q = useQuery({ queryKey: key, queryFn: () => unwrap(commands.runnersList()) });
	return {
		runners: q.data ?? [],
		none: q.data !== undefined && !q.data.some((r) => r.state === "detected"),
	};
}

/**
 * The panel when no agent CLI is installed.
 * It names each CLI with its install command and installs one on a click, then detects again.
 */
export function NoCli({
	runners,
}: {
	runners: { id: string; label: string; install: string }[];
}): ReactNode {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const detect = () => qc.invalidateQueries({ queryKey: key });
	const install = async (id: string) => {
		setBusy(id);
		setError(null);
		try {
			await unwrap(commands.runnerInstall(id, true));
			await detect();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};
	return (
		<section
			aria-labelledby="no-cli"
			className="m-2 mt-0 flex flex-col gap-2 rounded-xl border bg-surface-2 p-3 shadow-1"
		>
			<h2 id="no-cli" className="text-14 font-medium text-n-12">
				{t.assistant.noCli.title}
			</h2>
			<ul className="flex flex-col gap-1">
				{runners.map((r) => (
					<li key={r.id} className="flex items-center gap-2">
						<span className="min-w-0 flex-1">
							<span className="block truncate text-ui text-n-12">{r.label}</span>
							<code className="block truncate font-mono text-12 text-n-11">{r.install}</code>
						</span>
						<Button
							disabled={busy !== null}
							aria-label={format(t.assistant.noCli.installName, { name: r.label })}
							onClick={() => void install(r.id)}
						>
							<ArrowDownTrayIcon size={14} />
							{busy === r.id ? t.assistant.noCli.installing : t.assistant.noCli.install}
						</Button>
					</li>
				))}
			</ul>
			{error ? (
				<p role="alert" className="text-12 text-danger-text">
					{error}
				</p>
			) : null}
			<Button variant="ghost" onClick={() => void detect()}>
				<ArrowPathIcon size={14} />
				{t.assistant.noCli.detect}
			</Button>
		</section>
	);
}
