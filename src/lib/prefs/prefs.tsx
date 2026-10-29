import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type Density = "default" | "compact";
export type Contrast = "default" | "high";
export type Prefs = { theme: Theme; density: Density; contrast: Contrast };

const KEY = "shipyard.prefs";
const DEFAULTS: Prefs = { theme: "system", density: "default", contrast: "default" };

function load(): Prefs {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		return {
			theme: ["light", "dark", "system"].includes(raw.theme) ? raw.theme : DEFAULTS.theme,
			density: ["default", "compact"].includes(raw.density) ? raw.density : DEFAULTS.density,
			contrast: ["default", "high"].includes(raw.contrast) ? raw.contrast : DEFAULTS.contrast,
		};
	} catch {
		return DEFAULTS;
	}
}

type Ctx = Prefs & { setPrefs: (patch: Partial<Prefs>) => void };
const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
	const [prefs, setState] = useState<Prefs>(load);

	useEffect(() => {
		const el = document.documentElement;
		el.dataset.theme = prefs.theme;
		el.dataset.density = prefs.density;
		el.dataset.contrast = prefs.contrast;
		localStorage.setItem(KEY, JSON.stringify(prefs));
	}, [prefs]);

	const value = useMemo<Ctx>(
		() => ({ ...prefs, setPrefs: (patch) => setState((p) => ({ ...p, ...patch })) }),
		[prefs],
	);
	return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
	const ctx = useContext(PrefsContext);
	if (!ctx) throw new Error("usePrefs needs PrefsProvider");
	return ctx;
}
