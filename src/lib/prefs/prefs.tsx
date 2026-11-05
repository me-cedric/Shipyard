import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
	type Accent,
	type Contrast,
	commands,
	type Density,
	type Prefs_Serialize,
	type Role,
	type Theme,
	unwrap,
} from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useActiveProject } from "@/lib/projects";
import { resolveTheme, themeVars } from "@/lib/themes";

export type { Accent, Contrast, Density, Role, Theme };
export const ROLES = ["pm", "architect", "developer", "qa", "ba", "lead", "junior"] as const;
/** A setting that a project can override. */
export type Overridable = "theme" | "density" | "contrast";
export type Prefs = Pick<
	Prefs_Serialize,
	| "theme"
	| "density"
	| "contrast"
	| "role"
	| "sidebarOpen"
	| "uiFont"
	| "codeFont"
	| "terminalShell"
	| "terminalFont"
	| "terminalApp"
	| "terminalFontSize"
	| "defaultAgent"
	| "defaultModel"
	| "autoUpdateCheck"
	| "promptLang"
	| "diagramFormat"
	| "accent"
	| "navSide"
	| "drawerSide"
	| "showAllPages"
	| "dateFormat"
	| "closePush"
	| "narrowBar"
	| "terminalDock"
	| "panelSizes"
	| "todaySeen"
	| "uiScale"
	| "tray"
	| "motion"
	| "focusRing"
	| "focusWidth"
	| "tourSeen"
	| "customTheme"
>;

/** Font stacks that are on the machine already. Nothing is fetched. */
export const UI_FONTS: Record<string, string> = {
	system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
	grotesk: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif',
	humanist: 'Optima, Candara, "Gill Sans", "Trebuchet MS", sans-serif',
	serif: 'Charter, Georgia, "Times New Roman", "Liberation Serif", serif',
	mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};
export const CODE_FONTS: Record<string, string> = {
	system: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
	menlo: 'Menlo, Monaco, "Courier New", monospace',
	courier: '"Courier New", Courier, monospace',
};

const DEFAULTS: Prefs = {
	theme: "system",
	density: "default",
	contrast: "default",
	role: "none",
	sidebarOpen: true,
	uiFont: "",
	codeFont: "",
	terminalShell: "",
	terminalFont: "",
	terminalApp: "",
	terminalFontSize: 13,
	defaultAgent: "",
	defaultModel: "",
	autoUpdateCheck: true,
	promptLang: "",
	diagramFormat: "",
	accent: null,
	navSide: "left",
	drawerSide: "left",
	showAllPages: false,
	dateFormat: "",
	closePush: false,
	narrowBar: false,
	terminalDock: "bottom",
	panelSizes: {},
	todaySeen: 0,
	uiScale: 16,
	tray: true,
	motion: "system",
	focusRing: "keyboard",
	focusWidth: 2,
	// True until the file loads, so the tour never flashes for a person who saw it.
	tourSeen: true,
	customTheme: "",
};

const DARK = "(prefers-color-scheme: dark)";

/** True while the system is dark. It follows a change of the system setting. */
export function useSystemDark() {
	const [dark, setDark] = useState(() => !!window.matchMedia?.(DARK).matches);
	useEffect(() => {
		const q = window.matchMedia?.(DARK);
		// A test stub of matchMedia can lack the listener API.
		if (!q?.addEventListener) return;
		const on = () => setDark(q.matches);
		q.addEventListener("change", on);
		return () => q.removeEventListener("change", on);
	}, []);
	return dark;
}

type Ctx = Prefs & {
	setPrefs: (patch: Partial<Prefs>) => void;
	/** The settings that the active project overrides. They show the project value. */
	overridden: Overridable[];
	/** The profile of the project: the spaces that stay visible (null is all), the hidden tabs as `space/tab`, and read only. */
	profile: {
		tabs: string[] | null;
		hiddenTabs: string[];
		/** The pages (`space/tab`) that the profile reads and does not edit. */
		readOnlyTabs: string[];
		readOnly: boolean;
	};
	loaded: boolean;
};
const PrefsContext = createContext<Ctx | null>(null);

/**
 * Preferences live in the app data folder. The active project can override the theme, the density, the
 * contrast and the accent from the registry (`projects` REQ-010, REQ-019).
 */
export function PrefsProvider({ children }: { children: ReactNode }) {
	const [personal, setPersonal] = useState<Prefs>(DEFAULTS);
	const [loaded, setLoaded] = useState(false);
	const project = useActiveProject().data;
	const [email, setEmail] = useState<string | null>(null);

	// The git e-mail picks the profile that the project assigns to this person.
	// biome-ignore lint/correctness/useExhaustiveDependencies: read again when the project changes
	useEffect(() => {
		unwrap(commands.profileEmailGet())
			.then(setEmail)
			.catch(() => setEmail(null));
	}, [project?.id]);

	useEffect(() => {
		unwrap(commands.prefsGet())
			.then(setPersonal)
			.catch(logError)
			.finally(() => setLoaded(true));
	}, []);

	const value = useMemo<Ctx>(() => {
		const o = project?.overrides;
		const overridden = (["theme", "density", "contrast"] as const).filter((k) => o?.[k]);
		// The assignment of this person wins, then the role of the project profile, then the personal role.
		const role =
			((email && o?.assignments?.[email]) as Role | undefined) ||
			(o?.profileRole as Role | null | undefined) ||
			personal.role;
		const modes = o?.pageModes?.[role] ?? {};
		const pagesIn = (mode: string) =>
			Object.entries(modes)
				.filter(([, m]) => m === mode)
				.map(([page]) => page);
		return {
			...personal,
			role,
			// Show all pages: the profile hides no page. Read only stays.
			profile: {
				tabs: o?.profileTabs?.length && !personal.showAllPages ? o.profileTabs : null,
				hiddenTabs: personal.showAllPages
					? []
					: [...new Set([...(o?.hiddenTabs ?? []), ...pagesIn("hidden")])],
				readOnlyTabs: pagesIn("read-only"),
				readOnly: o?.readOnly === true,
			},
			theme: o?.theme ?? personal.theme,
			density: o?.density ?? personal.density,
			contrast: o?.contrast ?? personal.contrast,
			overridden,
			loaded,
			setPrefs: (patch) => {
				setPersonal((p) => ({ ...p, ...patch }));
				// A null accent goes back to the colour of the theme.
				const wire =
					patch.accent === null ? { ...patch, accent: undefined, clearAccent: true } : patch;
				unwrap(commands.prefsSet(wire)).catch(logError);
			},
		};
	}, [personal, project, loaded, email]);

	const accent = project?.overrides.accent ?? personal.accent;
	const systemDark = useSystemDark();
	// An imported theme applies over its base, unless the project sets the theme (Q-139).
	const customId = value.overridden.includes("theme") ? "" : value.customTheme;
	const library = useQuery({
		queryKey: ["themes"],
		queryFn: () => unwrap(commands.themeList()),
		enabled: !!customId,
	}).data;
	const custom = customId ? library?.find((t) => t.id === customId) : undefined;
	useEffect(() => {
		if (!custom) return;
		const style = document.documentElement.style;
		// High contrast keeps its own colours: an imported theme then gives only its radius.
		const vars = Object.entries(themeVars(custom)).filter(
			([k]) => value.contrast !== "high" || k.startsWith("--radius-"),
		);
		for (const [k, v] of vars) style.setProperty(k, v);
		return () => {
			for (const [k] of vars) style.removeProperty(k);
		};
	}, [custom, value.contrast]);

	useEffect(() => {
		const el = document.documentElement;
		el.dataset.theme = resolveTheme(value.theme, systemDark);
		el.dataset.density = value.density;
		el.dataset.contrast = value.contrast;
		if (accent) el.dataset.accent = accent;
		else delete el.dataset.accent;
	}, [value.theme, value.density, value.contrast, accent, systemDark]);

	// The root attributes that the style sheet reads for the motion and the focus ring.
	useEffect(() => {
		const el = document.documentElement.dataset;
		el.motion = value.motion;
		el.focusRing = value.focusRing;
		el.focusWidth = String(value.focusWidth);
	}, [value.motion, value.focusRing, value.focusWidth]);

	// The root font size scales the text and the spacing, which are in rem.
	useEffect(() => {
		document.documentElement.style.fontSize = `${value.uiScale}px`;
	}, [value.uiScale]);

	// An empty key keeps the font of the theme.
	useEffect(() => {
		const el = document.documentElement.style;
		// The font of the person wins over the font of an imported theme.
		const ui = UI_FONTS[value.uiFont] ?? UI_FONTS[custom?.font ?? ""];
		const code = CODE_FONTS[value.codeFont];
		if (ui) el.setProperty("--font-sans", ui);
		else el.removeProperty("--font-sans");
		if (code) el.setProperty("--font-mono", code);
		else el.removeProperty("--font-mono");
	}, [value.uiFont, value.codeFont, custom?.font]);

	return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
	const ctx = useContext(PrefsContext);
	if (!ctx) throw new Error("usePrefs needs PrefsProvider");
	return ctx;
}
