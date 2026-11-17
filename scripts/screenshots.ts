// Regenerates docs/assets/screenshots/*.png from the browser mock (mock IPC, no Rust).
// Usage: pnpm build (with VITE_MOCK_DEMO=0), pnpm preview --port 4180, then `node scripts/screenshots.ts [name...]`.
// Each scene opens a fresh page at 1600x1000, scale 2, reduced motion, dark theme unless the name says light.
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:4180";
const OUT = "docs/assets/screenshots";
const only = process.argv.slice(2);

const tabs = (p: Page) => p.getByRole("navigation", { name: "Tabs" });
const side = (p: Page) => p.getByRole("navigation", { name: "Sidebar" });
// The place of each section that a scene opens (adr:0023).
const PLACE: Record<string, string> = {
	Projects: "Today",
	Flow: "Flow",
	List: "Flow",
	Done: "Flow",
	Questions: "Library",
	Architecture: "Library",
	Learn: "Library",
	Plan: "Plan",
	Team: "Crew",
	Workflows: "Crew",
	"Agents map": "Crew",
	Usage: "Crew",
	"Pull requests": "Code",
	Connections: "Setup",
	Project: "Setup",
	Me: "Setup",
};
const open = async (p: Page, tab: string) => {
	await side(p).getByRole("link", { name: PLACE[tab] }).click();
	await tabs(p).getByRole("link", { name: tab, exact: true }).click();
};
const openProject = async (p: Page) => {
	await p.goto("/home/today");
	await p.getByRole("button", { name: "Continue" }).click();
	await p.getByRole("button", { name: "Open a local folder" }).click();
	await p.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }).waitFor();
};

// Pull request 142 of the mock has comments, two threads and one file of three lines.
// The page opens on Changes: the merge box, the commits and the files.
const openPull = async (p: Page) => {
	await open(p, "Pull requests");
	await p.getByRole("link", { name: /refuse an empty token/ }).click();
};
// Adds a comment to the pending review: opens the file, the "+" of the line, the box.
const comment = async (p: Page, line: number, text: string) => {
	const file = p.getByRole("button", { name: /src\/app\.ts/ }).first();
	if ((await file.getAttribute("aria-expanded")) === "false") await file.click();
	// The "+" exists only on the hovered row: hover the row of that line first.
	await p
		.locator("div[data-kind]")
		.filter({ has: p.locator('span[aria-hidden="true"]').getByText(String(line), { exact: true }) })
		.first()
		.hover();
	await p.getByRole("button", { name: `Add a comment on line ${line}` }).click();
	await p.getByRole("textbox", { name: `Comment on line ${line}` }).fill(text);
	await p.getByRole("button", { name: "Add review comment" }).click();
};

type Scene = { name: string; light?: boolean; run: (p: Page) => Promise<void> };
const scenes: Scene[] = [
	{ name: "home", run: async () => {} },
	{ name: "home-light", light: true, run: async () => {} },
	{
		name: "today-news",
		light: true,
		run: async (p) => {
			await tabs(p).getByRole("link", { name: "News", exact: true }).click();
			await p.getByRole("button", { name: "Mark all as read" }).waitFor();
		},
	},
	{
		name: "ask-bar",
		light: true,
		run: async (p) => {
			await p.keyboard.press("ControlOrMeta+k");
			await p
				.getByRole("combobox", { name: "Ask or tell Shipyard" })
				.fill("what blocks the release");
			await p.getByRole("button", { name: "Open the full assistant" }).waitFor();
		},
	},
	{ name: "design", run: (p) => open(p, "Architecture") },
	{ name: "specs", run: (p) => open(p, "Questions") },
	{ name: "work", run: (p) => open(p, "Plan") },
	{
		name: "team",
		run: async (p) => {
			await open(p, "Team");
			await p.getByRole("table").first().waitFor();
		},
	},
	{ name: "factory", run: (p) => open(p, "Flow") },
	{ name: "flow-list", run: (p) => open(p, "List") },
	{
		name: "new-feature",
		run: async (p) => {
			await p.goto("/flow/new");
			await p.getByRole("heading", { name: "What do you want to build?" }).waitFor();
		},
	},
	{ name: "agents", run: (p) => open(p, "Agents map") },
	{
		name: "workflows",
		run: async (p) => {
			await open(p, "Workflows");
			await p.getByRole("button", { name: /^feature/i }).click();
			await p.getByRole("textbox", { name: "Step id" }).first().waitFor();
		},
	},
	{
		name: "runs-history",
		run: async (p) => {
			await open(p, "Done");
			await p.getByRole("table", { name: "History" }).waitFor();
		},
	},
	{
		name: "usage",
		run: async (p) => {
			await open(p, "Usage");
			await p.getByRole("region", { name: "Budgets" }).waitFor();
		},
	},
	{
		name: "run",
		run: async (p) => {
			await open(p, "Flow");
			await p
				.getByRole("button", { name: /Add export endpoint/ })
				.first()
				.click();
			// The feature page opens on Story, with the question of the agent.
			await p.getByRole("region", { name: "Needs you" }).waitFor();
		},
	},
	{
		name: "pulls",
		run: async (p) => {
			await open(p, "Pull requests");
			await p.getByRole("link", { name: /refuse an empty token/ }).waitFor();
		},
	},
	{
		name: "pull",
		run: async (p) => {
			await openPull(p);
			await p.getByRole("region", { name: "Merge status" }).waitFor();
		},
	},
	{
		name: "pull-files",
		run: async (p) => {
			await openPull(p);
			await comment(p, 3, "Add a guard for the empty case.");
			await p.getByText("Pending", { exact: true }).first().waitFor();
		},
	},
	{
		name: "pull-review",
		run: async (p) => {
			await openPull(p);
			await comment(p, 3, "Add a guard for the empty case.");
			await comment(p, 1, "Name this value.");
			await p.getByRole("button", { name: "Submit review" }).first().click();
			await p.getByRole("dialog", { name: "Submit review" }).waitFor();
		},
	},
	{ name: "knowledge", run: (p) => open(p, "Learn") },
	{ name: "settings-connections", run: (p) => open(p, "Connections") },
	{ name: "settings-project", run: (p) => open(p, "Project") },
	{
		name: "themes",
		run: async (p) => {
			await open(p, "Me");
			await p.getByRole("combobox", { name: "Theme" }).click();
			await p.getByRole("option", { name: "OLED", exact: true }).click();
		},
	},
	{
		name: "tour",
		run: async (p) => {
			await p.keyboard.press("ControlOrMeta+k");
			await p.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Replay the tour");
			await p.keyboard.press("ArrowDown");
			await p.keyboard.press("Enter");
			await p.getByRole("dialog").waitFor();
		},
	},
	{
		name: "new-project",
		run: async (p) => {
			await open(p, "Projects");
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
	if (!s.light) {
		// Light is the default theme: a dark scene picks Dark from the palette.
		await page.keyboard.press("ControlOrMeta+k");
		await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Theme: Dark");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await page.locator('html[data-theme="dark"]').waitFor();
	}
	await s.run(page);
	await page.mouse.move(800, 990); // no hover state
	await page.waitForTimeout(800); // fades and charts settle
	await page.screenshot({ path: `${OUT}/${s.name}.png` });
	console.log(s.name);
	await ctx.close();
}
await browser.close();
