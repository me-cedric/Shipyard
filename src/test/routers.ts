/** The routers that the tests mounted. The setup reads them without loading the app. */
type Settling = { state: { status: string } };

const key = "__shipyardTestRouters";
export const routers = (): Settling[] => {
	const g = globalThis as Record<string, unknown>;
	g[key] ??= [];
	return g[key] as Settling[];
};

/** Waits until each mounted router is idle: a navigation after the test would run with no window. */
export async function settleRouters() {
	const all = routers().splice(0);
	// `Date` is fixed in the tests: the clock of the wait is `performance`. An unmounted router can stay pending.
	const end = performance.now() + 2000;
	while (all.some((r) => r.state.status !== "idle") && performance.now() < end)
		await new Promise((done) => setTimeout(done, 10));
}
