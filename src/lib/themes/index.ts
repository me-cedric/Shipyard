import type { Theme, ThemeBase, ThemeFile } from "@/lib/ipc";
import TOKENS from "./tokens.json";

export { TOKENS };

/** The theme shortcut cycle (spec `themes`, REQ-002). "System, OLED when dark" goes on to Light. */
export const NEXT_THEME: Record<Theme, Theme> = {
	light: "dark",
	dark: "oled",
	oled: "system",
	system: "light",
	"system-oled": "light",
};

/** The value of `data-theme`: "System, OLED when dark" resolves here, the others in CSS. */
export function resolveTheme(theme: Theme, systemDark: boolean): Theme {
	if (theme === "system-oled") return systemDark ? "oled" : "light";
	return theme;
}

/** The base that the screen shows now, for an export of a built-in theme. */
export function baseOf(theme: Theme, systemDark: boolean): ThemeBase {
	const t = resolveTheme(theme, systemDark);
	return t === "light" || t === "dark" || t === "oled" ? t : systemDark ? "dark" : "light";
}

/** How far each neutral step sits from the background towards the text, in percent. */
const STEPS = [0, 3, 7, 10, 13, 17, 22, 30, 50, 58, 75];

/**
 * The CSS variables of a theme file (ADR 0018). The view derives the surfaces and the neutral scale
 * from `background` and `foreground`, then each advanced token wins. The values passed the check of
 * the theme file: no `url()` and no `var()` comes from the file.
 */
export function themeVars(t: ThemeFile): Record<string, string> {
	const v: Record<string, string> = {};
	if (t.foreground) v["--n-12"] = t.foreground;
	if (t.background) {
		const bg = t.background;
		v["--surface-0"] = bg;
		[4, 7, 10].forEach((p, i) => {
			v[`--surface-${i + 1}`] = `color-mix(in oklch, var(--n-12) ${p}%, ${bg})`;
		});
	}
	if (t.background || t.foreground) {
		// The text colour alone still moves the grey scale, from the surface of the base.
		const bg = t.background ?? "var(--surface-0)";
		STEPS.forEach((p, i) => {
			if (p) v[`--n-${i + 1}`] = `color-mix(in oklch, var(--n-12) ${p}%, ${bg})`;
			else if (t.background) v[`--n-${i + 1}`] = bg;
		});
	}
	if (t.accent) {
		v["--accent"] = t.accent;
		v["--accent-hover"] = "color-mix(in oklch, var(--accent) 85%, var(--n-12))";
		v["--accent-subtle"] = "color-mix(in oklch, var(--accent) 18%, var(--surface-0))";
		v["--accent-text"] = "color-mix(in oklch, var(--accent) 80%, var(--n-12))";
	}
	if (t.radius != null) {
		const r = t.radius;
		v["--radius-sm"] = `${r / 2}px`;
		v["--radius-md"] = `${r}px`;
		v["--radius-lg"] = `${r * 1.5}px`;
		v["--radius-xl"] = `${r * 2}px`;
	}
	for (const [k, value] of Object.entries(t.tokens ?? {})) v[`--${k}`] = value;
	return v;
}

/**
 * The tokens of the theme on the screen, as a theme file to export (REQ-007). A probe reads the
 * resolved colour of each token, so the file holds plain colours.
 */
export function snapshot(base: ThemeBase, name: string): ThemeFile {
	const probe = document.createElement("span");
	document.body.append(probe);
	const tokens: Record<string, string> = {};
	for (const k of TOKENS) {
		probe.style.color = `var(--${k})`;
		const c = getComputedStyle(probe).color;
		// A browser gives the resolved colour. A value that is still a variable is not a colour.
		if (c && !c.includes("var(")) tokens[k] = c;
	}
	probe.remove();
	return { shipyardTheme: 1, id: "my-theme", name, base, tokens };
}
