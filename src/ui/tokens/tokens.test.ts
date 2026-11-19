import { DURATION } from "../motion";

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
/** The light and the dark value of a light-dark() token. A project hue reads as the default blue. */
const pair = (body: string, name: string) => {
	const v = (decl(body, name) ?? "").replace(/var\(--accent-hue(?:, \d+)?\)/g, "265");
	const m = /^light-dark\(\s*(#\w+|oklch\([^)]*\))\s*,\s*(#\w+|oklch\([^)]*\))\s*\)$/.exec(v);
	return { light: m?.[1] ?? "", dark: m?.[2] ?? "" };
};
/** The linear sRGB parts of a hex colour or an `oklch(L C H)` colour. */
const linear = (colour: string): number[] => {
	if (colour.startsWith("#"))
		return [1, 3, 5].map((i) => {
			const v = Number.parseInt(colour.slice(i, i + 2), 16) / 255;
			return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		});
	const [L = 0, C = 0, H = 0] = (/oklch\(([^)]*)\)/.exec(colour)?.[1] ?? "")
		.split(/\s+/)
		.map(Number);
	const a = C * Math.cos((H * Math.PI) / 180);
	const b = C * Math.sin((H * Math.PI) / 180);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const clamp = (x: number) => Math.min(1, Math.max(0, x));
	return [
		clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
};
/** The relative luminance (WCAG) of a colour. */
const luminance = (colour: string) => {
	const [r = 0, g = 0, b = 0] = linear(colour);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x: string, y: string) => {
	const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
	return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};
/** The luminance of the light and the dark value of a light-dark() token. */
const lightness = (body: string, name: string) => {
	const { light, dark } = pair(body, name);
	return { light: luminance(light), dark: luminance(dark) };
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

	it("allows only the type sizes 11, 12, 13, 14, 15, 16, 17, 20, 30 and 44", () => {
		const sizes = [...theme.matchAll(/--text-(\d+):\s*([\d.]+)rem/g)].map(
			(m) => `${m[1]}:${Number(m[2]) * 16}`,
		);
		expect(sizes).toEqual([
			"11:11",
			"12:12",
			"13:13",
			"14:14",
			"15:15",
			"16:16",
			"17:17",
			"20:20",
			"30:30",
			"44:44",
		]);
		expect(decl(theme, "--text-30--line-height")).toBe("1.2");
		expect(decl(theme, "--text-30--letter-spacing")).toBe("-0.01em");
		expect(decl(theme, "--text-44--line-height")).toBe("1.1");
		expect(decl(theme, "--text-44--letter-spacing")).toBe("-0.02em");
	});

	it("allows the radii 9, 12, 14 and 20, and only the elevation shadows", () => {
		expect(decl(theme, "--radius-sm")).toBe("9px");
		expect(decl(theme, "--radius-md")).toBe("12px");
		expect(decl(theme, "--radius-field")).toBe("14px");
		expect(decl(theme, "--radius-lg")).toBe("20px");
		expect(decl(theme, "--radius-xl")).toBe("20px");
		for (const s of ["--shadow-*", "--inset-shadow-*", "--drop-shadow-*"])
			expect(decl(theme, s)).toBe("initial");
		const inline = block("@theme inline");
		for (const n of ["1", "2", "3"])
			expect(decl(inline, `--shadow-${n}`)).toBe(`var(--elevation-${n})`);
		expect(decl(inline, "--shadow-glow")).toBe("var(--accent-glow)");
	});

	it("defines four surfaces, shadows that go in dark, a flat fill under the old gradient name and soft status tints", () => {
		for (let i = 0; i <= 3; i++) expect(decl(root, `--surface-${i}`), `surface-${i}`).toBeDefined();
		// In dark, a current item and a card have no shadow. A popup keeps one.
		for (const n of [1, 2]) expect(decl(root, `--elevation-${n}`)).toContain("transparent)");
		expect(decl(root, "--elevation-3")).not.toContain("transparent");
		expect(block("@utility bg-accent-gradient")).toContain("var(--primary)");
		expect(decl(root, "--gradient-to")).toBe("var(--accent)");
		expect(decl(root, "--accent-glow")).toBe("0 0 0 2px var(--accent)");
		for (const c of ["accent", "success", "warning", "danger", "info"])
			expect(decl(root, `--${c}-soft`), `${c}-soft`).toContain(`var(--${c})`);
		// The page ground is flat: one colour, no picture.
		expect(block("@utility bg-canvas")).toContain("background-color: var(--surface-0)");
		expect(block("@utility bg-canvas")).not.toContain("background-image");
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
			// The theme tiles and the accent swatches of Setup / Me draw the colours of a theme that is
			// not active: a preview needs the values, not the tokens of the theme that shows.
			if (
				/\.test\.tsx?$/.test(path) ||
				/gallery\/|slide-deck\.tsx$|design\/tokens\.tsx$|organisms\/drawio\.ts$|atoms\/brands\.ts$|settings\/(?:themes|look-rows)\.tsx$/.test(
					path,
				)
			)
				continue;
			for (const re of rules) if (re.test(text)) hits.push(`${path}: ${re}`);
		}
		expect(hits).toEqual([]);
	});
});

describe("the look of the redesign (app-redesign REQ-025, REQ-026)", () => {
	const root = block(":root");
	const inline = block("@theme inline");

	it("defines one attention colour with a soft ground and a text colour, for both themes", () => {
		for (const k of ["--attention", "--attention-subtle", "--attention-text"])
			expect(decl(root, k), k).toMatch(/^light-dark\(/);
		expect(decl(root, "--attention-soft")).toContain("var(--attention)");
		expect(decl(root, "--attention-strong")).toMatch(/^light-dark\(/);
		for (const k of ["", "-strong", "-subtle", "-text", "-soft"])
			expect(decl(inline, `--color-attention${k}`), k).toBe(`var(--attention${k})`);
	});

	it("keeps the attention colour distinct from the status colours and the accent", () => {
		/** The HSL hue of a hex colour, in degrees. Orange is near 25: red is 0, the blue accent 225. */
		const hue = (hex: string) => {
			const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
			const max = Math.max(r, g, b);
			const d = max - Math.min(r, g, b);
			const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			return (h * 60 + 360) % 360;
		};
		for (const v of Object.values(pair(root, "--attention"))) {
			expect(hue(v)).toBeGreaterThan(15);
			expect(hue(v)).toBeLessThan(40);
		}
		expect(hue(pair(root, "--accent").light)).toBeGreaterThan(200);
	});

	it("uses the attention colour only in the attention card, the tag for the person and a meter over its budget", () => {
		const hits = Object.keys(sources).filter(
			(p) =>
				// The amber outline of a Setup card that a person must act on (design screens 52, 54, 91).
				!/\.test\.tsx?$|gallery\/|molecules\/(?:attention-card|spend-meter)\.tsx$|atoms\/(?:badge|progress)\.tsx$|code\/conflict-agent\.tsx$|projects\/settings-(?:health|project)\.tsx$|settings\/parts\/setup-card\.tsx$/.test(
					p,
				) &&
				/\battention(?:-|\b)/.test(sources[p] ?? "") &&
				/(?:text|bg|border|ring|outline)-attention/.test(sources[p] ?? ""),
		);
		expect(hits).toEqual([]);
	});

	it("defines a 44 px control height", () => {
		expect(decl(root, "--control-h")).toBe("44px");
		expect(css).toContain("@utility min-h-control");
	});

	it("puts cards on a calmer ground in light: white cards on a grey ground", () => {
		expect(pair(root, "--surface-1").light).toBe("#ffffff");
		expect(pair(root, "--surface-2").light).toBe("#ffffff");
		expect(luminance(pair(root, "--surface-0").light)).toBeLessThan(1);
	});

	it("defines the selected ground and the primary fill, and gives each a class", () => {
		expect(decl(root, "--accent-tint")).toMatch(/^light-dark\(/);
		expect(decl(root, "--primary")).toBe("var(--n-12)");
		expect(decl(root, "--primary-fg")).toMatch(/^light-dark\(/);
		for (const k of ["accent-tint", "primary", "primary-fg"])
			expect(decl(inline, `--color-${k}`), k).toBe(`var(--${k})`);
		expect(decl(block(":root[data-accent]"), "--accent-tint")).toContain("var(--accent-hue)");
	});

	it("draws the focus ring 2 px wide in the accent", () => {
		expect(css).toContain("outline: var(--focus-width, 2px) solid var(--accent);");
	});

	it("gives text, each tag pair and each fill 4.5:1 or more in Light, Dark and OLED (WCAG AA)", () => {
		const oled = block('[data-scheme="oled"]');
		const value = (name: string, mode: "light" | "dark" | "oled"): string => {
			const own = mode === "oled" ? decl(oled, name) : undefined;
			if (own) return own;
			const ref = /^var\((--[\w-]+)\)$/.exec(decl(root, name) ?? "")?.[1];
			return ref ? value(ref, mode) : pair(root, name)[mode === "light" ? "light" : "dark"];
		};
		const pairs = [
			...["--n-12", "--n-11", "--n-10"].flatMap((t) =>
				["--surface-0", "--surface-1", "--n-3", "--n-4", "--accent-tint"].map((g) => [t, g]),
			),
			["--attention-text", "--attention-subtle"],
			["--success-text", "--success-subtle"],
			["--accent-text", "--accent-subtle"],
			["--accent-text", "--accent-tint"],
			["--primary-fg", "--primary"],
			["--accent-fg", "--accent"],
			["--accent", "--surface-0"],
			["--accent", "--surface-1"],
			["--danger-text", "--surface-0"],
			["--danger-text", "--surface-1"],
		] as const;
		for (const mode of ["light", "dark", "oled"] as const)
			for (const [t, g] of pairs) {
				const ratio = contrast(value(t ?? "", mode), value(g ?? "", mode));
				expect(ratio, `${t} on ${g} in ${mode}`).toBeGreaterThanOrEqual(4.5);
			}
	});
});

describe("shared timing (REQ-025)", () => {
	it("mirrors the duration tokens in DURATION (ms)", () => {
		const theme = block("@theme");
		expect(`${DURATION.fast}ms`).toBe(decl(theme, "--duration-fast"));
		expect(`${DURATION.base}ms`).toBe(decl(theme, "--duration-base"));
	});

	it("has no local duration in src/ui, src/features and src/app", () => {
		const hits: string[] = [];
		// A glyph that animates itself, a number that counts up and the SVG path data of the brand logos are not transitions of the interface.
		const own =
			/\.test\.tsx?$|ui\/icons\/|atoms\/animated-icon\.tsx$|atoms\/count-up\.tsx$|atoms\/brands\.ts$/;
		for (const [path, text] of Object.entries(sources)) {
			if (own.test(path)) continue;
			for (const [i, line] of text.split("\n").entries()) {
				const local =
					/duration-\[|(?<![\w.])\d*\.?\d+m?s\b(?!\w)/.test(line) ||
					// A number in the value of `duration` or `delay`. Zero means no motion.
					/\b(?:duration|delay):[^,}]*(?<![\w.])(?!0(?![.\d]))\d/.test(line) ||
					// A spring made by hand: only `ui/motion.ts` holds spring numbers.
					(!/ui\/motion\.ts$/.test(path) && /\b(?:stiffness|damping|mass):\s*\d/.test(line)) ||
					// A Tailwind transition class with no duration token on its line.
					(/["'`][^"'`]*(?<![\w-])transition(?:-(?!none\b)[\w[\],-]+)?(?=[\s"'`])/.test(line) &&
						!line.includes("duration-(--duration-"));
				if (local) hits.push(`${path}:${i + 1}: ${line.trim().slice(0, 80)}`);
			}
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
	it("uses Geist for text and Geist Mono for code, from the packages of the app", () => {
		const theme = block("@theme");
		expect(decl(theme, "--font-sans")).toMatch(/^"Geist Variable"/);
		expect(decl(theme, "--font-mono")).toMatch(/^"Geist Mono Variable"/);
		expect(fonts).toContain('@import "@fontsource-variable/geist";');
		expect(fonts).toContain('@import "@fontsource-variable/geist-mono";');
		// No font comes from the network.
		expect(fonts).not.toMatch(/https?:/);
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
		expect(lightness(root, "--n-12").dark).toBeGreaterThan(0.8);
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
		const d = lightness(root, "--accent-text");
		const h = lightness(high, "--accent-text");
		expect(h.light).toBeLessThan(d.light);
		expect(h.dark).toBeGreaterThan(d.dark);
	});
});

describe("densities (REQ-013)", () => {
	it("uses a 28 px row and 15 px text by default, on a line of 1.45", () => {
		const root = block(":root");
		expect(decl(root, "--row-h")).toBe("28px");
		// rem, so that the text size of Settings / Me scales it
		expect(decl(root, "--text-ui")).toBe("0.9375rem");
		expect(block("@utility text-ui")).toContain("line-height: 1.45");
		expect(block("\tbody")).toContain("line-height: 1.45");
	});

	it("changes the row height and the text size in compact, and nothing else", () => {
		const compact = block(':root[data-density="compact"]');
		expect(decl(compact, "--row-h")).toBe("24px");
		expect(decl(compact, "--text-ui")).toBe("0.8125rem");
		expect([...compact.matchAll(/--[\w-]+:/g)].map((m) => m[0])).toEqual([
			"--row-h:",
			"--text-ui:",
		]);
	});
});

describe("OLED theme (themes REQ-001)", () => {
	const oled = block(
		':root[data-theme="oled"],\n:root[data-theme="oled"] .canvas-dark,\n[data-scheme="oled"]',
	);
	const root = block(":root");
	/** The value in OLED: its own, or the dark half of the light-dark() token of :root. */
	const value = (name: string) => decl(oled, name) ?? pair(root, name).dark;

	it("forces the dark scheme on a true black base", () => {
		expect(decl(oled, "color-scheme")).toBe("dark");
		expect(decl(oled, "--surface-0")).toBe("#000000");
		expect(decl(oled, "--n-1")).toBe("#000000");
		expect(css).toContain(':root[data-theme="oled"] .canvas-dark');
	});

	it("lifts each raised surface by a small step above the black base", () => {
		for (const i of [1, 2, 3]) {
			const l = luminance(value(`--surface-${i}`));
			expect(l, `surface-${i}`).toBeGreaterThan(luminance(value("--surface-0")));
			expect(l, `surface-${i}`).toBeLessThanOrEqual(0.02);
		}
	});

	it("keeps the accent of the dark theme", () => {
		for (const k of [
			"--accent",
			"--accent-text",
			"--accent-subtle",
			"--attention",
			"--success",
			"--danger",
		])
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
		].map((k) => [k, value(k)] as const);
		const texts = [
			"--n-10",
			"--n-11",
			"--n-12",
			"--accent-text",
			"--attention-text",
			"--success-text",
			"--warning-text",
			"--danger-text",
			"--info-text",
		].map((k) => [k, value(k)] as const);
		for (const [tk, tv] of texts) {
			expect(tv, tk).toMatch(/^(?:#|oklch\()/);
			for (const [gk, gv] of grounds)
				expect(contrast(tv, gv), `${tk} on ${gk}`).toBeGreaterThanOrEqual(4.5);
		}
	});
});
