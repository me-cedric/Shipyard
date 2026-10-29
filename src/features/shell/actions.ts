import { useNavigate } from "@tanstack/react-router";
import { type ComponentType, useEffect, useMemo } from "react";
import { canCommit, useChanges, useCodeActions } from "@/lib/code";
import { format, type Lang, useI18n } from "@/lib/i18n";
import { errorDialog } from "@/lib/ipc";
import { type Theme, usePrefs } from "@/lib/prefs";
import { outcomeError, useProjectActions } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useSyncNow } from "@/lib/sync";
import { useUpdateCheck } from "@/lib/updates";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	BookOpenIcon,
	CheckIcon,
	ChevronRightIcon,
	CodeBracketIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	CpuChipIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	HomeIcon,
	LanguageIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	SunIcon,
	SwatchIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { orderedSpaces, type SpaceId } from "./spaces";

type Icon = ComponentType<{ size?: number }>;

export type Action = {
	id: string;
	label: string;
	Icon: Icon;
	/** Text that shows in the palette and in tooltips. */
	shortcut?: string;
	/** With Mod, the key that runs the action. */
	key?: string;
	/** The action cannot run now. The status bar shows it off and the palette hides it. */
	disabled?: boolean;
	run: () => void;
};

export const SPACE_ICON: Record<SpaceId, Icon> = {
	home: HomeIcon,
	design: SwatchIcon,
	specs: DocumentTextIcon,
	work: ViewColumnsIcon,
	factory: CpuChipIcon,
	code: CodeBracketIcon,
	knowledge: BookOpenIcon,
	settings: Cog6ToothIcon,
};

const THEME_ICON: Record<Theme, Icon> = {
	light: SunIcon,
	dark: MoonIcon,
	system: ComputerDesktopIcon,
};

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export const shortcutText = (key: string) => `${MAC ? "⌘" : "Ctrl+"}${key.toUpperCase()}`;

/** The one registry. The palette and the status bar read it. */
export function useActions() {
	const { t, setLang } = useI18n();
	const { role, sidebarOpen, setPrefs } = usePrefs();
	const navigate = useNavigate();
	const shell = useShell();
	const { openFolder } = useProjectActions();
	const { inspectorOpen, setInspectorOpen, setPaletteOpen, sync, setCommitOpen } = shell;
	const { pull } = useCodeActions();
	const syncNow = useSyncNow();
	const stageable = canCommit(useChanges().data);
	const checkUpdate = useUpdateCheck();

	return useMemo(() => {
		const withKey = (a: Omit<Action, "shortcut"> & { key: string }): Action => ({
			...a,
			shortcut: shortcutText(a.key),
		});
		const spaces = orderedSpaces(role).map((space, i) =>
			withKey({
				id: `go-${space}`,
				label: t.space[space],
				Icon: SPACE_ICON[space],
				key: String(i + 1),
				run: () => navigate({ to: `/${space}` as const }),
			}),
		);
		const openProject: Action = {
			id: "project-open",
			label: t.projects.open,
			Icon: FolderOpenIcon,
			run: () =>
				void openFolder().then((o) => {
					const error = o && outcomeError(t, o);
					if (error) void errorDialog(error);
				}),
		};
		// The sync action runs one tick, then fetches and brings the working branch up to date
		// (`add-sync` REQ-013, `add-code` REQ-014). A failed tick does not skip the git part.
		const syncAction: Action = {
			id: "sync",
			label: t.shell.sync,
			Icon: ArrowPathIcon,
			run: () =>
				sync(async () => {
					const tick = await syncNow().then(
						() => null,
						(e: unknown) => e,
					);
					await pull();
					if (tick) throw tick;
				}),
		};
		// The one commit action (`add-code` REQ-007): it stays off with nothing staged.
		const commit: Action = {
			id: "commit",
			label: t.shell.commit,
			Icon: CheckIcon,
			disabled: !stageable,
			run: () => setCommitOpen(true),
		};
		// The palette lists the projects. This action opens it for the native menu (REQ-012).
		const switchProject: Action = {
			id: "project-switch",
			label: t.menu.projectSwitch,
			Icon: FolderOpenIcon,
			run: () => setPaletteOpen(true),
		};
		const updateCheck: Action = {
			id: "update-check",
			label: t.menu.updateCheck,
			Icon: ArrowDownTrayIcon,
			run: () => void checkUpdate(true),
		};
		const list: Action[] = [
			...spaces,
			withKey({
				id: "palette",
				label: t.palette.title,
				Icon: MagnifyingGlassIcon,
				key: "k",
				run: () => setPaletteOpen(true),
			}),
			withKey({
				id: "toggle-sidebar",
				label: t.shell.toggleSidebar,
				Icon: ChevronRightIcon,
				key: "b",
				run: () => setPrefs({ sidebarOpen: !sidebarOpen }),
			}),
			withKey({
				id: "toggle-inspector",
				label: t.shell.toggleInspector,
				Icon: ViewColumnsIcon,
				key: "i",
				run: () => setInspectorOpen(!inspectorOpen),
			}),
			...(["light", "dark", "system"] as const).map(
				(theme): Action => ({
					id: `theme-${theme}`,
					label: format(t.shell.themeTo, { name: t.theme[theme] }),
					Icon: THEME_ICON[theme],
					run: () => setPrefs({ theme }),
				}),
			),
			...(["en", "fr"] as const).map(
				(l: Lang): Action => ({
					id: `lang-${l}`,
					label: format(t.shell.langTo, { name: t.lang[l] }),
					Icon: LanguageIcon,
					run: () => setLang(l),
				}),
			),
			openProject,
			switchProject,
			syncAction,
			commit,
			updateCheck,
		];
		return { list, sync: syncAction, commit };
	}, [
		t,
		role,
		sidebarOpen,
		inspectorOpen,
		navigate,
		setPrefs,
		setLang,
		setInspectorOpen,
		setPaletteOpen,
		sync,
		syncNow,
		pull,
		setCommitOpen,
		stageable,
		openFolder,
		checkUpdate,
	]);
}

/** Mod+key runs the action with that key. Mod is Cmd or Ctrl. */
export function useShortcuts(list: Action[]) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
			// Digits by physical key: on AZERTY, Mod+1 sends "&" as e.key.
			const key = /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase();
			const action = list.find((a) => a.key === key);
			if (!action) return;
			e.preventDefault();
			action.run();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [list]);
}
