import type { ComponentType } from "react";
import type { Messages } from "@/lib/i18n";
import type { Level } from "@/lib/ipc";
import type { Area } from "@/lib/rights";
import {
	AcademicCapIcon,
	ArrowsRightLeftIcon,
	BellIcon,
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
	InboxIcon,
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
	home: ["today", "projects", "news", "activity"],
	design: ["diagrams", "architecture", "decisions", "api", "data", "flows", "screens"],
	specs: ["changes", "capabilities", "questions", "test-plans", "constitution"],
	work: ["backlog", "board", "plan", "estimates", "team", "time"],
	factory: ["runs", "workflows", "agents-map", "sessions", "usage"],
	code: ["changes", "history", "branches", "pull-requests", "quality", "impacts", "terminal"],
	knowledge: ["graph", "handbook", "manual", "documents", "slides", "learn", "dashboards"],
	settings: ["project", "connections", "agents-rules", "extensions", "me", "health"],
} as const;

export type SpaceId = keyof typeof SPACES;

export const SPACE_IDS = Object.keys(SPACES) as SpaceId[];

/** A space of before adr:0023, or a place with sections of its own: Flow, Plan, Crew, Library and Setup. */
export type SectionSpace = SpaceId | "flow" | "plan" | "crew" | "library" | "setup";

const OWN_VIEWS = (t: Messages) => ({
	flow: t.flow.views,
	plan: t.planPlace.views,
	crew: t.crewPlace.views,
	library: t.library.views,
});

export const tabLabel = (t: Messages, space: SectionSpace, tab: string): string =>
	(
		(space in OWN_VIEWS(t) ? OWN_VIEWS(t)[space as "flow"] : t.tabs[space as SpaceId]) as Record<
			string,
			string
		>
	)[tab] ?? "";

type TabIcon = ComponentType<{ size?: number }>;

/** The icon of each tab: the one its page header shows (REQ-021). */
const TAB_ICON: Record<string, TabIcon> = {
	"flow/flow": ViewColumnsIcon,
	"flow/list": QueueListIcon,
	"flow/done": CheckIcon,
	"flow/health": ShieldCheckIcon,
	"plan/timeline": CalendarDaysIcon,
	"plan/people": UsersIcon,
	"plan/estimates": CurrencyIcon,
	"plan/time": ClockIcon,
	"crew/crew": UsersIcon,
	"crew/recipes": ArrowsRightLeftIcon,
	"crew/sessions": CommandLineIcon,
	"crew/spend": ChartBarIcon,
	"crew/rights": LockClosedIcon,
	"library/home": BookOpenIcon,
	"library/reports": DocumentTextIcon,
	"code/now": CodeBracketIcon,
	"code/terminal": CommandLineIcon,
	"setup/start": CheckIcon,
	"setup/project": Cog6ToothIcon,
	"setup/computer": ComputerDesktopIcon,
	"setup/me": UserCircleIcon,
	"home/today": ClockIcon,
	"home/projects": FolderOpenIcon,
	"home/news": BellIcon,
	"home/activity": InboxIcon,
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

export const tabIcon = (space: SectionSpace, tab: string) => TAB_ICON[`${space}/${tab}`];

/** The level of the person in an area (`useRights().level`). */
export type LevelOf = (area: Area) => Level;

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

/** Manual keeps its address, palette entry and menu entry, but no tab (REQ-014). Terminal is a section of Code (`spec:app-redesign#REQ-022`). */
const OFF_BAR = new Set(["knowledge/manual"]);
export const isOffBar = (space: SectionSpace, tab: string) => OFF_BAR.has(`${space}/${tab}`);
