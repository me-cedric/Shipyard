import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// Checks of `spec:app-redesign#REQ-023` (picture 022).
const feature = (f: Partial<FlowFeature_Serialize> & { title: string }): FlowFeature_Serialize => ({
	stage: "review",
	mark: null,
	ticket: null,
	change: null,
	run: null,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop: null,
	...f,
});

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

afterEach(() => vi.restoreAllMocks());

describe("Checks (REQ-023)", () => {
	it("counts the failing checks, shows each with its pill and Full log, and offers the fix", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const pull = (await unwrap(commands.pullsList())).find((p) => p.number === 142);
		if (!pull) throw new Error("the demo has pull request 142");
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature({ title: pull.title, pr: pull.reference, checks: "failing" })],
		});
		const router = mountApp("/code/pull-requests/github-demo-142?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		const top = await within(panel).findByRole("region", { name: "2 of 3 checks fail" });
		// The count says it: the card shows no second "CI failing" line.
		expect(within(top).queryByText("CI failing")).toBeNull();
		expect(within(top).getByRole("button", { name: "Fix with an agent" })).toBeVisible();
		expect(within(top).getByRole("img", { name: "Builder" })).toBeVisible();
		expect(within(panel).getByText("Code host checks")).toBeVisible();
		expect(within(panel).getAllByRole("img", { name: "Failing" }).length).toBeGreaterThanOrEqual(2);
		expect(within(panel).getByText("Test plan")).toBeVisible();
		expect(within(panel).getByRole("button", { name: "Open the test plan" })).toBeVisible();
		expect(within(panel).getAllByText("Fail").length).toBeGreaterThanOrEqual(2);
		expect(
			within(panel).getAllByRole("button", { name: "Full log" }).length,
		).toBeGreaterThanOrEqual(2);
		await idle(router);
	});

	it("says a count of one in the singular, and names a scan that never ran", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const pull = (await unwrap(commands.pullsList())).find((p) => p.number === 141);
		if (!pull) throw new Error("the demo has pull request 141");
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature({ title: pull.title, pr: pull.reference, checks: "passing" })],
		});
		const router = mountApp("/code/pull-requests/github-demo-141?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		expect(await within(panel).findByRole("region", { name: "1 check passes" })).toBeVisible();
		expect(
			within(within(panel).getByRole("button", { name: /^Secrets, code scan/ })).getByText(
				"Never run",
			),
		).toBeVisible();
		await idle(router);
	});

	it("lists the scenarios of the change with a verdict each, from the demo case of the settings page", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/flow/feature/wi%3AACME-5?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		const plan = within(
			(await within(panel).findByText("Test plan")).closest("div") as HTMLElement,
		);
		const rows = await plan.findAllByRole("listitem");
		expect(rows).toHaveLength(2);
		const [passed, open] = rows as [HTMLElement, HTMLElement];
		expect(within(passed).getByText("Every option shows")).toBeVisible();
		expect(within(passed).getByRole("img", { name: "Pass" })).toBeVisible();
		expect(within(passed).getByText("Pass", { selector: "span" })).toBeVisible();
		expect(within(open).getByText("An option is saved")).toBeVisible();
		expect(within(open).getByRole("img", { name: "No test yet" })).toBeVisible();
		expect(within(open).getByText("No test yet", { selector: "span" })).toBeVisible();
		await idle(router);
	});

	it("shows the quality gates with the link to the impacts page", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature({ title: "Refuse an empty token", stage: "idea", change: "change:x" })],
		});
		const router = mountApp("/flow/feature/change%3Ax?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		expect(await within(panel).findByText("Quality gates of this change")).toBeVisible();
		expect(within(panel).getByText("Docs that this change makes stale")).toBeVisible();
		await user.click(
			within(panel).getByRole("button", { name: /^Secrets, code scan, dependencies/ }),
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/health"));
		await idle(router);
	});
});
