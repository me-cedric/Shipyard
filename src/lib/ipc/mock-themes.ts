// The mock of the theme commands. It mirrors `crates/shipyard-store/src/themes.rs` and the check of
// `crates/shipyard-core/src/theme.rs`: each fault names its field, and nothing is saved on a fault.
// The Rust tests of those files are the proof of the check; this copy serves the view tests.
import TOKENS from "@/lib/themes/tokens.json";
import type { ThemeFile, ThemeFile_Serialize } from "./bindings";

export const THEME_PATH = "/mock/harbor-night.json";
export const BAD_THEME_PATH = "/mock/bad-theme.json";

export const SAMPLE_THEME: ThemeFile_Serialize = {
	shipyardTheme: 1,
	id: "harbor-night",
	name: "Harbor night",
	base: "dark",
	accent: "#3bb9fd",
	background: "#0b1622",
	foreground: "#e6edf3",
	radius: 6,
	font: "humanist",
	tokens: { "n-11": "#9fb3c8" },
};

const FONTS = ["system", "grotesk", "humanist", "serif", "mono"];
const COLOUR =
	/^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|oklch|oklab|lab|lch|color)\([a-z0-9 .,%/+-]{1,150}\))$/i;

/** Each fault as `<field>: <reason>`, as the backend lists them. */
export function themeFaults(t: ThemeFile): string[] {
	const out: string[] = [];
	if (t.shipyardTheme !== 1)
		out.push(`shipyardTheme: version ${t.shipyardTheme} is not known, use 1`);
	if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(t.id))
		out.push("id: use 1 to 40 lower case letters, digits and -");
	if (!t.name.trim() || t.name.length > 60) out.push("name: use 1 to 60 characters");
	for (const f of ["accent", "background", "foreground"] as const) {
		const v = t[f];
		if (v != null && !COLOUR.test(v)) out.push(`${f}: not a colour`);
	}
	if (t.radius != null && t.radius > 16) out.push("radius: use 0 to 16");
	if (t.font != null && !FONTS.includes(t.font)) out.push(`font: use one of ${FONTS.join(", ")}`);
	for (const [k, v] of Object.entries(t.tokens ?? {})) {
		if (!TOKENS.includes(k)) out.push(`tokens.${k}: not a token`);
		else if (!COLOUR.test(v)) out.push(`tokens.${k}: not a colour`);
	}
	return out;
}

const check = (t: ThemeFile) => {
	const f = themeFaults(t);
	if (f.length) throw f.join("\n");
};

/** The mock reads two files: the sample theme, and a theme with two faults. */
export function themeRead(path: string): ThemeFile_Serialize {
	if (path === BAD_THEME_PATH) {
		check({ ...SAMPLE_THEME, radius: 40, tokens: { "n-99": "#000" } });
	}
	if (!path.endsWith(".json")) throw "the theme is not a file or is larger than 64 KB";
	return structuredClone(SAMPLE_THEME);
}

export function themeAdd(library: ThemeFile_Serialize[], t: ThemeFile): ThemeFile_Serialize[] {
	check(t);
	const kept = library.filter((x) => x.id !== t.id);
	return [...kept, t as ThemeFile_Serialize].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
	);
}

export function themeExport(
	exported: Record<string, ThemeFile_Serialize>,
	path: string,
	t: ThemeFile,
) {
	check(t);
	exported[path] = t as ThemeFile_Serialize;
	return null;
}
