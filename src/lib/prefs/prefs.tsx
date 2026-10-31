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
import { useActiveProject } from "@/lib/projects";

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
};

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
			.catch((e) => console.error(e))
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
			profile: {
				tabs: o?.profileTabs?.length ? o.profileTabs : null,
				hiddenTabs: [...new Set([...(o?.hiddenTabs ?? []), ...pagesIn("hidden")])],
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
				unwrap(commands.prefsSet(patch)).catch((e) => console.error(e));
			},
		};
	}, [personal, project, loaded, email]);

	const accent = project?.overrides.accent;
	useEffect(() => {
		const el = document.documentElement;
		el.dataset.theme = value.theme;
		el.dataset.density = value.density;
		el.dataset.contrast = value.contrast;
		if (accent) el.dataset.accent = accent;
		else delete el.dataset.accent;
	}, [value.theme, value.density, value.contrast, accent]);

	// An empty key keeps the font of the theme.
	useEffect(() => {
		const el = document.documentElement.style;
		const ui = UI_FONTS[value.uiFont];
		const code = CODE_FONTS[value.codeFont];
		if (ui) el.setProperty("--font-sans", ui);
		else el.removeProperty("--font-sans");
		if (code) el.setProperty("--font-mono", code);
		else el.removeProperty("--font-mono");
	}, [value.uiFont, value.codeFont]);

	return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
	const ctx = useContext(PrefsContext);
	if (!ctx) throw new Error("usePrefs needs PrefsProvider");
	return ctx;
}
