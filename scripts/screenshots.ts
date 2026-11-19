// Regenerates docs/assets/screenshots/*.png from the browser mock (mock IPC, no Rust).
// Usage: pnpm build (with VITE_MOCK_DEMO=0), pnpm preview --port 4180, then `node scripts/screenshots.ts [name...]`.
// Each scene opens a fresh page at 1600x1000, scale 2, reduced motion, dark theme unless the scene is light.
// A scene name is the slug of its entry in docs/designs/screens.json, or the older file name that a doc cites.
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:4180";
const OUT = "docs/assets/screenshots";
const only = process.argv.slice(2);

const tabs = (p: Page) => p.getByRole("navigation", { name: "Tabs" });
const side = (p: Page) => p.getByRole("navigation", { name: "Sidebar" });
// The place of each section that a scene opens (adr:0023).
const PLACE: Record<string, string> = {
	Flow: "Flow",
	List: "Flow",
	Done: "Flow",
	Questions: "Library",
	Architecture: "Library",
	Learn: "Library",
	Timeline: "Plan",
	People: "Plan",
	Estimates: "Plan",
	Crew: "Crew",
	Recipes: "Crew",
	Spend: "Crew",
	Dashboards: "Library",
	Reports: "Library",
	Plan: "Plan",
	Team: "Crew",
	Workflows: "Crew",
	"Agents map": "Crew",
	Usage: "Crew",
	Now: "Code",
	Terminal: "Code",
	Health: "Flow",
	Start: "Setup",
	"This project": "Setup",
	"This computer": "Setup",
	Me: "Setup",
};
const open = async (p: Page, tab: string) => {
	await side(p).getByRole("link", { name: PLACE[tab] }).click();
	// Library has no section switch: a page opens from its chip in a door.
	const from = PLACE[tab] === "Library" ? p.getByRole("main") : tabs(p);
	await from.getByRole("link", { name: tab, exact: true }).click();
};
// Crew / Live: one row for each agent at work (the agents map of before).
const openLive = async (p: Page) => {
	await open(p, "Crew");
	await p.getByRole("main").getByRole("link", { name: "Live", exact: true }).click();
	await p.getByRole("table", { name: "Agents at work" }).waitFor();
};
// Plan / Timeline: the chart with its bars.
const openTimeline = async (p: Page) => {
	await open(p, "Timeline");
	await p.getByRole("heading", { level: 1, name: / ends / }).waitFor();
};
// The Projects page opens from the project switch at the top of the rail.
const openProjects = async (p: Page) => {
	await p.getByRole("button", { name: /^Project/ }).click();
	await p.getByRole("menuitem", { name: "Projects" }).click();
	await p.getByRole("heading", { level: 1, name: "Projects" }).waitFor();
};
// A page behind a door of a scope of Setup.
const openDoor = async (p: Page, scope: string, door: string) => {
	await open(p, scope);
	await p.getByRole("navigation", { name: scope }).getByRole("link", { name: door }).click();
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
	await open(p, "Now");
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

// A section by its address, with no reload: the mock keeps the project and the theme in memory.
const go = async (p: Page, path: string) => {
	// A string: the Node type check has no DOM names.
	await p.evaluate(
		`history.pushState({}, "", ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent("popstate"))`,
	);
	await p.waitForURL(`**${path}`);
	await p.getByRole("heading", { level: 1 }).first().waitFor();
};
// A section of the page of one feature of Flow.
const openFeature = async (p: Page, feature: RegExp, section: string) => {
	await open(p, "Flow");
	await p.getByRole("main").getByRole("button", { name: feature }).first().click();
	await p
		.getByRole("navigation", { name: "Sections" })
		.getByRole("button", { name: section })
		.click();
};

// `fresh` skips the first run: the scene starts with no role and no project, in the light theme.
type Scene = { name: string; light?: boolean; fresh?: boolean; run: (p: Page) => Promise<void> };
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
	{
		name: "library",
		light: true,
		run: async (p) => {
			await side(p).getByRole("link", { name: "Library" }).click();
			await p.getByRole("region", { name: "What it must do" }).waitFor();
		},
	},
	{
		name: "reports",
		light: true,
		run: async (p) => {
			await open(p, "Reports");
			await p.getByRole("navigation", { name: "Format" }).waitFor();
		},
	},
	{
		name: "tile-build",
		light: true,
		run: async (p) => {
			await open(p, "Dashboards");
			await p.getByRole("button", { name: "Build a tile for me" }).click();
			await p
				.getByRole("textbox", { name: "What the tile must show" })
				.fill("The open questions for each owner");
			await p.getByRole("button", { name: "Build", exact: true }).click();
			await p.getByRole("region", { name: "Proposed tile" }).waitFor();
		},
	},
	{ name: "design", run: (p) => open(p, "Architecture") },
	{ name: "specs", run: (p) => open(p, "Questions") },
	// The old names stay for the docs that cite them: the plan, and the member page of the team.
	{ name: "work", run: openTimeline },
	{ name: "team", run: (p) => go(p, "/crew/rights") },
	{
		name: "crew",
		run: async (p) => {
			await open(p, "Crew");
			await p.getByRole("list", { name: "People" }).waitFor();
		},
	},
	{
		name: "plan-people",
		run: async (p) => {
			await open(p, "People");
			await p.getByRole("heading", { level: 1, name: "People" }).waitFor();
		},
	},
	{
		name: "plan-estimates",
		run: async (p) => {
			await open(p, "Estimates");
			await p.getByRole("table", { name: "Backlog" }).waitFor();
		},
	},
	{ name: "factory", run: (p) => open(p, "Flow") },
	{ name: "flow-list", run: (p) => open(p, "List") },
	{
		name: "new-feature",
		run: async (p) => {
			await go(p, "/flow/new");
			await p.getByRole("heading", { name: "What do you want to build?" }).waitFor();
		},
	},
	{ name: "agents", run: openLive },
	{
		name: "workflows",
		run: async (p) => {
			await open(p, "Recipes");
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
			await open(p, "Spend");
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
			await open(p, "Now");
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
	{ name: "settings-connections", run: (p) => openDoor(p, "This project", "Connections") },
	{ name: "settings-project", run: (p) => open(p, "This project") },
	{ name: "setup-start", run: (p) => open(p, "Start") },
	{ name: "setup-computer", run: (p) => open(p, "This computer") },
	{ name: "setup-me", run: (p) => open(p, "Me") },
	{
		name: "code-terminal",
		run: async (p) => {
			await open(p, "Terminal");
			await p
				.getByRole("region", { name: "Terminal", exact: true })
				.getByText("/project $")
				.waitFor();
		},
	},
	{ name: "flow-health", run: (p) => open(p, "Health") },
	{
		name: "feature-impacts",
		run: async (p) => {
			await open(p, "Flow");
			await p
				.getByRole("button", { name: /Add export endpoint/ })
				.first()
				.click();
			await p
				.getByRole("navigation", { name: "Sections" })
				.getByRole("button", { name: "Checks" })
				.click();
			await p.getByRole("button", { name: "Impacts on other code" }).click();
			await p.getByRole("button", { name: "Analyze" }).waitFor();
		},
	},
	{ name: "projects", run: openProjects },
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
			await openProjects(p);
			await p.getByRole("button", { name: "New project" }).click();
			const d = p.getByRole("dialog", { name: "New project" });
			await d.getByRole("textbox", { name: "Name" }).fill("Acme Web");
			await d
				.getByRole("navigation", { name: "Steps" })
				.getByRole("button", { name: "Start" })
				.click();
		},
	},
	// One scene for each section that opens by its address.
	...Object.entries({
		"plan-time": "/plan/time",
		"crew-sessions": "/crew/sessions",
		"activity-panel": "/today/activity",
		"knowledge-slides": "/library/slides",
		"library-diagrams": "/library/diagrams",
		"library-decisions": "/library/decisions",
		"library-api": "/library/api",
		"library-data": "/library/data",
		"library-network-flows": "/library/flows",
		"library-screens": "/library/screens",
		"library-specs": "/library/capabilities",
		"library-test-plans": "/library/test-plans",
		"library-project-rules": "/library/constitution",
		"library-map": "/library/graph",
		"library-handbook": "/library/handbook",
		"library-manual": "/library/manual",
		"library-documents": "/library/documents",
		"library-dashboards": "/library/dashboards",
		"code-history": "/code/history",
		"code-branches": "/code/branches",
	}).map(([name, path]): Scene => ({ name, run: (p) => go(p, path) })),
	// The mock has a spec on add-auth and a conversation on the pull request of the empty token.
	{ name: "feature-brief", run: (p) => openFeature(p, /add-auth/, "Brief") },
	// shortcut: no feature of the mock cites a design, so the picture shows the empty state.
	{ name: "feature-design", run: (p) => openFeature(p, /Add export endpoint/, "Design") },
	{ name: "feature-checks", run: (p) => openFeature(p, /Add export endpoint/, "Checks") },
	{ name: "feature-chat", run: (p) => openFeature(p, /refuse an empty token/, "Chat") },
	{ name: "setup-tickets", run: (p) => openDoor(p, "This project", "Tickets") },
	{ name: "setup-extensions", run: (p) => openDoor(p, "This project", "Extensions") },
	{
		name: "setup-project-health",
		run: (p) => openDoor(p, "This project", "Health of this project"),
	},
	{ name: "setup-agents-rules", run: (p) => openDoor(p, "This computer", "Agents and rules") },
	{ name: "setup-outside-agents", run: (p) => openDoor(p, "This computer", "Outside agents") },
	{
		name: "setup-computer-health",
		run: (p) => openDoor(p, "This computer", "Health of this computer"),
	},
	{ name: "setup-logs", run: (p) => openDoor(p, "This computer", "Logs and feedback") },
	{
		name: "settings-permissions",
		run: async (p) => {
			await open(p, "This computer");
			await p.locator("#section-permissions").scrollIntoViewIfNeeded();
		},
	},
	{
		name: "settings-me-languages",
		run: async (p) => {
			await open(p, "Me");
			await p.getByRole("combobox", { name: "Language", exact: true }).click();
			await p.getByRole("option", { name: "French" }).waitFor();
		},
	},
	{
		name: "account-menu",
		run: async (p) => {
			await p.getByRole("button", { name: /^Account/ }).click();
			await p.getByRole("menu").waitFor();
		},
	},
	{
		name: "assistant-composer",
		run: async (p) => {
			await p.keyboard.press("ControlOrMeta+k");
			await p.getByRole("button", { name: "Open the full assistant" }).click();
			await p
				.getByRole("complementary", { name: "Assistant" })
				.getByRole("button", { name: "Send", exact: true })
				.waitFor();
		},
	},
	// The menu bar panel is this front end at /tray, with no shell.
	{ name: "menu-bar-panel", run: (p) => p.goto("/tray").then(() => {}) },
	{
		name: "first-run",
		fresh: true,
		run: async (p) => {
			await p.goto("/home/today");
			await p.getByRole("button", { name: "Continue" }).waitFor();
		},
	},
	{
		name: "no-project",
		fresh: true,
		run: async (p) => {
			await p.goto("/home/today");
			await p.getByRole("button", { name: "Continue" }).click();
			await p.goto("/flow/flow");
			await p.getByRole("heading", { level: 1, name: /project/i }).waitFor();
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
		colorScheme: s.light || s.fresh ? "light" : "dark",
	});
	const page = await ctx.newPage();
	if (!s.fresh) await openProject(page);
	if (!s.light && !s.fresh) {
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
	// A page that failed must not become a picture.
	if (
		await page
			.getByRole("alert")
			.filter({ hasText: /went wrong|not found/i })
			.count()
	)
		throw new Error(`${s.name}: the page shows an error`);
	await page.screenshot({ path: `${OUT}/${s.name}.png` });
	console.log(s.name);
	await ctx.close();
}
await browser.close();
