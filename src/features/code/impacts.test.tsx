import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { parsePlan } from "./impacts";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
/** Analyze and the two sections of the details are items of the More menu of the page. */
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click(await screen.findByRole("button", { name: "More" }));
	await user.click(await screen.findByRole("menuitem", { name }));
};

const feature: FlowFeature_Serialize = {
	title: "Refuse an empty token",
	stage: "idea",
	mark: null,
	ticket: null,
	change: "change:x",
	run: null,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop: null,
};

describe("Code / Impacts", () => {
	afterEach(() => vi.restoreAllMocks());

	it("parses the three lists of a plan", () => {
		const plan =
			"## Axes\n\n- data: high\n- security: none\n\n## Stale refs\n\n- spec:auth\n\n## Actions\n\n1. A.\n2. B.\n";
		expect(parsePlan(plan)).toEqual({
			axes: [
				["data", "high"],
				["security", "none"],
			],
			stale: ["spec:auth"],
			actions: ["A.", "B."],
			lines: [
				{ text: "A.", done: false, owner: "" },
				{ text: "B.", done: false, owner: "" },
			],
		});
	});

	it("parses a check box line with its owner, and keeps a numbered line open (REQ-009)", () => {
		const plan =
			"## Actions\n\n- [x] Update the guide. (owner: Grace Hopper)\n- [ ] Tell the team.\n3. Old line.\n";
		expect(parsePlan(plan).lines).toEqual([
			{ text: "Update the guide.", done: true, owner: "Grace Hopper" },
			{ text: "Tell the team.", done: false, owner: "" },
			{ text: "Old line.", done: false, owner: "" },
		]);
	});

	it("checks a line and picks its owner: the plan file holds both, and no ticket is made", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/impacts/report");
		const plan = await screen.findByRole("region", { name: "Action plan" });
		const tickets = mockState().sync.mirror.length;
		await user.click(within(plan).getByRole("checkbox", { name: "Done: Update the guide." }));
		const file = ".shipyard/impacts/2026-10-28-main.plan.md";
		await waitFor(() => expect(mockState().prs?.texts[file]).toContain("- [x] Update the guide."));
		await user.click(within(plan).getByRole("combobox", { name: "Owner of this line" }));
		await user.click(await screen.findByRole("option", { name: "Grace Hopper" }));
		await waitFor(() =>
			expect(mockState().prs?.texts[file]).toContain(
				"- [x] Update the guide. (owner: Grace Hopper)",
			),
		);
		// Add a line ends the list.
		await user.click(within(plan).getByRole("button", { name: "Add a line" }));
		await user.type(within(plan).getByRole("textbox", { name: "Action" }), "Tell the team.");
		await user.click(within(plan).getByRole("button", { name: "Add" }));
		await waitFor(() =>
			expect(mockState().prs?.texts[file]).toMatch(/Grace Hopper\)\n- \[ \] Tell the team\./),
		);
		expect(mockState().sync.mirror).toHaveLength(tickets);
		await idle(router);
	});

	it("shows what the working branch touches, with the way back to Flow and the full report", async () => {
		const user = userEvent.setup();
		await open();
		await unwrap(commands.filesCreateFile("docs/openspec/x/spec.md", true));
		const router = mountApp("/flow/impacts");
		expect(await screen.findByRole("heading", { name: "What this change touches" })).toBeVisible();
		expect(within(screen.getByRole("main")).getByRole("link", { name: "Flow" })).toHaveAttribute(
			"href",
			"/flow/flow",
		);
		expect(screen.getByText("Compare")).toBeVisible();
		// The base is a select with a chevron (screen 50); the left side is plain text.
		expect(screen.getByText("My changes")).toBeVisible();
		expect(screen.getByRole("combobox", { name: "Compare with" })).toBeVisible();
		expect(await screen.findByText("1 doc goes stale with this change")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Files changed" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Code that depends on them" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Specs and docs that go stale" })).toBeVisible();
		expect(screen.getByRole("link", { name: "Full impact report" })).toHaveAttribute(
			"href",
			"/flow/impacts/report",
		);
		await user.click(screen.getByRole("button", { name: "Show the doc" }));
		expect(await screen.findByRole("heading", { name: "Docs chain (1)" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Fix the stale docs with an agent" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Fix the stale docs with an agent" }));
		expect(await screen.findByRole("link", { name: "Open the runs" })).toBeVisible();
		await idle(router);
	});

	it("runs Analyze from the impacts page and keeps the stale refs in the third column", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/impacts");
		await pick(user, "Analyze");
		const column = await screen.findByRole("region", { name: "Specs and docs that go stale" });
		expect(await within(column).findByText("spec:auth")).toBeVisible();
		await idle(router);
	});

	it("shows the impacts of a feature, with the way back to its Checks and to its report", async () => {
		const user = userEvent.setup();
		await open();
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [feature] });
		const router = mountApp("/flow/feature/change%3Ax/impacts");
		expect(await screen.findByRole("heading", { name: "Refuse an empty token" })).toBeVisible();
		expect(screen.getByRole("link", { name: "Checks" })).toBeVisible();
		await user.click(screen.getByRole("link", { name: "Full impact report" }));
		expect(await screen.findByRole("link", { name: "What this change touches" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Refuse an empty token" })).toBeVisible();
		await idle(router);
	});

	it("lists the files of the pull request of a feature, not the local changes", async () => {
		await open();
		await unwrap(commands.pullsList());
		const path = (await unwrap(commands.codePullDetail(141))).files[0]?.path ?? "";
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [{ ...feature, pr: "pr:github:141" }],
		});
		const router = mountApp("/flow/feature/change%3Ax/impacts");
		const column = await screen.findByRole("region", { name: "Files changed" });
		expect(await within(column).findByText(path)).toBeVisible();
		await idle(router);
	});

	it("opens the impacts of a change from its Checks, analyzes, counts the past reports and goes back to Checks", async () => {
		const user = userEvent.setup();
		await open();
		vi.spyOn(commands, "featuresList").mockResolvedValue({ status: "ok", data: [feature] });
		const router = mountApp("/flow/feature/change%3Ax?section=checks");
		const panel = await screen.findByRole("tabpanel", { name: "Checks" });
		await user.click(await within(panel).findByRole("button", { name: "Impacts on other code" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/flow/feature/change%3Ax/impacts"),
		);
		// Analyze adds a report to the past reports of the full report.
		await pick(user, "Analyze");
		await user.click(await screen.findByRole("link", { name: "Full impact report" }));
		await user.click(await screen.findByRole("button", { name: "Past reports" }));
		expect(await screen.findByRole("heading", { name: "Past reports (2)" })).toBeVisible();
		// The back links lead to the impacts, then to the Checks section.
		await user.click(screen.getByRole("link", { name: "What this change touches" }));
		await user.click(await screen.findByRole("link", { name: "Checks" }));
		expect(
			await within(await screen.findByRole("tabpanel", { name: "Checks" })).findByRole("button", {
				name: "Impacts on other code",
			}),
		).toBeVisible();
		await idle(router);
	});

	it("keeps the old report: the past reports, the sizes, the plan, the seven axes and the digest", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/impacts/report");
		await user.click(await screen.findByRole("button", { name: "Past reports" }));
		expect(await screen.findByRole("heading", { name: "Past reports (1)" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: /2026-10-28/ }));
		await pick(user, "Details");
		expect(await screen.findByRole("heading", { name: "Axes (7)" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Out-of-date links (0)" })).toBeVisible();
		for (const size of ["Code", "Specs", "Docs", "Tests", "People"])
			expect(screen.getByRole("heading", { name: size })).toBeVisible();
		expect(await screen.findByText(/The release date holds/)).toBeVisible();
		await idle(router);
	});

	it("writes the report again, rates the contracts axis and copies the brief", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		await open();
		const router = mountApp("/flow/impacts/report");
		await user.click(await screen.findByRole("button", { name: "Write the report again" }));
		await pick(user, "Details");
		const axes = await screen.findByRole("region", { name: "Axes" });
		expect(within(axes).getByRole("img", { name: "high" })).toBeVisible();
		expect(screen.getByText("spec:auth")).toBeVisible();
		const plan = screen.getByRole("region", { name: "Action plan" });
		expect(within(plan).getAllByRole("listitem")).toHaveLength(2);
		await waitFor(() => expect(screen.getByText(/moves the release/)).toBeVisible());
		await user.click(screen.getByRole("button", { name: "Copy the brief" }));
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("moves the release"));
		await idle(router);
	});

	it("watches the docs chain on the report: a spec moved, its test plans did not, then they follow", async () => {
		const user = userEvent.setup();
		await open();
		await unwrap(commands.filesCreateFile("docs/openspec/x/spec.md", true));
		const router = mountApp("/flow/impacts/report");
		await pick(user, "Details");
		expect(await screen.findByRole("heading", { name: "Docs chain (1)" })).toBeVisible();
		expect(screen.getByText("Behind Specs: 1 changed files")).toBeVisible();
		expect(screen.getByRole("button", { name: /^Update with an agent/ })).toBeVisible();
		await unwrap(commands.filesCreateFile("docs/delivery/test-plans/a.md", true));
		await user.click(screen.getByRole("button", { name: "Write the report again" }));
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: "Docs chain (0)" })).toBeVisible(),
		);
		await idle(router);
	});

	it("lists the profiles of the assignments on the report and copies the brief of one", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		await open();
		const router = mountApp("/flow/impacts/report");
		await pick(user, "Details");
		const group = await screen.findByRole("region", { name: "Assignments" });
		expect(within(group).getByText("3 d")).toBeVisible();
		await user.click(
			within(group).getByRole("button", { name: "Copy brief of Backend developer" }),
		);
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# Backend developer"));
		await idle(router);
	});
});
