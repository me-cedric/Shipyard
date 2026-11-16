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
		const placed: string[] = PLACE_IDS.flatMap((p) => [...PLACES[p]]);
		expect([...placed].sort()).toEqual([...views].sort());
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
		expect(visibleSections("flow", level).map(([, tab]) => tab)).toEqual([
			"backlog",
			"board",
			"runs",
			"changes",
		]);
	});

	it("opens a place on the first tab of the role when it holds it", () => {
		expect(firstSection("flow", "pm")).toBe("board");
		expect(firstSection("flow", "qa")).toBe("backlog");
		expect(firstSection("library", "qa")).toBe("test-plans");
	});
});

describe("old addresses (app-redesign REQ-002, adr:0023 point 9)", () => {
	it.each([
		["/home", undefined],
		["/home/today", "/today/today"],
		["/home/inbox", "/today/today"],
		["/work", undefined],
		["/work/plan", "/plan/plan"],
		["/work/team", "/crew/team"],
		["/settings/team", "/crew/team"],
		["/factory/runs/r1", "/flow/runs/r1"],
		["/code/quality", "/flow/quality"],
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
		expect(runs.pathname).toBe("/flow/runs");
		expect(runs.search).toEqual({ filter: "needs", q: "12" });
		const pull = await open("/code/pull-requests/pr-1?tab=files");
		expect(pull.pathname).toBe("/code/pull-requests/pr-1");
		expect(pull.search).toEqual({ tab: "files" });
	});
});
