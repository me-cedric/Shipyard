import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CommandLineIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { withProject } from "./project-gate";
import { useTerminal } from "./use-terminal";

/** One shell on a dark screen that fills its space. The tab and the drawer both show it. */
export function TerminalScreen({
	folder = null,
	className,
}: {
	folder?: string | null;
	className?: string;
}) {
	const { t } = useI18n();
	const host = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<unknown>(null);
	useTerminal(host, folder, setError, t.forge.terminal.ended);
	return (
		<>
			{error ? <ErrorNotice error={error} className="px-4 py-2 text-ui text-danger-text" /> : null}
			{/* Dark in both themes. No window bar: the terminal fills the space. */}
			<div
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-hidden canvas-dark bg-surface-0",
					className,
				)}
			>
				<section ref={host} aria-label={t.forge.terminal.label} className="min-h-0 flex-1 p-3" />
			</div>
		</>
	);
}

/** The shell at the root of the working copy. `folder` starts it in a folder of the project (REQ-034). */
export function TerminalPanel({ folder = null }: { folder?: string | null }) {
	const { t } = useI18n();
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader icon={<CommandLineIcon size={16} />} title={t.tabs.code.terminal} />
			<TerminalScreen folder={folder} />
		</div>
	);
}

export const Terminal = withProject(() => <TerminalPanel />);
