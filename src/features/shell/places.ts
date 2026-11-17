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
	firstPath,
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
 * are `flow/<slug>`: `REPLACES` names the old views that each one takes over.
 */
export const PLACES = {
	today: ["home/today", "home/news", "home/activity", "home/projects"],
	flow: ["flow/flow", "flow/list", "flow/done", "flow/health", "code/impacts"],
	plan: ["work/plan", "work/estimates", "work/time"],
	crew: [
		"work/team",
		"factory/workflows",
		"factory/agents-map",
		"factory/sessions",
		"factory/usage",
	],
	library: [
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
	],
	code: ["code/changes", "code/history", "code/branches", "code/pull-requests", "code/terminal"],
	setup: [
		"settings/project",
		"settings/connections",
		"settings/agents-rules",
		"settings/extensions",
		"settings/me",
		"settings/health",
	],
} as const;

/** The old views that a view of Flow replaces (`spec:app-redesign#REQ-010`, decision 2 of wave 3). */
export const REPLACES: Record<string, readonly string[]> = {
	"flow/flow": ["work/board", "factory/runs"],
	"flow/list": ["work/backlog", "specs/changes"],
	"flow/done": ["factory/runs"],
	"flow/health": ["code/quality"],
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

// shortcut: one cast, as `tabPath`. The callers pass a slug of the place.
export const sectionPath = (place: PlaceId, slug: string) => `/${place}/${slug}` as PlacePath;

const open: LevelOf = () => "write";

/** The sections of a place as `[space, tab]` pairs. */
export const sections = (place: PlaceId) =>
	PLACES[place].map((view) => view.split("/") as [SectionSpace, string]);

/** The old view of a section, or undefined when the place has no such slug. */
export const sectionView = (place: PlaceId, slug: string) =>
	sections(place).find(([, tab]) => tab === slug);

/** The slug of the view of Flow that takes over an old view. */
const flowSlug = (view: string) =>
	Object.entries(REPLACES)
		.find(([, old]) => old.includes(view))?.[0]
		.slice("flow/".length);

/** The place that holds an old view. */
export const placeOfView = (space: SpaceId, tab: string) =>
	flowSlug(`${space}/${tab}`)
		? "flow"
		: PLACE_IDS.find((p) => (PLACES[p] as readonly string[]).includes(`${space}/${tab}`));

/** A section is hidden exactly when each old tab that it replaces is hidden (`hiddenTab`). */
export const hiddenSection = (level: LevelOf, space: SectionSpace, tab: string) =>
	viewsOf(space, tab).every((v) => hiddenTab(level, ...(v.split("/") as [SpaceId, string])));

export const visibleSections = (place: PlaceId, level = open) =>
	sections(place).filter(([space, tab]) => !hiddenSection(level, space, tab));

/** The sections that the section switch draws: Terminal and Manual stay off it (ux-declutter REQ-014). */
export const barSections = (place: PlaceId, level = open) =>
	visibleSections(place, level).filter(([space, tab]) => !isOffBar(space, tab));

/** The places in menu order. A place with no visible section is hidden. */
export const visiblePlaces = (level = open) =>
	PLACE_IDS.filter((p) => visibleSections(p, level).length > 0);

/** The section that a place opens on: the first tab of the role when the place holds it, else the first visible one. */
export function firstSection(place: PlaceId, role: TeamRole | null, level = open) {
	const shown = visibleSections(place, level);
	const [, home, slug] = (placePath(firstPath(role)) ?? "").split("/");
	const first = home === place ? shown.find((v) => v[1] === slug) : undefined;
	return (first ?? shown[0] ?? sections(place)[0])?.[1] ?? "";
}

/** The old path `/<space>/<tab>` of a section path: the manual keeps its help by space. */
export function viewPath(path: string) {
	const [, place, slug] = path.split("/");
	const view = place && slug && place in PLACES ? sectionView(place as PlaceId, slug) : undefined;
	return view ? `/${viewsOf(...view)[0]}` : path;
}

const TODAY_TABS = new Set(["inbox", "my-work"]);

/** The addresses of wave 1 under Flow: the old tab names, each taken over by a view of Flow. */
const FLOW_OLD: Record<string, string> = {
	runs: "flow",
	board: "flow",
	backlog: "list",
	changes: "list",
	quality: "health",
};

/** The new path of a path of before adr:0023, or undefined when it names no old page or no tab. */
export function placePath(path: string): string | undefined {
	const [, space, tab, ...rest] = path.replace(/\/$/, "").split("/");
	// Settings / Team moved to Work / Team, and Inbox and My work became Today.
	if (space === "settings" && tab === "team") return "/crew/team";
	if (space === "home" && tab && TODAY_TABS.has(tab)) return "/today/today";
	if (space === "flow" && tab && rest.length === 0 && tab in FLOW_OLD)
		return `/flow/${FLOW_OLD[tab]}`;
	if (!space || !(space in SPACES)) return undefined;
	// A bare space has no tab: the route of the space picks the first tab of the role (`OldSpaceHome`).
	if (!tab) return undefined;
	const place = placeOfView(space as SpaceId, tab);
	// A run address keeps its tab (`/flow/runs/$runId`): only a bare tab names a view of Flow.
	const slug = rest.length === 0 ? flowSlug(`${space}/${tab}`) : undefined;
	return place ? [`/${place}`, slug ?? tab, ...rest].join("/") : undefined;
}
