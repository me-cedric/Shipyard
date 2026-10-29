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
} from "@tanstack/react-router";
import { BranchSelector } from "@/features/code";
import { AppShell, ROLE_HOME, SPACES, type SpaceId, TabsBar, tabPath } from "@/features/shell";
import { usePrefs } from "@/lib/prefs";
import { NotFound } from "./not-found";
import { refActions } from "./ref-actions";
import { TabView } from "./tab-view";

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
	return (
		<div className="flex h-full flex-col">
			<TabsBar space={space} trailing={space === "code" ? <BranchSelector /> : undefined} />
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area needs a keyboard stop (axe scrollable-region-focusable) */}
			<div tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-auto">
				<Outlet />
			</div>
		</div>
	);
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
		beforeLoad: () => {
			throw redirect({ to: tabPath(space, SPACES[space][0]) });
		},
	});
	const names: readonly (typeof SPACES)[S][number][] = SPACES[space];
	const tabs = names.map((tab) =>
		createRoute({
			getParentRoute: () => route,
			path: tab,
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
