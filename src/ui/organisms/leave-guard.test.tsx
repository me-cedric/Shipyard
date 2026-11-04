import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { PrefsProvider } from "@/lib/prefs";
import { LeaveGuard } from "./leave-guard";

function mount(dirty: boolean) {
	const root = createRootRoute();
	const home = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => <LeaveGuard dirty={dirty} />,
	});
	const other = createRoute({ getParentRoute: () => root, path: "/b", component: () => <p>b</p> });
	const router = createRouter({
		routeTree: root.addChildren([home, other]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	render(
		<QueryClientProvider client={new QueryClient()}>
			<I18nProvider>
				<PrefsProvider>
					<RouterProvider router={router} />
				</PrefsProvider>
			</I18nProvider>
		</QueryClientProvider>,
	);
	return router;
}

describe("LeaveGuard", () => {
	it("asks before it leaves with a draft", async () => {
		const router = mount(true);
		await act(async () => {});
		await act(async () => router.history.push("/b"));
		expect(await screen.findByText("Your changes are not saved.")).toBeVisible();
		expect(router.state.location.pathname).toBe("/");
		await userEvent.click(screen.getByRole("button", { name: "Leave" }));
		await act(async () => {});
		expect(router.state.location.pathname).toBe("/b");
	});

	it("lets a clean page go", async () => {
		const router = mount(false);
		await act(async () => router.history.push("/b"));
		expect(router.state.location.pathname).toBe("/b");
	});
});
