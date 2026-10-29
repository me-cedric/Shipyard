import type { Messages } from "@/lib/i18n";
import type { Role } from "@/lib/prefs";

/** Spaces in default order, each with its tabs (master plan section 4). */
export const SPACES = {
	home: ["inbox", "my-work", "activity"],
	design: ["diagrams", "architecture", "decisions", "api", "data", "flows", "screens"],
	specs: ["changes", "capabilities", "questions", "test-plans", "constitution"],
	work: ["backlog", "board", "plan", "estimates", "team", "time"],
	factory: ["runs", "workflows", "agents-map", "sessions", "usage"],
	code: ["changes", "history", "branches", "pull-requests", "quality", "impacts", "terminal"],
	knowledge: ["graph", "handbook", "documents", "slides", "learn", "dashboards"],
	settings: ["project", "connections", "agents-rules", "extensions", "team", "me", "health"],
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

/** Home first, the role home next, the rest in default order, Settings last. No space is hidden. */
export function orderedSpaces(role: Role): SpaceId[] {
	return [...new Set<SpaceId>(["home", ROLE_HOME[role], ...SPACE_IDS])].sort(
		(a, b) => Number(a === "settings") - Number(b === "settings"),
	);
}
