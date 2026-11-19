import { SyncMark } from "@/features/code/sync-mark";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon, ChevronRightIcon, SidebarIcon } from "@/ui/icons";
import type { Action } from "./actions";
import { PaletteHost } from "./palette-host";

/**
 * The top row of every page: the rail toggle, Back and Forward, the Ask bar, then the sync mark at
 * the right end. The project is in the rail, and the files and the terminal are actions of the Ask bar.
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
}) {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
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
		</>
	);
}
