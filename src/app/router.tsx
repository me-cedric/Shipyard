import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	Navigate,
	Outlet,
	type ParsedLocation,
	type RouterHistory,
	redirect,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { motion } from "motion/react";
import { SECTIONS, type Section } from "@/features/flow/sections";
import { setupAddress } from "@/features/settings/setup-address";
import {
	AppShell,
	firstPath,
	firstSection,
	hiddenSection,
	hiddenTab,
	OLD_SLUGS,
	PLACES,
	type PlaceId,
	type PlacePath,
	placePath,
	SectionBar,
	type SectionSpace,
	SPACES,
	type SpaceId,
	sectionPath,
	sectionView,
	tabIcon,
	tabLabel,
} from "@/features/shell";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useRights } from "@/lib/rights";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { SPRING, useReducedMotionPref } from "@/ui/motion";
import { NotFound } from "./not-found";
import { refActions } from "./ref-actions";
import { RouteError } from "./route-error";
import { preloadTab, TabView } from "./tab-view";

const rootRoute = createRootRoute({
	component: () => <AppShell refActions={refActions} />,
	notFoundComponent: NotFound,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: function RoleHome() {
		const { teamRole } = usePrefs();
		const { level } = useRights();
		return <Navigate to={firstPath(teamRole, level)} replace />;
	},
});

/** A tab of an area at `none`: a direct route shows this, not the view. */
function NoAccess({ space, tab }: { space: SectionSpace; tab: string }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const Icon = tabIcon(space, tab);
	return (
		<>
			<PageHeader icon={Icon && <Icon size={16} />} title={tabLabel(t, space, tab)} />
			<EmptyState
				title={t.rights.noAccess}
				action={{
					label: t.tabs.home.today,
					onClick: () => void navigate({ to: "/today/today" }),
				}}
			/>
		</>
	);
}

function PlaceLayout({ place }: { place: PlaceId }) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const still = useReducedMotionPref();
	const { level } = useRights();
	// The place index has no section: it redirects to the first visible section.
	// A run has its own address under Flow, with the view Flow selected (ux-declutter REQ-027).
	const part = path.split("/")[2];
	// A pull request has its address under Code, with Now selected (`spec:app-redesign#REQ-022`).
	const slug =
		place === "flow" && (part === "runs" || part === "feature")
			? "flow"
			: place === "code" && part === "pull-requests"
				? "now"
				: part;
	// New feature makes a ticket or a spec change: it shows with the List.
	const gate = place === "flow" && part === "new" ? "list" : slug;
	// Impacts left the switch of Flow: its page keeps the gate of the code area.
	const view: [SectionSpace, string] | undefined =
		place === "flow" && slug === "impacts"
			? ["code", "impacts"]
			: gate
				? sectionView(place, gate)
				: undefined;
	return (
		<div className="flex h-full flex-col">
			<SectionBar place={place} slug={slug} />
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area needs a keyboard stop (axe scrollable-region-focusable) */}
			<div tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-auto">
				{/* A new section rises into place. Only the position moves, so the text never hides. */}
				<motion.div
					key={path}
					initial={still ? false : { y: 8 }}
					animate={{ y: 0 }}
					transition={SPRING.gentle}
					className="flex min-h-0 flex-1 flex-col"
				>
					{view && hiddenSection(level, ...view) ? (
						<NoAccess space={view[0]} tab={view[1]} />
					) : (
						<Outlet />
					)}
				</motion.div>
			</div>
		</div>
	);
}

/** The place opens on its first section: the first page of the role, else the first visible one. */
function FirstSection({ place }: { place: PlaceId }) {
	const { teamRole } = usePrefs();
	const { level } = useRights();
	const path = useRouterState({ select: (s) => s.location.pathname });
	// The layout keeps this view while the next location loads: only the place index redirects.
	return path.replace(/\/$/, "") === `/${place}` ? (
		<Navigate to={sectionPath(place, firstSection(place, teamRole, level))} replace />
	) : null;
}

const runsSearch = (
	s: Record<string, unknown>,
): { q?: string; filter?: "needs" | "mine"; view?: "history" } => ({
	// A text such as "12" comes back from the address as a number.
	...(s.q != null && s.q !== "" ? { q: String(s.q) } : {}),
	...(s.filter === "needs" || s.filter === "mine" ? { filter: s.filter } : {}),
	...(s.view === "history" ? { view: "history" as const } : {}),
});

/** The bar of Flow: the search and the filter of the runs of before, with no view (History is its own view). */
const flowSearch = (s: Record<string, unknown>): { q?: string; filter?: "needs" | "mine" } => {
	const { view: _, ...rest } = runsSearch(s);
	return rest;
};

const crewSearch = (s: Record<string, unknown>): { view?: "live"; member?: string } => ({
	...(s.view === "live" ? { view: "live" as const } : {}),
	// The open person: a handle, or an empty text for a new member.
	...(s.member != null ? { member: String(s.member) } : {}),
});

/** One optional text key of the address, such as the recipe of Recipes or the sheet of Plan. */
const textSearch =
	<K extends string>(key: K) =>
	(s: Record<string, unknown>): { [P in K]?: string } =>
		(s[key] != null && s[key] !== "" ? { [key]: String(s[key]) } : {}) as { [P in K]?: string };

const kindSearch = (s: Record<string, unknown>): { kind?: "idea" } =>
	s.kind === "idea" ? { kind: "idea" } : {};

const pullsSearch = (s: Record<string, unknown>): { q?: string; filter?: "needs" } => ({
	...(s.q != null && s.q !== "" ? { q: String(s.q) } : {}),
	...(s.filter === "needs" ? { filter: "needs" as const } : {}),
});

const sectionSearch = (s: Record<string, unknown>): { section?: Section } =>
	SECTIONS.includes(s.section as Section) ? { section: s.section as Section } : {};

const runSearch = (
	s: Record<string, unknown>,
): { unit?: string; tab?: "changes" | "workflow"; section?: Section } => ({
	...sectionSearch(s),
	...(typeof s.unit === "string" && s.unit ? { unit: s.unit } : {}),
	// Activity is the default tab: it has no value in the address.
	...(s.tab === "changes" || s.tab === "workflow" ? { tab: s.tab } : {}),
});

const featureSearch = (s: Record<string, unknown>): { section?: Section; unit?: string } => ({
	...sectionSearch(s),
	...(typeof s.unit === "string" && s.unit ? { unit: s.unit } : {}),
});

/** An address of before adr:0023 opens the new place of its page, with its search and its hash (adr:0023 point 9). */
const toPlace = ({ location }: { location: ParsedLocation }) => {
	// A Settings tab of before wave 6 opens its scope of Setup, on the page that holds its anchor.
	const tab = /^\/(?:settings|setup)\/([\w-]+)\/?$/.exec(location.pathname)?.[1];
	const scope = tab && !("page" in location.search) ? setupAddress(tab, location.hash) : undefined;
	if (scope) {
		const [address = "", anchor] = scope.split("#");
		const [path, page] = address.split("?");
		const search = [page, location.searchStr.slice(1)].filter(Boolean).join("&");
		const href = `${path}${search ? `?${search}` : ""}${anchor ? `#${anchor}` : ""}`;
		const here = `${location.pathname}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`;
		if (href !== here) throw redirect({ href, replace: true });
		return;
	}
	let to = placePath(location.pathname);
	if (!to || to === location.pathname) return;
	let search = location.searchStr;
	// The run history of before is the view Done: its `view` choice leaves the address.
	if (to === "/flow/flow" && (location.search as { view?: unknown }).view === "history") {
		to = "/flow/done";
		search = search.replace(/([?&])view=[^&]*&?/, "$1").replace(/[?&]$/, "");
	}
	// The agents map of before is the live view of Crew.
	if (location.pathname.replace(/\/$/, "").endsWith("/agents-map"))
		search = search ? `${search}&view=live` : "?view=live";
	const hash = location.hash ? `#${location.hash}` : "";
	throw redirect({ href: `${to}${search}${hash}`, replace: true });
};

/**
 * The views of Flow, each a page of the flow feature. The old tab views are its parts. The home of
 * Library and Reports are pages of their own too.
 */
const FLOW_VIEW = {
	"library/home": () =>
		lazyRouteComponent(() => import("@/features/library/library-home"), "LibraryHome"),
	"library/reports": () =>
		lazyRouteComponent(() => import("@/features/reports/reports-page"), "Reports"),
	"flow/flow": () => lazyRouteComponent(() => import("@/features/flow/flow-page"), "FlowBoard"),
	"flow/list": () => lazyRouteComponent(() => import("@/features/flow/flow-page"), "FlowList"),
	"flow/done": () => lazyRouteComponent(() => import("@/features/flow/flow-page"), "FlowDone"),
	"flow/health": () => lazyRouteComponent(() => import("@/features/code/quality"), "Quality"),
} as const;

type TabOf<V> = V extends `${string}/${infer T}` ? T : never;

/** A place route, its index redirect to the first section, and one child route for each section. */
function placeRoute<P extends PlaceId>(place: P) {
	const route = createRoute({
		getParentRoute: () => rootRoute,
		path: place,
		component: () => <PlaceLayout place={place} />,
	});
	const index = createRoute({
		getParentRoute: () => route,
		path: "/",
		component: () => <FirstSection place={place} />,
	});
	const views: readonly (typeof PLACES)[P][number][] = PLACES[place];
	const sections = views.map((view) => {
		const [space, tab] = view.split("/") as [SectionSpace, TabOf<typeof view>];
		return createRoute({
			getParentRoute: () => route,
			path: tab,
			loader: () => preloadTab(space, tab),
			// News and Activity of Today are pages of the home feature: no old tab view holds them.
			component:
				view in FLOW_VIEW
					? FLOW_VIEW[view as keyof typeof FLOW_VIEW]()
					: view === "home/news"
						? lazyRouteComponent(() => import("@/features/home/news"), "News")
						: view === "home/activity"
							? lazyRouteComponent(() => import("@/features/home/activity"), "ActivityView")
							: () => <TabView space={space} tab={tab} />,
			// The bar of Flow (ux-declutter REQ-034): search and filter, kept in the address.
			...(view === "flow/flow" || view === "flow/list" || view === "flow/done"
				? { validateSearch: flowSearch }
				: {}),
			// Crew shows the cards or the live work rows (`spec:app-redesign#REQ-017`).
			...(view === "crew/crew" ? { validateSearch: crewSearch } : {}),
			// The open recipe of Recipes, and the sheet that the sections of Plan share.
			...(view === "crew/recipes" ? { validateSearch: textSearch("recipe") } : {}),
			...(view === "plan/timeline" || view === "plan/people" || view === "plan/estimates"
				? { validateSearch: textSearch("sheet") }
				: {}),
			// The bar of Pull requests (ux-declutter REQ-042): search and filter, kept in the address.
			...(view === "code/now" ? { validateSearch: pullsSearch } : {}),
			// An anchor of This project or of Me that moved to a sub-page opens that page.
			...(view === "setup/project" || view === "setup/me" ? { beforeLoad: toPlace } : {}),
		});
	});
	// A run has its own address, with Runs selected (ux-declutter REQ-027).
	const run =
		place === "flow"
			? [
					createRoute({
						getParentRoute: () => route,
						path: "runs/$runId",
						validateSearch: runSearch,
						component: lazyRouteComponent(
							() => import("@/features/flow/feature/feature-page"),
							"RunAddress",
						),
					}),
					// One feature, found by the ref of one of its parts (`spec:app-redesign#REQ-012`).
					createRoute({
						getParentRoute: () => route,
						path: "feature/$featureId",
						validateSearch: featureSearch,
						component: lazyRouteComponent(
							() => import("@/features/flow/feature/feature-page"),
							"FeaturePage",
						),
					}),
					// The tabs of Flow before wave 3 redirect to their view.
					...(["backlog", "board", "runs", "changes", "quality"] as const).map((tab) =>
						createRoute({ getParentRoute: () => route, path: tab, beforeLoad: toPlace }),
					),
					// Impacts is off the section switch: it opens from the Checks of a feature (`spec:app-redesign#REQ-023`).
					createRoute({
						getParentRoute: () => route,
						path: "impacts",
						loader: () => preloadTab("code", "impacts"),
						component: () => <TabView space="code" tab="impacts" />,
					}),
					// New feature (`spec:app-redesign#REQ-003`).
					createRoute({
						getParentRoute: () => route,
						path: "new",
						validateSearch: kindSearch,
						component: lazyRouteComponent(
							() => import("@/features/flow/new-feature"),
							"NewFeature",
						),
					}),
				]
			: [];
	// A pull request has its own address, with Pull requests selected (ux-declutter REQ-041).
	// Code / Quality and Impacts of before adr:0023 share the prefix of the Code place.
	const code =
		place === "code"
			? [
					createRoute({
						getParentRoute: () => route,
						path: "pull-requests/$pullId",
						validateSearch: (
							s: Record<string, unknown>,
						): { tab?: "commits" | "checks" | "files"; section?: Section } => ({
							...sectionSearch(s),
							// A pull request opens on Changes: its tabs of before name a section.
							...(s.tab === "commits" || s.tab === "checks" || s.tab === "files"
								? { tab: s.tab }
								: {}),
						}),
						component: lazyRouteComponent(
							() => import("@/features/flow/feature/feature-page"),
							"PullAddress",
						),
					}),
					// Changes and Pull requests are Now (`spec:app-redesign#REQ-022`): the search of the pull requests stays.
					...(["quality", "impacts", "changes", "pull-requests"] as const).map((tab) =>
						createRoute({ getParentRoute: () => route, path: tab, beforeLoad: toPlace }),
					),
				]
			: [];
	// The tabs of Plan and Crew before wave 4 redirect to their section.
	const old =
		place === "plan" || place === "crew"
			? Object.keys(OLD_SLUGS[place] ?? {})
					.filter((tab) => !views.some((v) => v === `${place}/${tab}`))
					.map((tab) =>
						createRoute({ getParentRoute: () => route, path: tab, beforeLoad: toPlace }),
					)
			: [];
	// The addresses of before wave 6 under Today and Setup redirect: Projects, and the six Settings tabs.
	const moved = (
		place === "today"
			? (["projects"] as const)
			: place === "setup"
				? (["connections", "agents-rules", "extensions", "health"] as const)
				: []
	).map((tab) => createRoute({ getParentRoute: () => route, path: tab, beforeLoad: toPlace }));
	return route.addChildren([index, ...sections, ...run, ...code, ...old, ...moved]);
}

/** A bare old space opens the first page of the role when the space held it, else the place of its first tab that the role sees: `/factory` shows Flow. */
function OldSpaceHome({ space }: { space: SpaceId }) {
	const { teamRole } = usePrefs();
	const { level } = useRights();
	const tabs = SPACES[space].filter((tab) => !hiddenTab(level, space, tab));
	const pages = (tabs.length ? tabs : SPACES[space]).map((tab) => placePath(`/${space}/${tab}`));
	const first = firstPath(teamRole, level);
	// shortcut: one cast. `placePath` of a tab of a space is always a section path.
	return <Navigate to={(pages.includes(first) ? first : pages[0]) as PlacePath} replace />;
}

/** A space of before adr:0023 stays registered, so a stored or typed address works: it redirects to its place. */
function oldSpaceRoute<S extends Exclude<SpaceId, "code">>(space: S) {
	const route = createRoute({ getParentRoute: () => rootRoute, path: space, beforeLoad: toPlace });
	const index = createRoute({
		getParentRoute: () => route,
		path: "/",
		component: () => <OldSpaceHome space={space} />,
	});
	const names: readonly (typeof SPACES)[S][number][] = SPACES[space];
	const tabs = names.map((tab) =>
		createRoute({
			getParentRoute: () => route,
			path: tab,
			...(space === "factory" && tab === "runs" ? { validateSearch: runsSearch } : {}),
		}),
	);
	const run =
		space === "factory"
			? [
					createRoute({
						getParentRoute: () => route,
						path: "runs/$runId",
						validateSearch: runSearch,
					}),
				]
			: [];
	return route.addChildren([index, ...tabs, ...run]);
}

// The gallery exists in the dev build only. The release build drops the import.
const galleryRoute = import.meta.env.DEV
	? createRoute({
			getParentRoute: () => rootRoute,
			path: "dev/gallery",
			component: lazyRouteComponent(() => import("@/ui/gallery/gallery"), "Gallery"),
		})
	: null;

/** Settings / Team moved to Crew / Team, and Home / Inbox and My work became Today: a stored last view must not show Not found. */
const movedRoutes = (["settings/team", "home/inbox", "home/my-work"] as const).map((path) =>
	createRoute({ getParentRoute: () => rootRoute, path, beforeLoad: toPlace }),
);

/** The Projects page: no place holds it, the project name of the top bar opens it (picture 060). */
const projectsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "projects",
	loader: () => preloadTab("home", "projects"),
	component: () => (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area needs a keyboard stop (axe scrollable-region-focusable)
		<div tabIndex={0} className="flex h-full min-h-0 flex-col overflow-auto">
			<TabView space="home" tab="projects" />
		</div>
	),
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	projectsRoute,
	placeRoute("today"),
	placeRoute("flow"),
	placeRoute("plan"),
	placeRoute("crew"),
	placeRoute("library"),
	placeRoute("code"),
	placeRoute("setup"),
	oldSpaceRoute("home"),
	oldSpaceRoute("design"),
	oldSpaceRoute("specs"),
	oldSpaceRoute("work"),
	oldSpaceRoute("factory"),
	oldSpaceRoute("knowledge"),
	oldSpaceRoute("settings"),
	...movedRoutes,
	...(galleryRoute ? [galleryRoute] : []),
]);

export function createAppRouter(history?: RouterHistory) {
	return createRouter({ routeTree, history, defaultErrorComponent: RouteError });
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}

export { createMemoryHistory };
