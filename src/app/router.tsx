import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	Navigate,
	Outlet,
	type RouterHistory,
	useRouterState,
} from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import {
	AppShell,
	ROLE_HOME,
	SPACES,
	type SpaceId,
	TabsBar,
	tabPath,
	visibleTabs,
} from "@/features/shell";
import { usePrefs } from "@/lib/prefs";
import { SPRING } from "@/ui/motion";
import { NotFound } from "./not-found";
import { refActions } from "./ref-actions";
import { preloadTab, TabView } from "./tab-view";

const rootRoute = createRootRoute({
	component: () => <AppShell refActions={refActions} />,
	notFoundComponent: NotFound,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: function RoleHome() {
		const { role } = usePrefs();
		return <Navigate to={`/${ROLE_HOME[role]}` as const} replace />;
	},
});

function SpaceLayout({ space }: { space: SpaceId }) {
	const { profile, role } = usePrefs();
	const path = useRouterState({ select: (s) => s.location.pathname });
	const still = useReducedMotion();
	// A tab that the project hides goes to the first tab that it keeps.
	const shown = visibleTabs(space, profile.hiddenTabs, role);
	const first = shown[0];
	const hidden = space !== "settings" && profile.hiddenTabs.some((h) => path === `/${h}`);
	if (first && hidden) return <Navigate to={tabPath(space, first)} replace />;
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
					<Outlet />
				</motion.div>
			</div>
		</div>
	);
}

/** The space opens on its first tab: the tab of the role, else the first tab that the project keeps. */
function FirstTab({ space }: { space: SpaceId }) {
	const { profile, role } = usePrefs();
	const path = useRouterState({ select: (s) => s.location.pathname });
	const first = visibleTabs(space, profile.hiddenTabs, role)[0] ?? SPACES[space][0];
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
	...(galleryRoute ? [galleryRoute] : []),
]);

export function createAppRouter(history?: RouterHistory) {
	return createRouter({ routeTree, history });
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}

export { createMemoryHistory };
