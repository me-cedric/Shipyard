import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BranchSelector } from "@/features/code/branch-selector";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { OpenInTerminal } from "@/features/reports/open-in-terminal";
import { format, useI18n } from "@/lib/i18n";
import { errorDialog } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { type Theme, usePrefs } from "@/lib/prefs";
import { outcomeError, useActiveProject, useProjectActions, useProjects } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { AnimatedIcon } from "@/ui/atoms/animated-icon";
import { IconButton } from "@/ui/atoms/icon-button";
import { Kbd } from "@/ui/atoms/kbd";
import { LiveDot } from "@/ui/atoms/live-dot";
import {
	ArrowPathIcon,
	ChatBubbleIcon,
	CommandLineIcon,
	ComputerDesktopIcon,
	FolderOpenIcon,
	InboxIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	SunIcon,
} from "@/ui/icons";
import { ProjectSwitcher } from "@/ui/molecules/project-switcher";
import { NotificationCentre } from "@/ui/organisms/notification-centre";
import type { Action } from "./actions";
import { ActiveSessions } from "./active-sessions";
import { useCounts } from "./counts";

const NEXT: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON = { light: SunIcon, dark: MoonIcon, system: ComputerDesktopIcon };

const chip =
	"inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 hover:text-n-12 disabled:pointer-events-none disabled:opacity-50";

/**
 * The bar on top of every page: the project, the branch, the state of the repository with the one
 * Sync, the pulse of the factory, then search, assistant, notifications and theme.
 */
export function ContextBar({
	sync,
	assistant,
	palette,
	files,
	terminal,
}: {
	sync: Action;
	assistant: Action;
	palette: Action;
	files: Action;
	terminal: Action;
}) {
	const { t } = useI18n();
	const { theme, setPrefs } = usePrefs();
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const { switchTo, openFolder, close, remove } = useProjectActions();
	const [cloning, setCloning] = useState(false);
	const { syncing, assistantOpen, filesOpen, terminalOpen } = useShell();
	const { items, unread, markRead, clear } = useNotifications();
	const { needsYou, live, changes, changed } = useCounts();
	const ThemeIcon = THEME_ICON[theme];
	return (
		<>
			<ProjectSwitcher
				projects={projects}
				value={active?.id ?? null}
				onChange={(id) => void switchTo(id)}
				onOpen={() =>
					void openFolder().then((o) => {
						const error = o && outcomeError(t, o);
						if (error) void errorDialog(error);
					})
				}
				onClone={() => setCloning(true)}
				onClose={() => void close()}
				onRemove={(p) => void remove(p)}
				className="max-w-56 border-transparent bg-transparent hover:bg-n-3"
			/>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
			<BranchSelector />
			{active && changes ? (
				<ul aria-label={t.ui.repo} className="flex items-center gap-2 font-mono text-12 text-n-11">
					<li aria-label={format(t.count, { name: t.ui.changes, count: changed })}>
						<span aria-hidden="true" className={changed ? "text-warning-text" : undefined}>
							●{changed}
						</span>
					</li>
					<li aria-label={format(t.count, { name: t.ui.ahead, count: changes.ahead })}>
						<span aria-hidden="true">↑{changes.ahead}</span>
					</li>
					<li aria-label={format(t.count, { name: t.ui.behind, count: changes.behind })}>
						<span aria-hidden="true" className={changes.behind ? "text-info-text" : undefined}>
							↓{changes.behind}
						</span>
					</li>
				</ul>
			) : null}
			<button type="button" className={chip} onClick={sync.run} disabled={sync.disabled}>
				<AnimatedIcon icon={ArrowPathIcon} size={14} spin={syncing} />
				{sync.label}
			</button>
			<span className="flex-1" />
			<Link to="/factory/runs" className={chip}>
				<span className="sr-only">{format(t.count, { name: t.shell.runs, count: live })}</span>
				{live ? <LiveDot /> : <span className="size-2 rounded-full bg-n-7" />}
				<span aria-hidden="true" className="font-mono">
					{live}
				</span>
			</Link>
			<ActiveSessions className={chip} />
			<Link to="/home/inbox" className={chip}>
				<span className="sr-only">
					{format(t.count, { name: t.home.needsYou, count: needsYou })}
				</span>
				<InboxIcon size={14} />
				<span aria-hidden="true" className={needsYou ? "font-mono text-warning-text" : "font-mono"}>
					{needsYou}
				</span>
			</Link>
			<button
				type="button"
				onClick={palette.run}
				aria-keyshortcuts="Meta+K Control+K"
				className={`${chip} min-w-40 border bg-surface-0`}
			>
				<MagnifyingGlassIcon size={14} />
				<span className="flex-1 text-left">{t.common.search}</span>
				<Kbd aria-hidden="true">{palette.shortcut}</Kbd>
			</button>
			<IconButton
				label={files.label}
				shortcut={files.shortcut}
				aria-pressed={filesOpen}
				disabled={files.disabled}
				onClick={files.run}
				className="aria-pressed:bg-n-4 aria-pressed:text-n-12"
			>
				<FolderOpenIcon size={16} />
			</IconButton>
			<IconButton
				label={terminal.label}
				shortcut={terminal.shortcut}
				aria-pressed={terminalOpen}
				disabled={terminal.disabled}
				onClick={terminal.run}
				className="aria-pressed:bg-n-4 aria-pressed:text-n-12"
			>
				<CommandLineIcon size={16} />
			</IconButton>
			{active ? <OpenInTerminal /> : null}
			<IconButton
				label={assistant.label}
				shortcut={assistant.shortcut}
				aria-pressed={assistantOpen}
				onClick={assistant.run}
				className="aria-pressed:bg-n-4 aria-pressed:text-n-12"
			>
				<ChatBubbleIcon size={16} />
			</IconButton>
			<NotificationCentre items={items} unread={unread} onOpen={markRead} onClear={clear} />
			<IconButton
				label={format(t.shell.themeTo, { name: t.theme[NEXT[theme]] })}
				onClick={() => setPrefs({ theme: NEXT[theme] })}
			>
				<ThemeIcon size={16} />
			</IconButton>
		</>
	);
}
