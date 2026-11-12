import { RouterContextProvider } from "@tanstack/react-router";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { createAppRouter, createMemoryHistory } from "@/app/router";
import { commands, unwrap } from "@/lib/ipc";
import { NotificationsProvider } from "@/lib/notifications";
import { ShellProvider } from "@/lib/shell";
import { routers } from "@/test/routers";
import { useActions } from "./actions";

// The inventory of `update-ux-declutter` REQ-016: each palette action and each route that
// exists before the change. A later wave moves a control, never removes one of these.
const SPACE_LIST = [
	"home",
	"design",
	"specs",
	"work",
	"factory",
	"code",
	"knowledge",
	"settings",
] as const;

const ACTION_IDS = [
	...SPACE_LIST.map((s) => `go-${s}`),
	"toggle-assistant",
	"palette",
	"toggle-files",
	"toggle-terminal",
	"shortcuts-help",
	"toggle-theme",
	"toggle-sidebar",
	"toggle-inspector",
	"theme-light",
	"theme-dark",
	"theme-system",
	"lang-en",
	"lang-fr",
	"lang-de",
	"lang-es",
	"project-open",
	"project-switch",
	"project-close",
	"sync",
	"fetch",
	"push",
	"commit",
	"update-check",
	"whats-new",
	"manual",
	"tour",
	"terminal-open-app",
	"nav-back",
	"nav-forward",
	"text-larger",
	"text-smaller",
	"text-reset",
];

const TABS = {
	home: ["today", "projects"],
	design: ["diagrams", "architecture", "decisions", "api", "data", "flows", "screens"],
	specs: ["changes", "capabilities", "questions", "test-plans", "constitution"],
	work: ["backlog", "board", "plan", "estimates", "team", "time"],
	factory: ["runs", "workflows", "agents-map", "sessions", "usage"],
	code: ["changes", "history", "branches", "pull-requests", "quality", "impacts", "terminal"],
	knowledge: ["graph", "handbook", "manual", "documents", "slides", "learn", "dashboards"],
	settings: ["project", "connections", "agents-rules", "extensions", "me", "health"],
} as const;

const PATHS = [
	...SPACE_LIST.map((s) => `/${s}`),
	...SPACE_LIST.flatMap((s) => TABS[s].map((tab) => `/${s}/${tab}`)),
	"/settings/team",
	"/home/inbox",
	"/home/my-work",
	"/home/activity",
];

describe("inventory (ux-declutter REQ-016)", () => {
	it("keeps every route", () => {
		const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
		routers().push(router);
		const known = Object.keys(router.routesByPath);
		for (const path of PATHS) expect(known, path).toContain(path);
	});

	it("keeps every palette action", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = createAppRouter(createMemoryHistory({ initialEntries: ["/home/today"] }));
		routers().push(router);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<Providers>
				<RouterContextProvider router={router}>
					<NotificationsProvider>
						<ShellProvider>{children}</ShellProvider>
					</NotificationsProvider>
				</RouterContextProvider>
			</Providers>
		);
		const { result } = renderHook(() => useActions(), { wrapper });
		await waitFor(() => expect(result.current).toBeTruthy());
		const ids = result.current.list.map((a) => a.id);
		for (const id of ACTION_IDS) expect(ids, id).toContain(id);
	});
});
