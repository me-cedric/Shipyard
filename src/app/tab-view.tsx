import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from "react";
import { type SpaceId, tabLabel } from "@/features/shell";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";

type Load = () => Promise<ComponentType>;

/** Views that a feature owns, each in its own chunk. The other tabs show the empty state until their capability lands. */
const LOADERS: Partial<Record<string, Load>> = {
	"home/inbox": () => import("./views").then((m) => m.HomeInbox),
	"home/my-work": () => import("@/features/home/my-work").then((m) => m.MyWork),
	"home/activity": () => import("@/features/home/activity").then((m) => m.Activity),
	"home/projects": () => import("@/features/projects/projects-page").then((m) => m.ProjectsPage),
	"code/changes": () => import("@/features/code/changes").then((m) => m.Changes),
	"code/history": () => import("@/features/code/history").then((m) => m.History),
	"code/branches": () => import("@/features/code/branches").then((m) => m.Branches),
	"code/pull-requests": () => import("@/features/code/pull-requests").then((m) => m.PullRequests),
	"code/quality": () => import("@/features/code/quality").then((m) => m.Quality),
	"code/impacts": () => import("@/features/code/impacts").then((m) => m.Impacts),
	"code/terminal": () => import("@/features/code/terminal").then((m) => m.Terminal),
	"settings/connections": () =>
		import("@/features/settings/connections").then((m) => m.Connections),
	"settings/me": () => import("@/features/settings/me").then((m) => m.Me),
	"settings/agents-rules": () =>
		import("@/features/settings/agents-rules").then((m) => m.AgentsRules),
	"settings/extensions": () => import("@/features/settings/extensions").then((m) => m.Extensions),
	"work/backlog": () => import("@/features/work/backlog").then((m) => m.Backlog),
	"work/board": () => import("@/features/work/board").then((m) => m.Board),
	"work/plan": () => import("@/features/work/plan").then((m) => m.Plan),
	"work/estimates": () => import("@/features/work/estimates").then((m) => m.Estimates),
	"work/team": () => import("@/features/work/team").then((m) => m.Team),
	"work/time": () => import("@/features/work/time").then((m) => m.Time),
	"factory/runs": () => import("@/features/factory/runs/runs").then((m) => m.Runs),
	"factory/workflows": () =>
		import("@/features/factory/workflows/workflows").then((m) => m.Workflows),
	"factory/agents-map": () =>
		import("@/features/factory/agents-map/agents-map").then((m) => m.AgentsMap),
	"factory/sessions": () => import("@/features/factory/sessions/sessions").then((m) => m.Sessions),
	"factory/usage": () => import("@/features/factory/usage/usage").then((m) => m.Usage),
	"design/diagrams": () => import("@/features/design/diagrams").then((m) => m.Diagrams),
	"design/architecture": () => import("@/features/design/architecture").then((m) => m.Architecture),
	"design/decisions": () => import("@/features/design/decisions").then((m) => m.Decisions),
	"design/api": () => import("@/features/design/api").then((m) => m.Api),
	"design/data": () => import("@/features/design/data").then((m) => m.Data),
	"design/flows": () => import("@/features/design/flows").then((m) => m.Flows),
	"design/screens": () => import("@/features/design/screens").then((m) => m.Screens),
	"specs/changes": () => import("@/features/specs/changes").then((m) => m.SpecChanges),
	"specs/capabilities": () => import("@/features/specs/capabilities").then((m) => m.Capabilities),
	"specs/questions": () => import("@/features/specs/questions").then((m) => m.Questions),
	"specs/test-plans": () => import("@/features/specs/test-plans").then((m) => m.TestPlans),
	"specs/constitution": () => import("@/features/specs/constitution").then((m) => m.Constitution),
	"knowledge/graph": () => import("@/features/knowledge/graph").then((m) => m.Graph),
	"knowledge/handbook": () => import("@/features/knowledge/pages").then((m) => m.Handbook),
	"knowledge/documents": () => import("@/features/knowledge/documents").then((m) => m.Documents),
	"knowledge/slides": () => import("@/features/knowledge/slides").then((m) => m.Slides),
	"knowledge/learn": () => import("@/features/knowledge/learn").then((m) => m.Learn),
	"knowledge/dashboards": () => import("@/features/knowledge/dashboards").then((m) => m.Dashboards),
	"settings/project": () => import("./views").then((m) => m.ProjectView),
	"settings/health": () => import("@/features/projects/settings-health").then((m) => m.Health),
};

const loaded = new Map<string, ComponentType>();
const LAZY = new Map<string, LazyExoticComponent<ComponentType>>();

/** One lazy view for each tab. A failed load drops it: React.lazy keeps a failed promise for good, so Retry needs a new one. */
function lazyView(key: string, load: Load) {
	let view = LAZY.get(key);
	if (!view) {
		view = lazy(() =>
			load().then(
				(c) => ({ default: c }),
				(e: unknown) => {
					LAZY.delete(key);
					throw e;
				},
			),
		);
		LAZY.set(key, view);
	}
	return view;
}

/** Loads the code of a tab. The router calls it before it shows the tab and when a pointer rests on a link to the tab. */
export async function preloadTab(space: SpaceId, tab: string) {
	const key = `${space}/${tab}`;
	const View = await LOADERS[key]?.();
	if (View) loaded.set(key, View);
}

export function TabView({ space, tab }: { space: SpaceId; tab: string }) {
	const { t } = useI18n();
	const key = `${space}/${tab}`;
	// A preloaded view renders at once; the lazy one covers a render before the preload ends.
	const load = LOADERS[key];
	const View = loaded.get(key) ?? (load && lazyView(key, load));
	if (View)
		return (
			<Suspense fallback={null}>
				<View />
			</Suspense>
		);
	return (
		<div className="flex flex-col gap-4 p-4">
			<h1 className="sr-only">{tabLabel(t, space, tab)}</h1>
			<EmptyState action={{ label: t.noun[space], onClick: () => {} }} />
		</div>
	);
}
