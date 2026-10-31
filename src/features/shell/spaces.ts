import type { Messages } from "@/lib/i18n";
import type { Role } from "@/lib/prefs";

/** Spaces in default order, each with its tabs (master plan section 4). */
export const SPACES = {
	home: ["inbox", "my-work", "activity", "projects"],
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

export const ROLE_HOME: Record<Role, SpaceId> = {
	none: "home",
	pm: "work",
	architect: "design",
	developer: "factory",
	qa: "specs",
	ba: "specs",
	lead: "specs",
	junior: "knowledge",
};

/** Home first, the role home next, the rest in default order, Settings last. Home and Settings stay; a project profile can hide the others. */
export function orderedSpaces(role: Role, only: string[] | null = null): SpaceId[] {
	return [...new Set<SpaceId>(["home", ROLE_HOME[role], ...SPACE_IDS])]
		.filter((s) => !only || s === "home" || s === "settings" || only.includes(s))
		.sort((a, b) => Number(a === "settings") - Number(b === "settings"));
}

/** The tab that a role sees first in its space: a junior learns, a PM plans on the board. */
export const ROLE_TAB: Partial<Record<Role, string>> = {
	junior: "knowledge/learn",
	pm: "work/board",
};

/** The tabs of a space that the project profile keeps, the tab of the role first. Settings keeps every tab. */
export const visibleTabs = <S extends SpaceId>(space: S, hidden: readonly string[], role?: Role) =>
	SPACES[space]
		.filter((tab) => space === "settings" || !hidden.includes(`${space}/${tab}`))
		.sort(
			(a, b) =>
				Number(ROLE_TAB[role ?? "none"] === `${space}/${b}`) -
				Number(ROLE_TAB[role ?? "none"] === `${space}/${a}`),
		) as (typeof SPACES)[S][number][];
