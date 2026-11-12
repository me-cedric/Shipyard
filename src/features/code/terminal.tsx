import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { CommandLineIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { useTerminal } from "./use-terminal";

/** One shell on a dark screen that fills its space. The tab and the drawer both show it. */
export function TerminalScreen({
	folder = null,
	startup,
	className,
}: {
	folder?: string | null;
	/** A command that runs when the shell starts. */
	startup?: string;
	className?: string;
}) {
	const { t } = useI18n();
	const host = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<unknown>(null);
	const { ended, restart } = useTerminal(host, folder, setError, t.forge.terminal.ended, startup);
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
				{ended ? (
					<div className="flex shrink-0 justify-end border-b px-3 py-1">
						<Button onClick={restart}>{t.forge.terminal.restart}</Button>
					</div>
				) : null}
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

/** The address `/code/terminal` opens the drawer and leaves the person on the first Code tab (REQ-014). */
export function Terminal() {
	const { setTerminalOpen } = useShell();
	const navigate = useNavigate();
	useEffect(() => {
		setTerminalOpen(true);
		void navigate({ to: "/code/changes", replace: true });
	}, [setTerminalOpen, navigate]);
	return null;
}
