import type { ComponentType } from "react";
import type { Messages } from "@/lib/i18n";
import type { Level, TeamRole } from "@/lib/ipc";
import type { Area } from "@/lib/rights";
import {
	AcademicCapIcon,
	ArrowsRightLeftIcon,
	BookOpenIcon,
	CalendarDaysIcon,
	ChartBarIcon,
	ChatBubbleIcon,
	CheckIcon,
	ClockIcon,
	CodeBracketIcon,
	Cog6ToothIcon,
	CommandLineIcon,
	ComputerDesktopIcon,
	CpuChipIcon,
	CurrencyIcon,
	DocumentTextIcon,
	FolderOpenIcon,
	LinkIcon,
	LockClosedIcon,
	PresentationChartIcon,
	PuzzlePieceIcon,
	QueueListIcon,
	ShareIcon,
	ShieldCheckIcon,
	SparklesIcon,
	Squares2X2Icon,
	UserCircleIcon,
	UsersIcon,
	ViewColumnsIcon,
} from "@/ui/icons";

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

type TabIcon = ComponentType<{ size?: number }>;

/** The icon of each tab: the one its page header shows (REQ-021). */
const TAB_ICON: Record<string, TabIcon> = {
	"home/today": ClockIcon,
	"home/projects": FolderOpenIcon,
	"design/diagrams": ShareIcon,
	"design/architecture": CpuChipIcon,
	"design/decisions": DocumentTextIcon,
	"design/api": CodeBracketIcon,
	"design/data": QueueListIcon,
	"design/flows": ArrowsRightLeftIcon,
	"design/screens": ComputerDesktopIcon,
	"specs/changes": DocumentTextIcon,
	"specs/capabilities": BookOpenIcon,
	"specs/questions": ChatBubbleIcon,
	"specs/test-plans": CheckIcon,
	"specs/constitution": LockClosedIcon,
	"work/backlog": QueueListIcon,
	"work/board": ViewColumnsIcon,
	"work/plan": CalendarDaysIcon,
	"work/estimates": CurrencyIcon,
	"work/team": UsersIcon,
	"work/time": ClockIcon,
	"factory/runs": CpuChipIcon,
	"factory/workflows": ArrowsRightLeftIcon,
	"factory/agents-map": ShareIcon,
	"factory/sessions": CommandLineIcon,
	"factory/usage": ChartBarIcon,
	"code/changes": CodeBracketIcon,
	"code/history": ClockIcon,
	"code/branches": ShareIcon,
	"code/pull-requests": ArrowsRightLeftIcon,
	"code/quality": CheckIcon,
	"code/impacts": ChartBarIcon,
	"knowledge/graph": ShareIcon,
	"knowledge/handbook": BookOpenIcon,
	"knowledge/manual": BookOpenIcon,
	"knowledge/documents": DocumentTextIcon,
	"knowledge/slides": PresentationChartIcon,
	"knowledge/learn": AcademicCapIcon,
	"knowledge/dashboards": Squares2X2Icon,
	"settings/project": Cog6ToothIcon,
	"settings/connections": LinkIcon,
	"settings/agents-rules": SparklesIcon,
	"settings/extensions": PuzzlePieceIcon,
	"settings/me": UserCircleIcon,
	"settings/health": ShieldCheckIcon,
};

export const tabIcon = (space: SpaceId, tab: string) => TAB_ICON[`${space}/${tab}`];

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

/** Terminal and Manual keep their address, palette entry and menu entry, but no tab (REQ-014). */
const OFF_BAR = new Set(["code/terminal", "knowledge/manual"]);

/** The tabs that the tab bar draws. */
export const barTabs = (space: SpaceId, role: TeamRole | null, level = open) =>
	visibleTabs(space, role, level).filter((tab) => !OFF_BAR.has(`${space}/${tab}`));

/** Home first, the space of the first tab next, the rest in default order, Settings last. A space with no visible tab is hidden. */
export function orderedSpaces(role: TeamRole | null, level = open): SpaceId[] {
	return [...new Set<SpaceId>(["home", spaceOf(firstPath(role)), ...SPACE_IDS])]
		.filter((space) => visibleTabs(space, role, level).length > 0)
		.sort((a, b) => Number(a === "settings") - Number(b === "settings"));
}
