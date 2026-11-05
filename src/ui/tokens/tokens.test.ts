// The vite config aliases node:fs to a browser stub, so the test takes the real module from process.
const { readFileSync } = (
	globalThis as unknown as {
		process: {
			getBuiltinModule: (id: string) => {
				readFileSync: (url: URL, encoding: "utf8") => string;
			};
		};
	}
).process.getBuiltinModule("node:fs");
const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const css = read("./tokens.css");
const fonts = read("./fonts.css");

const sources = import.meta.glob("/src/{ui,features,app}/**/*.{ts,tsx}", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

const block = (selector: string) => {
	const start = css.indexOf(`${selector} {`);
	expect(start, selector).toBeGreaterThan(-1);
	return css.slice(start, css.indexOf("\n}", start));
};
const decl = (body: string, name: string) =>
	// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp, javascript.lang.security.audit.incomplete-sanitization.incomplete-sanitization -- test input is a fixed token name
	new RegExp(`${name.replace("*", "\\*")}:\\s*([^;]+);`).exec(body)?.[1]?.trim();
/** Lightness of the light and the dark value of a light-dark(oklch(), oklch()) token. */
const lightness = (body: string, name: string) => {
	// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- test input is a fixed token name
	const m = new RegExp(
		`${name}:\\s*light-dark\\(oklch\\(([\\d.]+)[^)]*\\),\\s*oklch\\(([\\d.]+)`,
	).exec(body);
	return { light: Number(m?.[1]), dark: Number(m?.[2]) };
};

describe("tokens (REQ-001)", () => {
	const theme = block("@theme");
	const root = block(":root");

	it("defines a 12-step neutral scale that changes with the theme", () => {
		for (let i = 1; i <= 12; i++) expect(decl(root, `--n-${i}`), `n-${i}`).toMatch(/^light-dark\(/);
	});

	it("defines one accent and four status colours", () => {
		for (const c of ["accent", "success", "warning", "danger", "info"]) {
			expect(decl(root, `--${c}`), c).toBeDefined();
			expect(decl(root, `--${c}-subtle`), `${c}-subtle`).toBeDefined();
			expect(decl(root, `--${c}-text`), `${c}-text`).toBeDefined();
		}
	});

	it("allows only the type sizes 11, 12, 13, 14, 16 and 20", () => {
		const sizes = [...theme.matchAll(/--text-(\d+):\s*([\d.]+)rem/g)].map(
			(m) => `${m[1]}:${Number(m[2]) * 16}`,
		);
		expect(sizes).toEqual(["11:11", "12:12", "13:13", "14:14", "16:16", "20:20"]);
	});

	it("allows the radii 4, 8, 12 and 16, and only the elevation shadows", () => {
		expect(decl(theme, "--radius-sm")).toBe("4px");
		expect(decl(theme, "--radius-md")).toBe("8px");
		expect(decl(theme, "--radius-lg")).toBe("12px");
		expect(decl(theme, "--radius-xl")).toBe("16px");
		for (const s of ["--shadow-*", "--inset-shadow-*", "--drop-shadow-*"])
			expect(decl(theme, s)).toBe("initial");
		const inline = block("@theme inline");
		for (const n of ["1", "2", "3"])
			expect(decl(inline, `--shadow-${n}`)).toBe(`var(--elevation-${n})`);
		expect(decl(inline, "--shadow-glow")).toBe("var(--accent-glow)");
	});

	it("defines four surfaces, a dark-mode highlight, the accent gradient and soft status tints (ADR 0014)", () => {
		for (let i = 0; i <= 3; i++) expect(decl(root, `--surface-${i}`), `surface-${i}`).toBeDefined();
		expect(decl(root, "--highlight")).toMatch(/^light-dark\(/);
		for (const n of [1, 2, 3]) expect(decl(root, `--elevation-${n}`)).toContain("var(--highlight)");
		expect(decl(root, "--accent-gradient")).toContain("var(--gradient-to)");
		expect(decl(root, "--gradient-to")).toContain("calc(h + 40)");
		for (const c of ["accent", "success", "warning", "danger", "info"])
			expect(decl(root, `--${c}-soft`), `${c}-soft`).toContain(`var(--${c})`);
		expect(css).toContain("@utility bg-canvas");
		expect(css).toContain("font-variant-numeric: tabular-nums");
	});

	it("drops the default Tailwind palette", () => {
		expect(decl(theme, "--color-*")).toBe("initial");
	});

	it("takes the accent from a per-project hue", () => {
		for (const name of ["blue", "violet", "green", "orange", "rose"])
			expect(decl(block(`:root[data-accent="${name}"]`), "--accent-hue"), name).toMatch(/^\d+$/);
		expect(decl(block(":root[data-accent]"), "--accent")).toContain("var(--accent-hue)");
	});

	it("uses no colour, shadow or text size outside the tokens in src/ui, src/features and src/app", () => {
		const hits: string[] = [];
		const rules = [
			/#[0-9a-fA-F]{3,8}\b/,
			/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/,
			// Only the elevation tokens: shadow-1, shadow-2, shadow-3 and shadow-glow.
			/(?<!transition-)\bshadow(?!-(?:1|2|3|glow)\b)/,
			/\b(?:text|bg|border|fill|stroke|ring|outline|from|to|via)-(?:red|green|blue|gray|grey|slate|zinc|neutral|white|black|yellow|orange|amber|emerald|sky|indigo|violet|purple|pink|rose)\b/,
			/\b(?:text|bg|fill)-\[/,
			/\bfont-(?:serif|bold|black|thin)\b/,
		];
		for (const [path, text] of Object.entries(sources)) {
			// A test names the values it forbids. The gallery holds a draw.io sample as data. The slide
			// deck takes the colours and the font of the user's deck style (data, not component style).
			// The design token view parses the token values of tokens.css to show them. The draw.io
			// drawing uses the default colours of draw.io for a file with no colour (a picture, not UI).
			// The brand logos keep the colour of their owner (data, shown only on request).
			if (
				/\.test\.tsx?$/.test(path) ||
				/gallery\/|slide-deck\.tsx$|design\/tokens\.tsx$|organisms\/drawio\.ts$|atoms\/brands\.ts$/.test(
					path,
				)
			)
				continue;
			for (const re of rules) if (re.test(text)) hits.push(`${path}: ${re}`);
		}
		expect(hits).toEqual([]);
	});
});

describe("motion (REQ-002)", () => {
	it("defines the two durations 120 ms and 200 ms", () => {
		const theme = block("@theme");
		expect(decl(theme, "--duration-fast")).toBe("120ms");
		expect(decl(theme, "--duration-base")).toBe("200ms");
		expect(decl(theme, "--duration-thumb")).toBe("180ms");
	});

	it("loops only the live-state indicators (active run, live agent, running sync) and the loading rows", () => {
		const loops = Object.entries(sources).filter(
			([p, t]) => !/\.test\./.test(p) && /\banimate-(?!none)/.test(t),
		);
		expect(loops.map(([p]) => p).sort()).toEqual([
			"/src/ui/atoms/animated-icon.tsx",
			"/src/ui/atoms/live-dot.tsx",
			"/src/ui/atoms/status-dot.tsx",
			"/src/ui/molecules/loading.tsx",
		]);
		expect(decl(block("@theme"), "--animate-status-pulse")).toContain("infinite");
		expect(decl(block("@theme"), "--animate-live")).toContain("infinite");
	});

	it("removes motion when the system asks for reduced motion", () => {
		const m = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
		expect(m).toContain("animation-iteration-count: 1 !important");
		expect(m).toContain("animation-duration: 0.01ms !important");
		expect(m).toContain("transition-duration: 0.01ms !important");
	});
});

describe("fonts (REQ-003)", () => {
	it("uses Inter for text until Switzer is licensed, and Departure Mono for code", () => {
		const theme = block("@theme");
		expect(decl(theme, "--font-sans")).toMatch(/^"Inter Variable"/);
		expect(decl(theme, "--font-mono")).toMatch(/^"Departure Mono"/);
		expect(fonts).toContain("@fontsource-variable/inter");
		expect(fonts).toContain("DepartureMono-Regular.woff2");
		expect(css).toContain('@import "./fonts.css"');
	});

	it("keeps a system fallback after each font", () => {
		const theme = block("@theme");
		expect(decl(theme, "--font-sans")).toContain("system-ui");
		expect(decl(theme, "--font-mono")).toContain("monospace");
	});
});

describe("themes (REQ-011)", () => {
	it("follows the system until a theme is chosen, then forces it", () => {
		expect(decl(block(":root"), "color-scheme")).toBe("light dark");
		expect(decl(block(':root[data-theme="light"]'), "color-scheme")).toBe("light");
		expect(decl(block(':root[data-theme="dark"]'), "color-scheme")).toBe("dark");
	});

	it("gives the dark theme dark neutrals", () => {
		const root = block(":root");
		expect(lightness(root, "--n-1").dark).toBeLessThan(0.3);
		expect(lightness(root, "--n-1").light).toBeGreaterThan(0.9);
		expect(lightness(root, "--n-12").dark).toBeGreaterThan(0.9);
		expect(lightness(root, "--n-12").light).toBeLessThan(0.3);
	});
});

describe("high contrast (REQ-012)", () => {
	const root = block(":root");
	const high = block(':root[data-contrast="high"]');

	it("moves text and borders further from the background in both themes", () => {
		for (const n of [10, 11, 12]) {
			const d = lightness(root, `--n-${n}`);
			const h = lightness(high, `--n-${n}`);
			expect(h.light, `n-${n} light`).toBeLessThan(d.light);
			expect(h.dark, `n-${n} dark`).toBeGreaterThan(d.dark);
		}
		for (const n of [6, 7, 8]) {
			const d = lightness(root, `--n-${n}`);
			const h = lightness(high, `--n-${n}`);
			expect(h.light, `n-${n} light`).toBeLessThan(d.light);
			expect(h.dark, `n-${n} dark`).toBeGreaterThan(d.dark);
		}
	});

	it("moves the accent text further from the soft accent tint of the active page tab", () => {
		const ls = (body: string) =>
			[...(decl(body, "--accent-text") ?? "").matchAll(/oklch\(([\d.]+)/g)].map((m) =>
				Number(m[1]),
			);
		const [dl = 0, dd = 0] = ls(root);
		const [hl = 0, hd = 0] = ls(high);
		expect(hl).toBeLessThan(dl);
		expect(hd).toBeGreaterThan(dd);
	});
});

describe("densities (REQ-013)", () => {
	it("uses a 28 px row and 13 px text by default", () => {
		const root = block(":root");
		expect(decl(root, "--row-h")).toBe("28px");
		// rem, so that the text size of Settings / Me scales it
		expect(decl(root, "--text-ui")).toBe("0.8125rem");
	});

	it("changes the row height and the text size in compact, and nothing else", () => {
		const compact = block(':root[data-density="compact"]');
		expect(decl(compact, "--row-h")).toBe("24px");
		expect(decl(compact, "--text-ui")).toBe("0.75rem");
		expect([...compact.matchAll(/--[\w-]+:/g)].map((m) => m[0])).toEqual([
			"--row-h:",
			"--text-ui:",
		]);
	});
});

/** The relative luminance (WCAG) of an `oklch(L C H)` colour, through linear sRGB. */
const luminance = (oklch: string) => {
	const [L = 0, C = 0, H = 0] = (/oklch\(([^)]*)\)/.exec(oklch)?.[1] ?? "")
		.split(/\s+/)
		.map(Number);
	const a = C * Math.cos((H * Math.PI) / 180);
	const b = C * Math.sin((H * Math.PI) / 180);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const clamp = (x: number) => Math.min(1, Math.max(0, x));
	const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
	const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
	const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
	return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};
const contrast = (x: string, y: string) => {
	const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
	return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe("OLED theme (themes REQ-001)", () => {
	const oled = block(
		':root[data-theme="oled"],\n:root[data-theme="oled"] .canvas-dark,\n[data-scheme="oled"]',
	);
	const root = block(":root");
	/** The dark half of a light-dark() token of :root. */
	const dark = (name: string) => /,\s*(oklch\([^)]*\))\)$/.exec(decl(root, name) ?? "")?.[1] ?? "";

	it("forces the dark scheme on a true black base", () => {
		expect(decl(oled, "color-scheme")).toBe("dark");
		expect(decl(oled, "--surface-0")).toBe("oklch(0 0 0)");
		expect(decl(oled, "--n-1")).toBe("oklch(0 0 0)");
		expect(css).toContain(':root[data-theme="oled"] .canvas-dark');
	});

	it("lifts each surface by a small step", () => {
		const ls = [0, 1, 2, 3].map((i) =>
			Number(/oklch\(([\d.]+)/.exec(decl(oled, `--surface-${i}`) ?? "")?.[1]),
		);
		for (let i = 1; i < 4; i++) {
			expect(ls[i] ?? 0).toBeGreaterThan(ls[i - 1] ?? 0);
			expect((ls[i] ?? 0) - (ls[i - 1] ?? 0)).toBeLessThanOrEqual(0.12);
		}
	});

	it("keeps the accent of the dark theme", () => {
		for (const k of ["--accent", "--accent-text", "--accent-subtle", "--success", "--danger"])
			expect(decl(oled, k), k).toBeUndefined();
	});

	it("gives text 4.5:1 or more on each surface (WCAG AA)", () => {
		const grounds = [
			"--surface-0",
			"--surface-1",
			"--surface-2",
			"--surface-3",
			"--n-2",
			"--n-3",
			"--n-4",
		].map((k) => [k, decl(oled, k) ?? ""] as const);
		const texts = [
			...["--n-10", "--n-11", "--n-12"].map((k) => [k, decl(oled, k) ?? ""] as const),
			...["--accent-text", "--success-text", "--warning-text", "--danger-text", "--info-text"].map(
				(k) => [k, dark(k)] as const,
			),
		];
		for (const [tk, tv] of texts) {
			expect(tv, tk).toMatch(/^oklch\(/);
			for (const [gk, gv] of grounds)
				expect(contrast(tv, gv), `${tk} on ${gk}`).toBeGreaterThanOrEqual(4.5);
		}
	});
});
