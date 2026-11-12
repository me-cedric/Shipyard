// Regenerates docs/assets/screenshots/*.png from the browser mock (mock IPC, no Rust).
// Usage: pnpm build (with VITE_MOCK_DEMO=0), pnpm preview --port 4180, then `node scripts/screenshots.ts [name...]`.
// Each scene opens a fresh page at 1600x1000, scale 2, reduced motion, dark theme unless the name says light.
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:4180";
const OUT = "docs/assets/screenshots";
const only = process.argv.slice(2);

const tabs = (p: Page) => p.getByRole("navigation", { name: "Tabs" });
const side = (p: Page) => p.getByRole("navigation", { name: "Sidebar" });
const open = async (p: Page, space: string, tab?: string) => {
	await side(p).getByRole("link", { name: space }).click();
	if (tab) await tabs(p).getByRole("link", { name: tab, exact: true }).click();
};
const openProject = async (p: Page) => {
	await p.goto("/home/today");
	await p.getByRole("button", { name: "Continue" }).click();
	await p.getByRole("button", { name: "Open a local folder" }).click();
	await p.getByRole("heading", { level: 1, name: "Today" }).waitFor();
};

type Scene = { name: string; light?: boolean; run: (p: Page) => Promise<void> };
const scenes: Scene[] = [
	{ name: "home", run: async () => {} },
	{ name: "home-light", light: true, run: async () => {} },
	{ name: "design", run: (p) => open(p, "Design", "Architecture") },
	{ name: "specs", run: (p) => open(p, "Specs", "Questions") },
	{ name: "work", run: (p) => open(p, "Work", "Plan") },
	{
		name: "team",
		run: async (p) => {
			await open(p, "Work", "Team");
			await p.getByRole("table").first().waitFor();
		},
	},
	{ name: "factory", run: (p) => open(p, "Factory", "Runs") },
	{ name: "agents", run: (p) => open(p, "Factory", "Agents map") },
	{
		name: "workflows",
		run: async (p) => {
			await open(p, "Factory", "Workflows");
			await p.getByRole("button", { name: /^feature/ }).click();
			await p.getByRole("textbox", { name: "Step id" }).first().waitFor();
		},
	},
	{
		name: "run",
		run: async (p) => {
			await open(p, "Factory", "Runs");
			await p
				.getByRole("region", { name: "Working" })
				.getByRole("button", { name: /ACME-2/ })
				.click();
			// The Activity tab is open, with the summary in view.
			await p.getByRole("region", { name: /^Events/ }).waitFor();
		},
	},
	{ name: "code", run: (p) => open(p, "Code", "Pull requests") },
	{ name: "knowledge", run: (p) => open(p, "Knowledge", "Learn") },
	{ name: "settings-connections", run: (p) => open(p, "Settings", "Connections") },
	{ name: "settings-project", run: (p) => open(p, "Settings", "Project") },
	{
		name: "themes",
		run: async (p) => {
			await open(p, "Settings", "Me");
			await p.getByRole("combobox", { name: "Theme" }).click();
			await p.getByRole("option", { name: "OLED", exact: true }).click();
		},
	},
	{
		name: "tour",
		run: async (p) => {
			await p.keyboard.press("ControlOrMeta+k");
			await p.getByRole("dialog").getByRole("combobox").fill("Replay the tour");
			await p.keyboard.press("Enter");
			await p.getByRole("dialog").waitFor();
		},
	},
	{
		name: "new-project",
		run: async (p) => {
			await open(p, "Home", "Projects");
			await p.getByRole("button", { name: "New project" }).click();
			const d = p.getByRole("dialog", { name: "New project" });
			await d.getByRole("textbox", { name: "Name" }).fill("Acme Web");
			await d
				.getByRole("navigation", { name: "Steps" })
				.getByRole("button", { name: "Start" })
				.click();
		},
	},
];

const browser = await chromium.launch();
for (const s of scenes) {
	if (only.length && !only.includes(s.name)) continue;
	const ctx = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1600, height: 1000 },
		deviceScaleFactor: 2,
		reducedMotion: "reduce",
		colorScheme: s.light ? "light" : "dark",
	});
	const page = await ctx.newPage();
	await openProject(page);
	await s.run(page);
	await page.mouse.move(800, 990); // no hover state
	await page.waitForTimeout(800); // fades and charts settle
	await page.screenshot({ path: `${OUT}/${s.name}.png` });
	console.log(s.name);
	await ctx.close();
}
await browser.close();
