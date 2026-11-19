import type { ComponentType } from "react";
import type { TeamRole } from "@/lib/ipc";
import {
	BookOpenIcon,
	CalendarDaysIcon,
	CodeBracketIcon,
	Cog6ToothIcon,
	HomeIcon,
	UsersIcon,
	ViewColumnsIcon,
} from "@/ui/icons";
import {
	hiddenTab,
	isOffBar,
	type LevelOf,
	type SectionSpace,
	SPACES,
	type SpaceId,
} from "./spaces";

/**
 * The places of the main menu in menu order (adr:0023 points 1 and 3). Each section is one view
 * `space/tab` of before the change, and the tab id is the slug of the section. The views of Flow
 * are `flow/<slug>`, and the sections of Plan and Crew are `plan/<slug>` and `crew/<slug>`:
 * `REPLACES` names the old views that each one takes over. The home of Library and Reports are
 * `library/<slug>`: pages of their own, with no old view.
 */
export const PLACES = {
	today: ["home/today", "home/news", "home/activity"],
	flow: ["flow/flow", "flow/list", "flow/done", "flow/health"],
	plan: ["plan/timeline", "plan/people", "plan/estimates", "plan/time"],
	crew: ["crew/crew", "crew/recipes", "crew/sessions", "crew/spend", "crew/rights"],
	library: [
		"library/home",
		"design/diagrams",
		"design/architecture",
		"design/decisions",
		"design/api",
		"design/data",
		"design/flows",
		"design/screens",
		"specs/capabilities",
		"specs/questions",
		"specs/test-plans",
		"specs/constitution",
		"knowledge/graph",
		"knowledge/handbook",
		"knowledge/manual",
		"knowledge/documents",
		"knowledge/slides",
		"knowledge/learn",
		"knowledge/dashboards",
		"library/reports",
	],
	code: ["code/now", "code/history", "code/branches", "code/terminal"],
	setup: ["setup/start", "setup/project", "setup/computer", "setup/me"],
} as const;

/** The pages that hold an export of today. Reports shows while a role sees one (`spec:app-redesign#REQ-006`). */
const REPORT_VIEWS = [
	"knowledge/documents",
	"code/history",
	"code/quality",
	"work/estimates",
	"work/plan",
	"design/flows",
	"specs/questions",
];

/** The old views that a view of Flow replaces (`spec:app-redesign#REQ-010`, decision 2 of wave 3). */
export const REPLACES: Record<string, readonly string[]> = {
	"flow/flow": ["work/board", "factory/runs"],
	"flow/list": ["work/backlog", "specs/changes"],
	"flow/done": ["factory/runs"],
	"flow/health": ["code/quality"],
	// Wave 4 (`spec:app-redesign#REQ-016`, `spec:app-redesign#REQ-018`). The live work rows replace the agents map.
	"plan/timeline": ["work/plan"],
	"plan/people": ["work/plan"],
	"plan/estimates": ["work/estimates"],
	"plan/time": ["work/time"],
	"crew/crew": ["work/team", "factory/agents-map"],
	"crew/recipes": ["factory/workflows"],
	"crew/sessions": ["factory/sessions"],
	"crew/spend": ["factory/usage"],
	"crew/rights": ["work/team"],
	"library/reports": REPORT_VIEWS,
	// The home of Library stands for each chip of its doors: it hides only when each one is hidden.
	"library/home": [...PLACES.library.filter((v) => !v.startsWith("library/")), ...REPORT_VIEWS],
	// Wave 6: Now of Code (`spec:app-redesign#REQ-022`) and the scopes of Setup (`spec:app-redesign#REQ-024`).
	"code/now": ["code/changes", "code/pull-requests"],
	"setup/start": [],
	"setup/project": ["settings/project", "settings/extensions", "settings/health"],
	"setup/computer": ["settings/connections", "settings/agents-rules"],
	"setup/me": ["settings/me"],
};

/** The old views that a section stands for: the ones that it replaces, else itself. */
export const viewsOf = (space: string, tab: string) =>
	REPLACES[`${space}/${tab}`] ?? [`${space}/${tab}`];

export type PlaceId = keyof typeof PLACES;
type TabOf<V> = V extends `${string}/${infer T}` ? T : never;
/** Every valid section path, such as `/library/diagrams`. */
export type PlacePath = { [P in PlaceId]: `/${P}/${TabOf<(typeof PLACES)[P][number]>}` }[PlaceId];

export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];

export const PLACE_ICON: Record<PlaceId, ComponentType<{ size?: number }>> = {
	today: HomeIcon,
	flow: ViewColumnsIcon,
	plan: CalendarDaysIcon,
	crew: UsersIcon,
	library: BookOpenIcon,
	code: CodeBracketIcon,
	setup: Cog6ToothIcon,
};

// shortcut: one cast. A template over two unions makes invalid pairs, so the callers pass a slug of the place.
export const sectionPath = (place: PlaceId, slug: string) => `/${place}/${slug}` as PlacePath;

const open: LevelOf = () => "write";

/** The sections of a place as `[space, tab]` pairs. */
export const sections = (place: PlaceId) =>
	PLACES[place].map((view) => view.split("/") as [SectionSpace, string]);

/** The old view of a section, or undefined when the place has no such slug. */
export const sectionView = (place: PlaceId, slug: string) =>
	sections(place).find(([, tab]) => tab === slug);

/** The section `[place, slug]` that takes over an old view: the first one that names it. */
const taker = (view: string) =>
	Object.entries(REPLACES)
		.find(([key, old]) => !key.startsWith("library/") && old.includes(view))?.[0]
		.split("/") as [PlaceId, string] | undefined;

/** The place that holds an old view. */
export const placeOfView = (space: SpaceId, tab: string) =>
	taker(`${space}/${tab}`)?.[0] ??
	PLACE_IDS.find((p) => (PLACES[p] as readonly string[]).includes(`${space}/${tab}`));

/**
 * A section is hidden exactly when each old tab that it replaces is hidden (`hiddenTab`).
 * Health shows for every role (`spec:app-redesign#REQ-023`), and the guided start replaces no old tab.
 */
export const hiddenSection = (level: LevelOf, space: SectionSpace, tab: string) => {
	const views = viewsOf(space, tab);
	return (
		`${space}/${tab}` !== "flow/health" &&
		views.length > 0 &&
		views.every((v) => hiddenTab(level, ...(v.split("/") as [SpaceId, string])))
	);
};

export const visibleSections = (place: PlaceId, level = open) =>
	sections(place).filter(([space, tab]) => !hiddenSection(level, space, tab));

/** The sections that the section switch draws: Manual stays off it (ux-declutter REQ-014). */
export const barSections = (place: PlaceId, level = open) =>
	visibleSections(place, level).filter(([space, tab]) => !isOffBar(space, tab));

/** The places in menu order. A place with no visible section is hidden. */
export const visiblePlaces = (level = open) =>
	PLACE_IDS.filter((p) => visibleSections(p, level).length > 0);

/** The first page of each role (`spec:app-redesign#REQ-006`, picture 066 of the design source). */
export const FIRST_PAGE: Record<TeamRole, PlacePath> = {
	po: "/flow/list",
	pm: "/plan/timeline",
	architect: "/library/decisions",
	techlead: "/flow/flow",
	ba: "/library/capabilities",
	developer: "/flow/flow",
	qa: "/library/test-plans",
	designer: "/library/screens",
	viewer: "/today/today",
};

/** The page a person opens first: the first page of the role, or Today with no role or when the role does not see that page. */
export function firstPath(role: TeamRole | null, level = open): PlacePath {
	const page = role ? FIRST_PAGE[role] : "/today/today";
	const [, place, slug] = page.split("/") as [string, PlaceId, string];
	const view = sectionView(place, slug);
	return view && !hiddenSection(level, ...view) ? page : "/today/today";
}

/**
 * The section that a place opens on: the first page of the role when the place holds it, else the
 * first visible one. Library always opens on its doors (`spec:app-redesign#REQ-020`).
 */
export function firstSection(place: PlaceId, role: TeamRole | null, level = open) {
	const shown = visibleSections(place, level);
	const [, home, slug] = firstPath(role).split("/");
	const first =
		home === place && place !== "library" ? shown.find((v) => v[1] === slug) : undefined;
	return (first ?? shown[0] ?? sections(place)[0])?.[1] ?? "";
}

/** The old path `/<space>/<tab>` of a section path: the item type of a page is known by its old view. */
export function viewPath(path: string) {
	// The pages of wave 6 that no old view names keep the help of the tab that held them.
	const held = {
		"/projects": "/home/projects",
		"/flow/impacts": "/code/impacts",
		"/setup/start": "/settings/me",
	}[path];
	if (held) return held;
	const [, place, slug] = path.split("/");
	const view = place && slug && place in PLACES ? sectionView(place as PlaceId, slug) : undefined;
	// A page of Library with no old view keeps its own path, and so does a section that replaces none.
	const old = view && view[0] !== "library" ? viewsOf(...view)[0] : undefined;
	return old ? `/${old}` : path;
}

const TODAY_TABS = new Set(["inbox", "my-work"]);

/** The addresses of wave 1 under Flow, Plan and Crew: the old tab names, each taken over by a section. */
export const OLD_SLUGS: Partial<Record<PlaceId, Record<string, string>>> = {
	flow: { runs: "flow", board: "flow", backlog: "list", changes: "list", quality: "health" },
	plan: { plan: "timeline" },
	crew: { team: "crew", workflows: "recipes", "agents-map": "crew", usage: "spend" },
};

/** The pages that left the section switches in wave 6: Projects is a page of its own, Impacts opens from the Checks of a feature. */
const MOVED: Record<string, string> = {
	"/home/projects": "/projects",
	"/today/projects": "/projects",
	"/code/impacts": "/flow/impacts",
};

/** The new path of a path of before adr:0023, or undefined when it names no old page or no tab. */
export function placePath(path: string): string | undefined {
	const bare = path.replace(/\/$/, "");
	if (bare in MOVED) return MOVED[bare];
	const [, space, tab, ...rest] = bare.split("/");
	// The sections of Setup before wave 6 had the names of the Settings tabs.
	if (space === "setup" && tab && rest.length === 0) return placePath(`/settings/${tab}`);
	// Settings / Team moved to Work / Team, and Inbox and My work became Today.
	if (space === "settings" && tab === "team") return "/crew/crew";
	if (space === "home" && tab && TODAY_TABS.has(tab)) return "/today/today";
	const old = OLD_SLUGS[space as PlaceId]?.[tab ?? ""];
	if (old && rest.length === 0) return `/${space}/${old}`;
	if (!space || !(space in SPACES)) return undefined;
	// A bare space has no tab: the route of the space picks the first tab of the role (`OldSpaceHome`).
	if (!tab) return undefined;
	const place = placeOfView(space as SpaceId, tab);
	// A run address keeps its tab (`/flow/runs/$runId`): only a bare tab names a view of Flow.
	const slug = rest.length === 0 ? taker(`${space}/${tab}`)?.[1] : undefined;
	return place ? [`/${place}`, slug ?? tab, ...rest].join("/") : undefined;
}
