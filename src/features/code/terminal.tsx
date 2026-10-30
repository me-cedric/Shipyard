import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CommandLineIcon } from "@/ui/icons";
import { PageHeader } from "@/ui/molecules/page-header";
import { withProject } from "./project-gate";
import { useTerminal } from "./use-terminal";

/** The shell at the root of the working copy. `folder` starts it in a folder of the project (REQ-034). */
export function TerminalPanel({ folder = null }: { folder?: string | null }) {
	const { t } = useI18n();
	const host = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);
	useTerminal(host, folder, setError, t.forge.terminal.ended);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader icon={<CommandLineIcon size={16} />} title={t.tabs.code.terminal} />
			{error ? (
				<p role="alert" className="px-4 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{/* Dark in both themes, a frame around the black screen of the shell. */}
			<div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden canvas-dark rounded-lg border border-n-7 bg-surface-0 shadow-2">
				<div
					aria-hidden="true"
					className="flex h-8 shrink-0 items-center gap-1.5 border-b border-n-6 px-3"
				>
					<span className="size-2.5 rounded-full bg-danger/80" />
					<span className="size-2.5 rounded-full bg-warning/80" />
					<span className="size-2.5 rounded-full bg-success/80" />
				</div>
				<section ref={host} aria-label={t.forge.terminal.label} className="min-h-0 flex-1 p-3" />
			</div>
		</div>
	);
}

export const Terminal = withProject(() => <TerminalPanel />);
