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
	"theme" | "density" | "contrast" | "role" | "sidebarOpen"
>;

const DEFAULTS: Prefs = {
	theme: "system",
	density: "default",
	contrast: "default",
	role: "none",
	sidebarOpen: true,
};

type Ctx = Prefs & {
	setPrefs: (patch: Partial<Prefs>) => void;
	/** The settings that the active project overrides. They show the project value. */
	overridden: Overridable[];
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

	useEffect(() => {
		unwrap(commands.prefsGet())
			.then(setPersonal)
			.catch((e) => console.error(e))
			.finally(() => setLoaded(true));
	}, []);

	const value = useMemo<Ctx>(() => {
		const o = project?.overrides;
		const overridden = (["theme", "density", "contrast"] as const).filter((k) => o?.[k]);
		return {
			...personal,
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
	}, [personal, project, loaded]);

	const accent = project?.overrides.accent;
	useEffect(() => {
		const el = document.documentElement;
		el.dataset.theme = value.theme;
		el.dataset.density = value.density;
		el.dataset.contrast = value.contrast;
		if (accent) el.dataset.accent = accent;
		else delete el.dataset.accent;
	}, [value.theme, value.density, value.contrast, accent]);

	return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
	const ctx = useContext(PrefsContext);
	if (!ctx) throw new Error("usePrefs needs PrefsProvider");
	return ctx;
}
