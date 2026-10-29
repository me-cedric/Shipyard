import { useNavigate } from "@tanstack/react-router";
import { type ComponentType, useEffect, useMemo } from "react";
import { format, type Lang, useI18n } from "@/lib/i18n";
import { type Theme, usePrefs } from "@/lib/prefs";
import {
	ArrowPathIcon,
	BookOpenIcon,
	CheckIcon,
	ChevronRightIcon,
	CodeBracketIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	CpuChipIcon,
	DocumentTextIcon,
	HomeIcon,
	LanguageIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	SunIcon,
	SwatchIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import { useShell } from "./shell-state";
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
	const { inspectorOpen, setInspectorOpen, setPaletteOpen, sync } = shell;

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
		const syncAction: Action = { id: "sync", label: t.shell.sync, Icon: ArrowPathIcon, run: sync };
		// Placeholder: the real commit comes with `add-code`.
		const commit: Action = { id: "commit", label: t.shell.commit, Icon: CheckIcon, run: () => {} };
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
			syncAction,
			commit,
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
