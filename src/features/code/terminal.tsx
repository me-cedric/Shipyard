import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { withProject } from "./project-gate";
import { useTerminal } from "./use-terminal";

/** The shell at the root of the working copy. `folder` starts it in a folder of the project (REQ-034). */
export function TerminalPanel({ folder = null }: { folder?: string | null }) {
	const { t } = useI18n();
	const host = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);
	useTerminal(host, folder, setError, t.forge.terminal.ended);
	return (
		<div className="flex h-full flex-col">
			<h1 className="sr-only">{t.tabs.code.terminal}</h1>
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<section ref={host} aria-label={t.forge.terminal.label} className="min-h-0 flex-1 p-2" />
		</div>
	);
}

export const Terminal = withProject(() => <TerminalPanel />);
