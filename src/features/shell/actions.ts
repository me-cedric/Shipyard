import { useNavigate } from "@tanstack/react-router";
import { type ComponentType, useEffect, useMemo } from "react";
import { canCommit, useChanges, useCodeActions } from "@/lib/code";
import { format, type Lang, useI18n } from "@/lib/i18n";
import { commands, errorDialog, unwrap } from "@/lib/ipc";
import { type Theme, usePrefs } from "@/lib/prefs";
import { outcomeError, useActiveProject, useProjectActions } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { chordOf, chordText, useShortcutBindings } from "@/lib/shell/shortcuts";
import { useSyncNow } from "@/lib/sync";
import { useUpdateCheck } from "@/lib/updates";
import { openWhatsNew } from "@/lib/updates/whats-new";
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	BookOpenIcon,
	ChatBubbleIcon,
	CheckIcon,
	ChevronRightIcon,
	CodeBracketIcon,
	Cog6ToothIcon,
	CommandLineIcon,
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
	XMarkIcon,
} from "@/ui/icons";
import { orderedSpaces, type SpaceId } from "./spaces";

type Icon = ComponentType<{ size?: number }>;

export type Action = {
	id: string;
	label: string;
	Icon: Icon;
	/** Text that shows in the palette and in tooltips. */
	shortcut?: string;
	/** The chord in force (`mod+k`): the one that the person set, else the default. */
	chord?: string;
	/** The chord that ships with the app. */
	defaultChord?: string;
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

export const shortcutText = (key: string) => chordText(`mod+${key}`);

/** The one registry. The palette, the context bar and the status bar read it. */
export function useActions() {
	const { t, setLang } = useI18n();
	const { role, sidebarOpen, setPrefs, profile, theme } = usePrefs();
	const navigate = useNavigate();
	const shell = useShell();
	const { openFolder, close } = useProjectActions();
	const hasProject = Boolean(useActiveProject().data);
	const {
		inspectorOpen,
		setInspectorOpen,
		setPaletteOpen,
		assistantOpen,
		setAssistantOpen,
		sync,
		setCommitOpen,
		selectedRef,
		explain,
		filesOpen,
		setFilesOpen,
		terminalOpen,
		setTerminalOpen,
	} = shell;
	const { pull } = useCodeActions();
	const syncNow = useSyncNow();
	const stageable = canCommit(useChanges().data);
	const checkUpdate = useUpdateCheck();
	const { bindings } = useShortcutBindings();
	const { setShortcutsOpen } = shell;

	return useMemo(() => {
		const withKey = (
			a: Omit<Action, "shortcut" | "chord" | "defaultChord"> & { key: string },
		): Action => {
			const { key, ...rest } = a;
			const defaultChord = key.includes("+") ? key : `mod+${key}`;
			const chord = bindings[a.id] ?? defaultChord;
			return { ...rest, chord, defaultChord, shortcut: chordText(chord) };
		};
		const spaces = orderedSpaces(role, profile.tabs).map((space, i) =>
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
			...withKey({
				id: "sync",
				label: t.shell.sync,
				Icon: ArrowPathIcon,
				key: "mod+shift+s",
				run: () =>
					sync(async () => {
						// With auto-commit on, the pending changes are committed first.
						await unwrap(commands.autoCommitRun());
						const tick = await syncNow().then(
							() => null,
							(e: unknown) => e,
						);
						await pull();
						if (tick) throw tick;
					}),
			}),
		};
		// The one commit action (`add-code` REQ-007): it stays off with nothing staged.
		const commit: Action = withKey({
			id: "commit",
			label: t.shell.commit,
			Icon: CheckIcon,
			key: "mod+shift+enter",
			// A read only profile makes no commit.
			disabled: !stageable || profile.readOnly,
			run: () => setCommitOpen(true),
		});
		// The palette lists the projects. This action opens it for the native menu (REQ-012).
		const switchProject: Action = {
			id: "project-switch",
			label: t.menu.projectSwitch,
			Icon: FolderOpenIcon,
			run: () => setPaletteOpen(true),
		};
		const closeProject: Action = {
			id: "project-close",
			label: t.projects.close,
			Icon: XMarkIcon,
			disabled: !hasProject,
			run: () => void close(),
		};
		const updateCheck: Action = {
			id: "update-check",
			label: t.menu.updateCheck,
			Icon: ArrowDownTrayIcon,
			run: () => void checkUpdate(true),
		};
		const whatsNew: Action = {
			id: "whats-new",
			label: t.menu.whatsNew,
			Icon: ArrowDownTrayIcon,
			run: openWhatsNew,
		};
		const assistant = withKey({
			id: "toggle-assistant",
			label: t.assistant.title,
			Icon: ChatBubbleIcon,
			key: "j",
			run: () => setAssistantOpen(!assistantOpen),
		});
		const palette = withKey({
			id: "palette",
			label: t.palette.title,
			Icon: MagnifyingGlassIcon,
			key: "k",
			run: () => setPaletteOpen(true),
		});
		// The drawers need a working copy.
		const files = withKey({
			id: "toggle-files",
			label: t.panels.files.toggle,
			Icon: FolderOpenIcon,
			key: "p",
			disabled: !hasProject,
			run: () => setFilesOpen(!filesOpen),
		});
		const terminal = withKey({
			id: "toggle-terminal",
			label: t.panels.terminal.toggle,
			Icon: CommandLineIcon,
			key: "`",
			disabled: !hasProject,
			run: () => setTerminalOpen(!terminalOpen),
		});
		const NEXT_THEME: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
		const shortcuts = withKey({
			id: "shortcuts-help",
			label: t.ui.menu.shortcuts,
			Icon: CommandLineIcon,
			key: "mod+shift+k",
			run: () => setShortcutsOpen(true),
		});
		const list: Action[] = [
			...spaces,
			assistant,
			palette,
			files,
			terminal,
			shortcuts,
			withKey({
				id: "toggle-theme",
				label: t.ui.menu.toggleTheme,
				Icon: SwatchIcon,
				key: "mod+shift+l",
				run: () => setPrefs({ theme: NEXT_THEME[theme] }),
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
			...(selectedRef
				? [
						{
							id: "explain",
							label: format(t.knowledge.explainRef, { ref: selectedRef }),
							Icon: BookOpenIcon,
							run: () => explain(selectedRef),
						} satisfies Action,
					]
				: []),
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
			closeProject,
			syncAction,
			commit,
			updateCheck,
			whatsNew,
		];
		return { list, sync: syncAction, commit, assistant, palette, files, terminal };
	}, [
		t,
		role,
		sidebarOpen,
		inspectorOpen,
		assistantOpen,
		setAssistantOpen,
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
		profile,
		openFolder,
		close,
		hasProject,
		checkUpdate,
		selectedRef,
		explain,
		bindings,
		setShortcutsOpen,
		theme,
		filesOpen,
		setFilesOpen,
		terminalOpen,
		setTerminalOpen,
	]);
}

/** The chord of an action runs it. A chord holds Mod, which is Cmd or Ctrl. */
export function useShortcuts(list: Action[]) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			// The overlay that captures a new chord stops the key itself.
			if (e.defaultPrevented) return;
			const chord = chordOf(e);
			if (!chord.startsWith("mod+")) return;
			const action = list.find((a) => a.chord === chord);
			if (!action || action.disabled) return;
			e.preventDefault();
			action.run();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [list]);
}
