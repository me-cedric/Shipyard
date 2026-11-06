import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	Navigate,
	Outlet,
	type RouterHistory,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import {
	AppShell,
	firstPath,
	hiddenTab,
	SPACES,
	type SpaceId,
	TabsBar,
	tabPath,
	visibleTabs,
} from "@/features/shell";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useRights } from "@/lib/rights";
import { SPRING } from "@/ui/motion";
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
		const [, space, tab] = firstPath(teamRole).split("/") as [string, SpaceId, string];
		return (
			<Navigate to={hiddenTab(level, space, tab) ? "/home/today" : firstPath(teamRole)} replace />
		);
	},
});

/** A tab of an area at `none`: a direct route shows this, not the view. */
function NoAccess() {
	const { t } = useI18n();
	return <p className="p-4 text-14 font-medium text-n-11">{t.rights.noAccess}</p>;
}

function SpaceLayout({ space }: { space: SpaceId }) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const still = useReducedMotion();
	const { level } = useRights();
	// The space index has no tab: it redirects to the first visible tab.
	const tab = path.split("/")[2];
	const hidden = !!tab && hiddenTab(level, space, tab);
	return (
		<div className="flex h-full flex-col">
			<TabsBar space={space} />
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area needs a keyboard stop (axe scrollable-region-focusable) */}
			<div tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-auto">
				{/* A new tab rises into place. Only the position moves, so the text never hides. */}
				<motion.div
					key={path}
					initial={still ? false : { y: 8 }}
					animate={{ y: 0 }}
					transition={SPRING.gentle}
					className="flex min-h-0 flex-1 flex-col"
				>
					{hidden ? <NoAccess /> : <Outlet />}
				</motion.div>
			</div>
		</div>
	);
}

/** The space opens on its first tab: the tab of the role, else the first tab. */
function FirstTab({ space }: { space: SpaceId }) {
	const { teamRole } = usePrefs();
	const { level } = useRights();
	const path = useRouterState({ select: (s) => s.location.pathname });
	const first = visibleTabs(space, teamRole, level)[0] ?? SPACES[space][0];
	// The layout keeps this view while the next location loads: only the space index redirects.
	return path.replace(/\/$/, "") === `/${space}` ? (
		<Navigate to={tabPath(space, first)} replace />
	) : null;
}

/** A space route, its index redirect to the first tab, and one child route for each tab. */
function spaceRoute<S extends SpaceId>(space: S) {
	const route = createRoute({
		getParentRoute: () => rootRoute,
		path: space,
		component: () => <SpaceLayout space={space} />,
	});
	const index = createRoute({
		getParentRoute: () => route,
		path: "/",
		component: () => <FirstTab space={space} />,
	});
	const names: readonly (typeof SPACES)[S][number][] = SPACES[space];
	const tabs = names.map((tab) =>
		createRoute({
			getParentRoute: () => route,
			path: tab,
			loader: () => preloadTab(space, tab),
			component: () => <TabView space={space} tab={tab} />,
		}),
	);
	return route.addChildren([index, ...tabs]);
}

// The gallery exists in the dev build only. The release build drops the import.
const galleryRoute = import.meta.env.DEV
	? createRoute({
			getParentRoute: () => rootRoute,
			path: "dev/gallery",
			component: lazyRouteComponent(() => import("@/ui/gallery/gallery"), "Gallery"),
		})
	: null;

/** Settings / Team moved to Work / Team: a stored last view must not show Not found. */
const teamRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "settings/team",
	beforeLoad: () => {
		throw redirect({ to: "/work/team", replace: true });
	},
});

/** Home / Inbox, My work and Activity became Today: an old link or a stored last view opens it. */
const oldHomeRoutes = ["inbox", "my-work", "activity"].map((tab) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path: `home/${tab}`,
		beforeLoad: () => {
			throw redirect({ to: "/home/today", replace: true });
		},
	}),
);

const routeTree = rootRoute.addChildren([
	indexRoute,
	spaceRoute("home"),
	spaceRoute("design"),
	spaceRoute("specs"),
	spaceRoute("work"),
	spaceRoute("factory"),
	spaceRoute("code"),
	spaceRoute("knowledge"),
	spaceRoute("settings"),
	teamRoute,
	...oldHomeRoutes,
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
