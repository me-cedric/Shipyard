import type { Messages } from "@/lib/i18n";
import type { Level, TeamRole } from "@/lib/ipc";
import type { Area } from "@/lib/rights";

/** Spaces in default order, each with its tabs (master plan section 4). */
export const SPACES = {
	home: ["today", "projects"],
	design: ["diagrams", "architecture", "decisions", "api", "data", "flows", "screens"],
	specs: ["changes", "capabilities", "questions", "test-plans", "constitution"],
	work: ["backlog", "board", "plan", "estimates", "team", "time"],
	factory: ["runs", "workflows", "agents-map", "sessions", "usage"],
	code: ["changes", "history", "branches", "pull-requests", "quality", "impacts", "terminal"],
	knowledge: ["graph", "handbook", "manual", "documents", "slides", "learn", "dashboards"],
	settings: ["project", "connections", "agents-rules", "extensions", "me", "health"],
} as const;

export type SpaceId = keyof typeof SPACES;
export type TabId = (typeof SPACES)[SpaceId][number];
/** Every valid tab path, such as `/design/diagrams`. */
export type TabPath = {
	[S in SpaceId]: `/${S}/${(typeof SPACES)[S][number]}`;
}[SpaceId];

export const SPACE_IDS = Object.keys(SPACES) as SpaceId[];

// shortcut: one cast. A template over two unions makes invalid pairs, so the callers pass a valid pair.
export const tabPath = (space: SpaceId, tab: TabId) => `/${space}/${tab}` as TabPath;

export const tabLabel = (t: Messages, space: SpaceId, tab: string): string =>
	(t.tabs[space] as Record<string, string>)[tab] ?? "";

/** The first tab of each role of `team-rights` (REQ-013). */
export const FIRST_TAB: Record<TeamRole, TabPath> = {
	po: "/work/backlog",
	pm: "/work/board",
	architect: "/design/decisions",
	techlead: "/factory/runs",
	ba: "/specs/changes",
	developer: "/factory/runs",
	qa: "/specs/test-plans",
	designer: "/design/screens",
	viewer: "/home/today",
};

/** The path a person opens first: the first tab of the role, Home / Today without a role. */
export const firstPath = (role: TeamRole | null): TabPath =>
	role ? FIRST_TAB[role] : "/home/today";

const spaceOf = (path: string) => path.split("/")[1] as SpaceId;

/** The level of the person in an area (`useRights().level`). */
export type LevelOf = (area: Area) => Level;
const open: LevelOf = () => "write";

/** The area of each space (`team-rights`). Home has none: it always shows. */
const SPACE_AREA: Partial<Record<SpaceId, Area>> = {
	design: "design",
	specs: "specs",
	work: "work",
	factory: "runs",
	code: "code",
	knowledge: "knowledge",
	settings: "settings",
};

/** The level `none` hides the tabs of its area. Settings / Me stays: it holds the settings of this machine. */
export const hiddenTab = (level: LevelOf, space: SpaceId, tab: string) => {
	const area = SPACE_AREA[space];
	return !!area && level(area) === "none" && !(space === "settings" && tab === "me");
};

/** The tabs of a space that the person sees, the first tab of the role first. */
export const visibleTabs = <S extends SpaceId>(space: S, role: TeamRole | null, level = open) =>
	[...SPACES[space]]
		.filter((tab) => !hiddenTab(level, space, tab))
		.sort(
			(a, b) =>
				Number(firstPath(role) === `/${space}/${b}`) - Number(firstPath(role) === `/${space}/${a}`),
		) as (typeof SPACES)[S][number][];

/** Home first, the space of the first tab next, the rest in default order, Settings last. A space with no visible tab is hidden. */
export function orderedSpaces(role: TeamRole | null, level = open): SpaceId[] {
	return [...new Set<SpaceId>(["home", spaceOf(firstPath(role)), ...SPACE_IDS])]
		.filter((space) => visibleTabs(space, role, level).length > 0)
		.sort((a, b) => Number(a === "settings") - Number(b === "settings"));
}
