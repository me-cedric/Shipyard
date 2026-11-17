import { createAppRouter, createMemoryHistory } from "@/app/router";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { fr } from "@/lib/i18n/fr";
import { routers } from "@/test/routers";
import {
	firstSection,
	PLACE_IDS,
	PLACES,
	placePath,
	REPLACES,
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
		const placed: string[] = PLACE_IDS.flatMap((p) => PLACES[p].flatMap((v) => REPLACES[v] ?? [v]));
		expect([...new Set(placed)].sort()).toEqual([...views].sort());
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

	it("hides a section with its tab and a place with no visible section; Setup keeps Me", () => {
		const level = (a: string) => (a === "code" || a === "settings" ? "none" : "write");
		expect(visiblePlaces(level)).not.toContain("code");
		expect(visibleSections("setup", level)).toEqual([["settings", "me"]]);
		expect(visibleSections("flow", level).map(([, tab]) => tab)).toEqual(["flow", "list", "done"]);
	});

	it("hides a view of Flow only when each old tab that it replaces is hidden", () => {
		const flow = (none: string[]) => (a: string) => (none.includes(a) ? "none" : "write");
		// Board and Runs both hidden: Flow and Done go. Backlog (Work) is hidden too: List keeps Changes (Specs).
		expect(visibleSections("flow", flow(["work", "runs"])).map(([, t]) => t)).toEqual([
			"list",
			"health",
			"impacts",
		]);
		// Work hidden: Flow stays through Runs, List stays through Changes.
		expect(visibleSections("flow", flow(["work"])).map(([, t]) => t)).toEqual([
			"flow",
			"list",
			"done",
			"health",
			"impacts",
		]);
		expect(visibleSections("flow", flow(["work", "specs"])).map(([, t]) => t)).toEqual([
			"flow",
			"done",
			"health",
			"impacts",
		]);
		expect(visibleSections("flow", flow(["code"])).map(([, t]) => t)).toEqual([
			"flow",
			"list",
			"done",
		]);
	});

	it("opens a place on the first tab of the role when it holds it", () => {
		expect(firstSection("flow", "pm")).toBe("flow");
		expect(firstSection("flow", "po")).toBe("list");
		expect(firstSection("flow", "ba")).toBe("list");
		expect(firstSection("flow", "qa")).toBe("flow");
		expect(firstSection("library", "qa")).toBe("test-plans");
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
		["/code/changes", "/code/changes"],
		["/design/decisions", "/library/decisions"],
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
