import { createAppRouter, createMemoryHistory } from "@/app/router";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { fr } from "@/lib/i18n/fr";
import { routers } from "@/test/routers";
import {
	firstSection,
	hiddenSection,
	PLACE_IDS,
	PLACES,
	placePath,
	REPLACES,
	viewPath,
	visiblePlaces,
	visibleSections,
} from "./places";
import { SPACE_IDS, SPACES } from "./spaces";

async function open(path: string) {
	const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
	routers().push(router);
	await router.load();
	return router.state.location;
}

describe("places (app-redesign REQ-001, adr:0023)", () => {
	it("lists the seven places in menu order", () => {
		expect(PLACE_IDS).toEqual(["today", "flow", "plan", "crew", "library", "code", "setup"]);
	});

	it("puts each old view in exactly one place, with no slug twice in a place", () => {
		const views = SPACE_IDS.flatMap((s) => SPACES[s].map((tab) => `${s}/${tab}`));
		// A view of Flow stands for the old views that it replaces: one old view can sit in two of them.
		// Reports of Library is a page of its own: it has no old view.
		const placed: string[] = PLACE_IDS.flatMap((p) =>
			PLACES[p].flatMap((v) => REPLACES[v] ?? [v]),
		).filter((v) => v !== "library/reports");
		// Projects and Impacts left the section switches in wave 6: each is a page of its own.
		const off = ["home/projects", "code/impacts"];
		expect([...new Set([...placed, ...off])].sort()).toEqual([...views].sort());
		for (const v of off) expect(placed).not.toContain(v);
		for (const p of PLACE_IDS) {
			const slugs = PLACES[p].map((v) => v.split("/")[1]);
			expect(new Set(slugs).size, p).toBe(slugs.length);
		}
	});

	it("names each place in the four languages", () => {
		for (const t of [en, fr, de, es]) for (const p of PLACE_IDS) expect(t.ui.place[p]).not.toBe("");
		expect(PLACE_IDS.map((p) => fr.ui.place[p])).toEqual([
			"Aujourd'hui",
			"Flux",
			"Plan",
			"Équipe",
			"Bibliothèque",
			"Code",
			"Configuration",
		]);
	});

	it("hides a section with its tab and a place with no visible section; Setup keeps Start and Me, Flow keeps Health", () => {
		const level = (a: string) => (a === "code" || a === "settings" ? "none" : "write");
		expect(visiblePlaces(level)).not.toContain("code");
		expect(visibleSections("setup", level)).toEqual([
			["setup", "start"],
			["setup", "me"],
		]);
		// spec:app-redesign#REQ-023: Health shows for every role.
		expect(visibleSections("flow", level).map(([, tab]) => tab)).toEqual([
			"flow",
			"list",
			"done",
			"health",
		]);
	});

	it("hides a view of Flow only when each old tab that it replaces is hidden", () => {
		const flow = (none: string[]) => (a: string) => (none.includes(a) ? "none" : "write");
		// Board and Runs both hidden: Flow and Done go. Backlog (Work) is hidden too: List keeps Changes (Specs).
		expect(visibleSections("flow", flow(["work", "runs"])).map(([, t]) => t)).toEqual([
			"list",
			"health",
		]);
		// Work hidden: Flow stays through Runs, List stays through Changes.
		expect(visibleSections("flow", flow(["work"])).map(([, t]) => t)).toEqual([
			"flow",
			"list",
			"done",
			"health",
		]);
		expect(visibleSections("flow", flow(["work", "specs"])).map(([, t]) => t)).toEqual([
			"flow",
			"done",
			"health",
		]);
		expect(visibleSections("flow", flow(["code"])).map(([, t]) => t)).toEqual([
			"flow",
			"list",
			"done",
			"health",
		]);
	});

	it("opens a place on the first page of the role when it holds it", () => {
		expect(firstSection("flow", "po")).toBe("list");
		expect(firstSection("flow", "pm")).toBe("flow");
		expect(firstSection("flow", "qa")).toBe("flow");
		expect(firstSection("plan", "pm")).toBe("timeline");
		// The role does not see its first page: the place opens on its first visible section.
		expect(
			firstSection("flow", "po", (a) => (a === "work" || a === "specs" ? "none" : "read")),
		).toBe("flow");
	});

	// spec:app-redesign#REQ-020
	it("opens Library on its home for each role, and hides the home only with each view and each report", () => {
		expect(firstSection("library", null)).toBe("home");
		expect(firstSection("library", "pm")).toBe("home");
		expect(firstSection("library", "qa")).toBe("home");
		expect(firstSection("library", "architect")).toBe("home");
		const none = (areas: string[]) => (a: string) => (areas.includes(a) ? "none" : "write");
		const slugs = (areas: string[]) => visibleSections("library", none(areas)).map(([, t]) => t);
		expect(slugs(["design", "specs"])[0]).toBe("home");
		// Reports stays while one page that holds an export stays, and the home stays with it.
		expect(slugs(["design", "specs", "knowledge"])).toEqual(["home", "reports"]);
		expect(slugs(["work", "code"])).toContain("reports");
		// No page with an export is left: Reports hides. No view is left either: the place hides.
		const noReport = ["design", "specs", "knowledge", "work", "code"];
		expect(slugs(noReport)).toEqual([]);
		expect(visiblePlaces(none(noReport))).not.toContain("library");
		expect(slugs(["specs", "knowledge", "work", "code"])).toContain("reports");
	});
});

describe("old addresses (app-redesign REQ-002, adr:0023 point 9)", () => {
	it.each([
		["/home", undefined],
		["/home/today", "/today/today"],
		["/home/inbox", "/today/today"],
		["/work", undefined],
		["/work/plan", "/plan/timeline"],
		["/work/team", "/crew/crew"],
		["/settings/team", "/crew/crew"],
		["/factory/runs/r1", "/flow/runs/r1"],
		["/code/quality", "/flow/health"],
		["/code/impacts", "/flow/impacts"],
		["/work/board", "/flow/flow"],
		["/factory/runs", "/flow/flow"],
		["/work/backlog", "/flow/list"],
		["/specs/changes", "/flow/list"],
		["/flow/runs", "/flow/flow"],
		["/flow/board", "/flow/flow"],
		["/flow/backlog", "/flow/list"],
		["/flow/changes", "/flow/list"],
		["/flow/quality", "/flow/health"],
		["/flow/runs/r1", undefined],
		["/flow/list", undefined],
		["/code/changes", "/code/now"],
		["/code/pull-requests", "/code/now"],
		["/code/pull-requests/pr-1", "/code/pull-requests/pr-1"],
		["/code/terminal", "/code/terminal"],
		["/home/projects", "/projects"],
		["/today/projects", "/projects"],
		["/settings/project", "/setup/project"],
		["/settings/connections", "/setup/computer"],
		["/settings/agents-rules", "/setup/computer"],
		["/settings/extensions", "/setup/project"],
		["/settings/health", "/setup/project"],
		["/setup/connections", "/setup/computer"],
		["/setup/start", undefined],
		["/design/decisions", "/library/decisions"],
		["/design/diagrams", "/library/diagrams"],
		["/specs/questions", "/library/questions"],
		["/knowledge/graph", "/library/graph"],
		["/library/home", undefined],
		["/settings/me", "/setup/me"],
		["/nowhere", undefined],
		["/work/nope", undefined],
	])("maps %s to %s", (from, to) => expect(placePath(from)).toBe(to));

	it("redirects a run address with its search and its hash, and replaces the entry", async () => {
		const router = createAppRouter(
			createMemoryHistory({ initialEntries: ["/factory/runs/r1?tab=changes&unit=u2#step"] }),
		);
		routers().push(router);
		await router.load();
		const { location } = router.state;
		expect(location.pathname).toBe("/flow/runs/r1");
		expect(location.search).toEqual({ tab: "changes", unit: "u2" });
		expect(location.hash).toBe("step");
		expect(router.history.length).toBe(1);
	});

	it("keeps the search of the Runs bar and of the pull request page", async () => {
		const runs = await open("/factory/runs?filter=needs&q=12");
		expect(runs.pathname).toBe("/flow/flow");
		expect(runs.search).toEqual({ filter: "needs", q: "12" });
		const pull = await open("/code/pull-requests/pr-1?tab=files");
		expect(pull.pathname).toBe("/code/pull-requests/pr-1");
		expect(pull.search).toEqual({ tab: "files" });
	});

	// Each old address of the views that Flow took over opens its view, with search and hash.
	it.each([
		["/work/board", "/flow/flow"],
		["/work/backlog", "/flow/list"],
		["/specs/changes", "/flow/list"],
		["/factory/runs", "/flow/flow"],
		["/factory/runs?view=history", "/flow/done"],
		["/code/quality", "/flow/health"],
		["/code/impacts", "/flow/impacts"],
		["/flow/runs", "/flow/flow"],
		["/flow/runs?view=history", "/flow/done"],
		["/flow/board", "/flow/flow"],
		["/flow/backlog", "/flow/list"],
		["/flow/changes", "/flow/list"],
		["/flow/quality", "/flow/health"],
	])("redirects %s to %s", async (from, to) => {
		expect((await open(from)).pathname).toBe(to);
	});

	// Wave 6: each address that moved opens its new page, with search and hash (`spec:app-redesign#REQ-022`, `#REQ-024`).
	it.each([
		["/code/changes", "/code/now"],
		["/code/pull-requests?q=fix&filter=needs#top", "/code/now?q=fix&filter=needs#top"],
		["/today/projects", "/projects"],
		["/home/projects#p", "/projects#p"],
		["/code/impacts", "/flow/impacts"],
		["/settings/project", "/setup/project"],
		["/settings/project#section-tickets", "/setup/project?page=tickets#section-tickets"],
		["/settings/connections", "/setup/computer"],
		["/setup/connections#connections-forge", "/setup/project?page=connections#connections-forge"],
		["/settings/agents-rules#tiers", "/setup/computer?page=models#tiers"],
		["/setup/agents-rules", "/setup/computer?page=models"],
		["/settings/extensions", "/setup/project?page=extensions"],
		["/setup/extensions", "/setup/project?page=extensions"],
		["/settings/health", "/setup/project?page=health"],
		["/setup/health#tools", "/setup/computer?page=health#tools"],
		["/settings/me", "/setup/me"],
		["/setup/me#ui-font", "/setup/me?page=look#ui-font"],
		["/settings/me#section-setup", "/setup/start#section-setup"],
		["/setup/project#issue-tracker", "/setup/project#issue-tracker"],
		["/setup/me?page=look#ui-font", "/setup/me?page=look#ui-font"],
	])("redirects %s to %s", async (from, to) => {
		expect((await open(from)).href).toBe(to);
	});

	it("keeps the help of the old tab for each page of wave 6", () => {
		expect(viewPath("/code/now")).toBe("/code/changes");
		expect(viewPath("/setup/computer")).toBe("/settings/connections");
		expect(viewPath("/setup/start")).toBe("/settings/me");
		expect(viewPath("/projects")).toBe("/home/projects");
		expect(viewPath("/flow/impacts")).toBe("/code/impacts");
	});

	// spec:app-redesign#REQ-023: a person with no right on code opens Health.
	it("shows Flow / Health to a person with no right on code, and not Code / Now", () => {
		const level = (a: string) => (a === "code" ? "none" : "write");
		expect(hiddenSection(level, "flow", "health")).toBe(false);
		expect(hiddenSection(level, "code", "now")).toBe(true);
	});

	it("keeps the search and the hash of the run history, and drops its view choice", async () => {
		const done = await open("/factory/runs?view=history&q=ACME-3&filter=mine#top");
		expect(done.pathname).toBe("/flow/done");
		expect(done.search).toEqual({ q: "ACME-3", filter: "mine" });
		expect(done.hash).toBe("top");
		const board = await open("/work/board?filter=needs");
		expect(board.pathname).toBe("/flow/flow");
		expect(board.search).toEqual({ filter: "needs" });
	});
});
