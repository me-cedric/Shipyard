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
	new RegExp(`${name.replace("*", "\\*")}:\\s*([^;]+);`).exec(body)?.[1]?.trim();
/** Lightness of the light and the dark value of a light-dark(oklch(), oklch()) token. */
const lightness = (body: string, name: string) => {
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
		const sizes = [...theme.matchAll(/--text-(\d+):\s*(\d+)px/g)].map((m) => `${m[1]}:${m[2]}`);
		expect(sizes).toEqual(["11:11", "12:12", "13:13", "14:14", "16:16", "20:20"]);
	});

	it("allows the radii 4 and 6, and no shadow", () => {
		expect(decl(theme, "--radius-sm")).toBe("4px");
		expect(decl(theme, "--radius-md")).toBe("6px");
		for (const s of ["--shadow-*", "--inset-shadow-*", "--drop-shadow-*"])
			expect(decl(theme, s)).toBe("initial");
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
			/\bshadow/,
			/\b(?:text|bg|border|fill|stroke|ring|outline|from|to|via)-(?:red|green|blue|gray|grey|slate|zinc|neutral|white|black|yellow|orange|amber|emerald|sky|indigo|violet|purple|pink|rose)\b/,
			/\b(?:text|bg|fill)-\[/,
			/\bfont-(?:serif|bold|black|thin)\b/,
		];
		for (const [path, text] of Object.entries(sources)) {
			// A test names the values it forbids. The gallery holds a draw.io sample as data. The slide
			// deck takes the colours and the font of the user's deck style (data, not component style).
			if (/\.test\.tsx?$/.test(path) || /gallery\/|slide-deck\.tsx$/.test(path)) continue;
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
	});

	it("loops only the active-run indicator", () => {
		const loops = Object.entries(sources).filter(
			([p, t]) => !/\.test\./.test(p) && /\banimate-(?!none)/.test(t),
		);
		expect(loops.map(([p]) => p)).toEqual(["/src/ui/atoms/status-dot.tsx"]);
		expect(decl(block("@theme"), "--animate-status-pulse")).toContain("infinite");
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
});

describe("densities (REQ-013)", () => {
	it("uses a 28 px row and 13 px text by default", () => {
		const root = block(":root");
		expect(decl(root, "--row-h")).toBe("28px");
		expect(decl(root, "--text-ui")).toBe("13px");
	});

	it("changes the row height and the text size in compact, and nothing else", () => {
		const compact = block(':root[data-density="compact"]');
		expect(decl(compact, "--row-h")).toBe("24px");
		expect(decl(compact, "--text-ui")).toBe("12px");
		expect([...compact.matchAll(/--[\w-]+:/g)].map((m) => m[0])).toEqual([
			"--row-h:",
			"--text-ui:",
		]);
	});
});
