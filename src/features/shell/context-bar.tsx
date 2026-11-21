import { SyncMark } from "@/features/code/sync-mark";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useShell } from "@/lib/shell";
import { IconButton } from "@/ui/atoms/icon-button";
import {
	ChatBubbleIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CommandLineIcon,
	SidebarIcon,
} from "@/ui/icons";
import type { Action } from "./actions";
import { PaletteHost } from "./palette-host";

/**
 * The top row of every page: the rail toggle, Back and Forward, the Ask bar, the sync mark, then
 * the assistant and the terminal, so that both open from any page. The project is in the rail.
 */
export function ContextBar({
	sync,
	fetch,
	push,
	commit,
	actions,
	palette,
	back,
	forward,
	toggleSidebar,
	assistant,
	terminal,
}: {
	sync: Action;
	fetch: Action;
	push: Action;
	commit: Action;
	/** Every action: the Ask bar lists them under Do. */
	actions: Action[];
	palette: Action;
	back: Action;
	forward: Action;
	toggleSidebar: Action;
	assistant: Action;
	terminal: Action;
}) {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
	const { assistantOpen, terminalOpen } = useShell();
	return (
		<>
			<div className="flex shrink-0 gap-2">
				<IconButton
					variant="outline"
					label={sidebarOpen ? t.workspace.view.hideSidebar : t.workspace.view.showSidebar}
					shortcut={toggleSidebar.shortcut}
					onClick={toggleSidebar.run}
				>
					<SidebarIcon size={16} />
				</IconButton>
				<IconButton
					variant="outline"
					label={back.label}
					shortcut={back.shortcut}
					onClick={back.run}
				>
					<ChevronLeftIcon size={16} />
				</IconButton>
				<IconButton
					variant="outline"
					label={forward.label}
					shortcut={forward.shortcut}
					onClick={forward.run}
				>
					<ChevronRightIcon size={16} />
				</IconButton>
			</div>
			<PaletteHost actions={actions} shortcut={palette.shortcut} />
			<SyncMark sync={sync} fetch={fetch} push={push} commit={commit} />
			<div className="flex shrink-0 gap-2">
				<IconButton
					variant="outline"
					label={assistant.label}
					shortcut={assistant.shortcut}
					aria-pressed={assistantOpen}
					onClick={assistant.run}
				>
					<ChatBubbleIcon size={16} />
				</IconButton>
				<IconButton
					variant="outline"
					label={terminal.label}
					shortcut={terminal.shortcut}
					disabled={terminal.disabled}
					aria-pressed={terminalOpen}
					onClick={terminal.run}
				>
					<CommandLineIcon size={16} />
				</IconButton>
			</div>
		</>
	);
}
