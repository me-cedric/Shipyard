import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from "react";
import { type SectionSpace, tabIcon, tabLabel } from "@/features/shell";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";

type Load = () => Promise<ComponentType>;

/** Views that a feature owns, each in its own chunk. The other tabs show the empty state until their capability lands. */
const LOADERS: Partial<Record<string, Load>> = {
	"home/today": () => import("./views").then((m) => m.HomeToday),
	"home/projects": () => import("@/features/projects/projects-page").then((m) => m.ProjectsPage),
	"code/now": () => import("@/features/code/now").then((m) => m.CodeNow),
	"code/history": () => import("@/features/code/history").then((m) => m.History),
	"code/branches": () => import("@/features/code/branches").then((m) => m.Branches),
	"code/quality": () => import("@/features/code/quality").then((m) => m.Quality),
	"code/impacts": () => import("@/features/code/impacts").then((m) => m.Impacts),
	"code/terminal": () => import("@/features/code/terminal").then((m) => m.Terminal),
	"setup/start": () => import("@/features/onboarding/start").then((m) => m.SetupStart),
	"setup/project": () => import("@/features/settings/setup-project").then((m) => m.SetupProject),
	"setup/computer": () => import("@/features/settings/setup-computer").then((m) => m.SetupComputer),
	"setup/me": () => import("@/features/settings/setup-me").then((m) => m.SetupMe),
	// Wave 4: the sections of Plan and Crew (`spec:app-redesign#REQ-016`, `spec:app-redesign#REQ-018`).
	"plan/timeline": () => import("@/features/plan/timeline").then((m) => m.Timeline),
	"plan/people": () => import("@/features/plan/people").then((m) => m.People),
	"plan/estimates": () => import("@/features/plan/estimates").then((m) => m.PlanEstimates),
	"plan/time": () => import("@/features/plan/time").then((m) => m.PlanTime),
	"crew/crew": () => import("@/features/crew/crew-page").then((m) => m.CrewPage),
	"crew/recipes": () => import("@/features/crew/recipes").then((m) => m.Recipes),
	"crew/sessions": () => import("@/features/crew/sessions").then((m) => m.CrewSessions),
	"crew/spend": () => import("@/features/crew/spend").then((m) => m.Spend),
	"crew/rights": () => import("@/features/crew/rights").then((m) => m.Rights),
	"design/diagrams": () => import("@/features/design/diagrams").then((m) => m.Diagrams),
	"design/architecture": () => import("@/features/design/architecture").then((m) => m.Architecture),
	"design/decisions": () => import("@/features/design/decisions").then((m) => m.Decisions),
	"design/api": () => import("@/features/design/api").then((m) => m.Api),
	"design/data": () => import("@/features/design/data").then((m) => m.Data),
	"design/flows": () => import("@/features/design/flows").then((m) => m.Flows),
	"design/screens": () => import("@/features/design/screens").then((m) => m.Screens),
	"specs/capabilities": () => import("@/features/specs/capabilities").then((m) => m.Capabilities),
	"specs/questions": () => import("@/features/specs/questions").then((m) => m.Questions),
	"specs/test-plans": () => import("@/features/specs/test-plans").then((m) => m.TestPlans),
	"specs/constitution": () => import("@/features/specs/constitution").then((m) => m.Constitution),
	"knowledge/graph": () => import("@/features/knowledge/graph").then((m) => m.Graph),
	"knowledge/handbook": () => import("@/features/knowledge/pages").then((m) => m.Handbook),
	"knowledge/manual": () => import("@/features/knowledge/manual").then((m) => m.Manual),
	"knowledge/documents": () => import("@/features/knowledge/documents").then((m) => m.Documents),
	"knowledge/slides": () => import("@/features/knowledge/slides").then((m) => m.Slides),
	"knowledge/learn": () => import("@/features/knowledge/learn").then((m) => m.Learn),
	"knowledge/dashboards": () => import("@/features/knowledge/dashboards").then((m) => m.Dashboards),
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
export async function preloadTab(space: SectionSpace, tab: string) {
	const key = `${space}/${tab}`;
	const View = await LOADERS[key]?.();
	if (View) loaded.set(key, View);
}

export function TabView({ space, tab }: { space: SectionSpace; tab: string }) {
	const { t } = useI18n();
	const key = `${space}/${tab}`;
	// A preloaded view renders at once; the lazy one covers a render before the preload ends.
	const load = LOADERS[key];
	const View = loaded.get(key) ?? (load && lazyView(key, load));
	const title = tabLabel(t, space, tab);
	const Icon = tabIcon(space, tab);
	const icon = Icon && <Icon size={16} />;
	if (View)
		return (
			<Suspense fallback={<Loading title={title} icon={icon} />}>
				<View />
			</Suspense>
		);
	return (
		<div className="flex flex-col gap-4">
			<PageHeader icon={icon} title={title} />
			<EmptyState title={t.empty.nothing} />
		</div>
	);
}
