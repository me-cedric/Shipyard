import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { arriveAt, useTopOnPageMove } from "./anchor";

const mount = () =>
	render(
		<details>
			<summary>More</summary>
			<div id="row">
				<span>Label</span>
				<button type="button">Control</button>
			</div>
		</details>,
	);

const motion = (reduce: boolean) =>
	vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }));

describe("arriveAt", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Element.prototype.scrollIntoView = vi.fn();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("scrolls the row into view, focuses its control and rings it for 2 s", () => {
		motion(false);
		mount();
		expect(arriveAt("row")).toBe(true);
		expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
			block: "center",
			behavior: "smooth",
		});
		expect(screen.getByRole("button", { name: "Control" })).toHaveFocus();
		const row = document.getElementById("row");
		expect(row).toHaveAttribute("data-anchor-hit");
		act(() => vi.advanceTimersByTime(2000));
		expect(row).not.toHaveAttribute("data-anchor-hit");
	});

	it("opens a closed group that holds the row", () => {
		motion(false);
		mount();
		arriveAt("row");
		expect(document.querySelector("details")).toHaveAttribute("open");
	});

	it("jumps with no smooth scroll under reduced motion", () => {
		motion(true);
		mount();
		arriveAt("row");
		expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
			block: "center",
			behavior: "auto",
		});
	});

	it("returns false for an id that is not in the page", () => {
		expect(arriveAt("nothing")).toBe(false);
	});
});

describe("useTopOnPageMove", () => {
	it("scrolls the page area to the top on a new path or page, not on an anchor", async () => {
		const root = createRootRoute({
			component: () => {
				useTopOnPageMove();
				return (
					<div data-page-area>
						<main>
							<Outlet />
						</main>
					</div>
				);
			},
		});
		const route = createRoute({
			getParentRoute: () => root,
			path: "/setup",
			validateSearch: (s: Record<string, unknown>) => ({ page: s.page as string | undefined }),
			component: () => null,
		});
		const history = createMemoryHistory({ initialEntries: ["/setup"] });
		const router = createRouter({ routeTree: root.addChildren([route]), history });
		const main = () => document.querySelector("main") as HTMLElement;
		render(<RouterProvider router={router} />);
		await waitFor(() => expect(main()).toBeTruthy());
		// The page area scrolls, and a pane inside it scrolls on its own.
		const pane = document.createElement("div");
		main().append(pane);
		main().scrollTop = 300;
		pane.scrollTop = 120;
		await act(() => router.navigate({ to: "/setup", search: { page: "look" } }));
		await waitFor(() => expect(main().scrollTop).toBe(0));
		expect(pane.scrollTop).toBe(0);
		main().scrollTop = 300;
		await act(() => router.navigate({ to: "/setup", search: { page: "look" }, hash: "row" }));
		await act(() => router.navigate({ to: "/setup", search: { page: "keys" }, hash: "row" }));
		expect(main().scrollTop).toBe(300);
	});
});
