import { useState, useSyncExternalStore } from "react";
import { BranchSelector } from "@/features/code/branch-selector";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { usePicture } from "@/features/settings/picture-field";
import { format, useI18n } from "@/lib/i18n";
import { errorDialog } from "@/lib/ipc";
import { useNotifications, useOpenNotice } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { outcomeError, useActiveProject, useProjectActions, useProjects } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { AnimatedIcon } from "@/ui/atoms/animated-icon";
import { IconButton } from "@/ui/atoms/icon-button";
import { Kbd } from "@/ui/atoms/kbd";
import {
	ArrowPathIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CommandLineIcon,
	FolderOpenIcon,
	MagnifyingGlassIcon,
	SidebarIcon,
} from "@/ui/icons";
import { MenuButton } from "@/ui/molecules/menu-button";
import { ProjectSwitcher } from "@/ui/molecules/project-switcher";
import { SplitButton } from "@/ui/molecules/split-button";
import { NotificationCentre } from "@/ui/organisms/notification-centre";
import { AccountMenu } from "./account-menu";
import type { Action } from "./actions";
import { Activity } from "./activity";
import { AskSplit } from "./ask-split";
import { useCounts } from "./counts";

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
 * Sync, then the Activity button, search, Ask, notifications and the account menu.
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
	toggleSidebar: Action;
}) {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const { switchTo, openFolder, close, remove } = useProjectActions();
	const [cloning, setCloning] = useState(false);
	const { syncing, filesOpen, terminalOpen } = useShell();
	const { items, unread, markRead, clear, remove: removeNotice } = useNotifications();
	const openNotice = useOpenNotice();
	const { changes } = useCounts();
	const narrow = useNarrow();
	const logo = usePicture("logo").data;
	return (
		<>
			<IconButton
				label={sidebarOpen ? t.workspace.view.hideSidebar : t.workspace.view.showSidebar}
				shortcut={toggleSidebar.shortcut}
				onClick={toggleSidebar.run}
			>
				<SidebarIcon size={16} />
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
			<SplitButton
				label={sync.label}
				icon={<AnimatedIcon icon={ArrowPathIcon} size={14} spin={syncing} />}
				onClick={sync.run}
				disabled={sync.disabled}
				after={
					changes && (changes.ahead || changes.behind) ? (
						// The visible numbers sit inside the spoken name (WCAG 2.5.3): the marks are hidden.
						<span className="flex gap-1 font-mono text-12">
							{changes.ahead ? (
								<span>
									<span aria-hidden="true">↑{changes.ahead}</span>
									<span className="sr-only">{format(t.code.ahead, { count: changes.ahead })}</span>
								</span>
							) : null}{" "}
							{changes.behind ? (
								<span className="text-info-text">
									<span aria-hidden="true">↓{changes.behind}</span>
									<span className="sr-only">
										{format(t.code.behind, { count: changes.behind })}
									</span>
								</span>
							) : null}
						</span>
					) : null
				}
				moreLabel={t.workspace.view.syncMore}
				moreDisabled={fetch.disabled}
				items={[fetch, push].map((a) => ({ id: a.id, label: a.label, onSelect: a.run }))}
			/>
			<span className="flex-1" />
			<Activity />
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
			<AskSplit assistant={assistant} />
			<NotificationCentre
				items={items}
				unread={unread}
				onOpen={markRead}
				onClear={clear}
				onRemove={removeNotice}
				onGo={openNotice}
			/>
			{narrow ? (
				<MenuButton
					label={t.workspace.view.more}
					iconOnly
					icon="⋯"
					items={[files, terminal].map((a) => ({
						id: a.id,
						label: a.label,
						disabled: a.disabled,
						onSelect: a.run,
					}))}
				/>
			) : null}
			<AccountMenu />
		</>
	);
}
