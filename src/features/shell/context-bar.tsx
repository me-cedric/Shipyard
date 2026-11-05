import { Link } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { AskMenu } from "@/features/assistant";
import { BranchSelector } from "@/features/code/branch-selector";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { usePicture } from "@/features/settings/picture-field";
import { format, useI18n } from "@/lib/i18n";
import { errorDialog } from "@/lib/ipc";
import { useNotifications, useOpenNotice } from "@/lib/notifications";
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
	ChevronLeftIcon,
	ChevronRightIcon,
	CommandLineIcon,
	ComputerDesktopIcon,
	FolderOpenIcon,
	InboxIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	SunIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { MenuButton } from "@/ui/molecules/menu-button";
import { ProjectSwitcher } from "@/ui/molecules/project-switcher";
import { SplitButton } from "@/ui/molecules/split-button";
import { NotificationCentre } from "@/ui/organisms/notification-centre";
import type { Action } from "./actions";
import { ActiveSessions } from "./active-sessions";
import { useCounts } from "./counts";

const NEXT: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON = { light: SunIcon, dark: MoonIcon, system: ComputerDesktopIcon };

const NARROW = "(max-width: 1099px)";

/** True under 1100 px: the right-hand icons fold into one More menu. */
function useNarrow() {
	return useSyncExternalStore(
		(on) => {
			const q = window.matchMedia?.(NARROW);
			q?.addEventListener?.("change", on);
			return () => q?.removeEventListener?.("change", on);
		},
		() => window.matchMedia?.(NARROW)?.matches ?? false,
	);
}

const chip =
	"inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 hover:text-n-12 disabled:pointer-events-none disabled:opacity-50";

/**
 * The bar on top of every page: the project, the branch, the state of the repository with the one
 * Sync, the pulse of the factory, then search, assistant, notifications and theme.
 */
export function ContextBar({
	sync,
	fetch,
	push,
	assistant,
	palette,
	files,
	terminal,
	back,
	forward,
	manual,
	toggleSidebar,
}: {
	sync: Action;
	fetch: Action;
	push: Action;
	assistant: Action;
	palette: Action;
	files: Action;
	terminal: Action;
	back: Action;
	forward: Action;
	manual: Action;
	toggleSidebar: Action;
}) {
	const { t } = useI18n();
	const { theme, setPrefs, sidebarOpen } = usePrefs();
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const { switchTo, openFolder, close, remove } = useProjectActions();
	const [cloning, setCloning] = useState(false);
	const { syncing, assistantOpen, filesOpen, terminalOpen } = useShell();
	const { items, unread, markRead, clear } = useNotifications();
	const openNotice = useOpenNotice();
	const { needsYou, live, changes, changed } = useCounts();
	const ThemeIcon = THEME_ICON[theme];
	const narrow = useNarrow();
	const themeLabel = format(t.shell.themeTo, { name: t.theme[NEXT[theme]] });
	const logo = usePicture("logo").data;
	const avatar = usePicture("avatar").data;
	return (
		<>
			<IconButton
				label={sidebarOpen ? t.workspace.view.hideSidebar : t.workspace.view.showSidebar}
				shortcut={toggleSidebar.shortcut}
				onClick={toggleSidebar.run}
			>
				<ViewColumnsIcon size={16} />
			</IconButton>
			<IconButton label={back.label} shortcut={back.shortcut} onClick={back.run}>
				<ChevronLeftIcon size={16} />
			</IconButton>
			<IconButton label={forward.label} shortcut={forward.shortcut} onClick={forward.run}>
				<ChevronRightIcon size={16} />
			</IconButton>
			{active && logo ? (
				<img src={logo} alt={active.name} className="size-6 shrink-0 rounded-sm object-contain" />
			) : null}
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
			<SplitButton
				label={sync.label}
				icon={<AnimatedIcon icon={ArrowPathIcon} size={14} spin={syncing} />}
				onClick={sync.run}
				disabled={sync.disabled}
				moreLabel={t.workspace.view.syncMore}
				moreDisabled={fetch.disabled}
				items={[fetch, push].map((a) => ({ id: a.id, label: a.label, onSelect: a.run }))}
			/>
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
			{narrow ? null : (
				<>
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
				</>
			)}
			<IconButton
				label={assistant.label}
				shortcut={assistant.shortcut}
				aria-pressed={assistantOpen}
				onClick={assistant.run}
				className="aria-pressed:bg-n-4 aria-pressed:text-n-12"
			>
				<ChatBubbleIcon size={16} />
			</IconButton>
			<AskMenu />
			<NotificationCentre
				items={items}
				unread={unread}
				onOpen={markRead}
				onClear={clear}
				onGo={openNotice}
			/>
			<IconButton label={manual.label} shortcut={manual.shortcut} onClick={manual.run}>
				?
			</IconButton>
			{narrow ? (
				<MenuButton
					label={t.workspace.view.more}
					iconOnly
					icon="⋯"
					items={[files, terminal]
						.map((a) => ({
							id: a.id,
							label: a.label,
							disabled: a.disabled,
							onSelect: a.run,
						}))
						.concat({
							id: "theme",
							label: themeLabel,
							disabled: false,
							onSelect: () => setPrefs({ theme: NEXT[theme] }),
						})}
				/>
			) : (
				<IconButton label={themeLabel} onClick={() => setPrefs({ theme: NEXT[theme] })}>
					<ThemeIcon size={16} />
				</IconButton>
			)}
			{avatar ? (
				<Link to="/settings/me" className="shrink-0 rounded-full">
					<img
						src={avatar}
						alt={t.extras.picture.avatar}
						className="size-6 rounded-full object-cover"
					/>
				</Link>
			) : null}
		</>
	);
}
