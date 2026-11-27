// The vite config aliases node:fs to a browser stub, so the test takes the real module from process.
const { readFileSync, existsSync } = (
	globalThis as unknown as {
		process: {
			getBuiltinModule: (id: string) => {
				readFileSync: (path: string, encoding: "utf8") => string;
				existsSync: (path: string) => boolean;
			};
		};
	}
).process.getBuiltinModule("node:fs");

// jsdom resolves a relative URL against http: the test takes the folder of the repository from the file URL.
const base = import.meta.url.slice("file://".length).replace(/\/src\/ui\/tokens\/[^/]+$/, "");
const root = (path: string) => `${base}/${path}`;
const sources = import.meta.glob("/src/**/*.css", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

describe("Font files in the build (spec:design-system#REQ-003)", () => {
	it.each(["geist", "geist-mono"])("holds each file of @fontsource-variable/%s", (name) => {
		const dir = `node_modules/@fontsource-variable/${name}/`;
		const css = readFileSync(root(`${dir}index.css`), "utf8");
		const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? "");
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) {
			// A path inside the package, never a host: the bundler copies the file into the build.
			expect(url).toMatch(/^\.\/files\/[\w-]+\.woff2$/);
			expect(existsSync(root(`${dir}${url.slice(2)}`)), url).toBe(true);
		}
	});

	it("points no font address of the app to a network host", () => {
		const html = readFileSync(root("index.html"), "utf8");
		for (const [path, text] of [["index.html", html], ...Object.entries(sources)]) {
			expect(text, path).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
			expect(text, path).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com|rel=["']?preconnect/i);
		}
		// The test reads the files that it must read.
		expect(Object.keys(sources).length).toBeGreaterThan(1);
	});

	it("declares each font of the app from the packages", () => {
		const pkg = JSON.parse(readFileSync(root("package.json"), "utf8")) as {
			dependencies: Record<string, string>;
		};
		expect(pkg.dependencies).toHaveProperty(["@fontsource-variable/geist"]);
		expect(pkg.dependencies).toHaveProperty(["@fontsource-variable/geist-mono"]);
	});
});
