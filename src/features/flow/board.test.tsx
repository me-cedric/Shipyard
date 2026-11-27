import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { historyRuns } from "@/lib/home";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

/** The exact name of a card: the title, then its key when it has one. */
const exact = (title: string) => new RegExp(`^${title}( ?[A-Z]+-\\d+)?$`);

// Flow / Flow took over the five lanes of Factory / Runs: the board is five stages (app-redesign REQ-010).
const STAGES = [
	["idea", "Idea"],
	["spec", "Spec"],
	["build", "Build"],
	["review", "Review"],
	["ready", "Ready"],
] as const;
const column = async (name: string) => within(await screen.findByRole("region", { name }));
async function renderRuns() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	return mountApp("/factory/runs");
}
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

describe("Flow board, from the demo project (the lanes of Factory / Runs before)", () => {
	// A menu that is open when a test ends leaves `pointer-events: none` on the body.
	afterEach(() => {
		document.body.style.pointerEvents = "";
	});
	it("shows five columns with a count each, from the mock dataset", async () => {
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const features = await unwrap(commands.featuresList());
		let total = 0;
		for (const [stage, name] of STAGES) {
			const n = features.filter((f) => f.stage === stage).length;
			total += n;
			const col = await column(name);
			await waitFor(() =>
				expect(col.getByRole("heading", { level: 2 })).toHaveTextContent(`${name}${n}`),
			);
		}
		expect(total).toBe(features.length);
		expect(all).toHaveLength(14);
	});

	it("has no stat tiles and five columns in an equal grid", async () => {
		await renderRuns();
		await screen.findByRole("region", { name: "Build" });
		expect(screen.queryByText("Live runs")).toBeNull();
		expect(screen.queryByText("Success rate")).toBeNull();
		const columns = screen
			.getAllByRole("region")
			.filter((r) => r.parentElement?.className.includes("grid-cols-5"));
		expect(columns).toHaveLength(5);
	});

	it("shows the state on a card that waits, and the card opens the run at the plan", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const spec = await column("Spec");
		const card = within(
			(await spec.findByRole("heading", { name: exact("Write the onboarding guide") })).closest(
				"article",
			) as HTMLElement,
		);
		expect(card.getByText("Review the plan")).toBeVisible();
		// The whole card is the target: its one button is the title.
		expect(card.queryByRole("button", { name: /^Open/ })).toBeNull();
		await user.click(card.getByRole("button", { name: exact("Write the onboarding guide") }));
		expect(await screen.findByRole("region", { name: "ACME-4" })).toBeVisible();
	});

	it("filters by text and by Needs me, and keeps both in the address", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		await screen.findByRole("region", { name: "Build" });
		await user.click(screen.getByRole("button", { name: "Needs me" }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "needs" }));
		const all = await unwrap(commands.featuresList());
		// A paused run needs a person too (Resume, Add budget): its card is in the filter.
		const paused = all.find((f) => f.runState === "Paused");
		expect(paused).toBeDefined();
		const n = all.filter(
			(f) =>
				f.mark === "needs_you" ||
				f.mark === "blocked" ||
				f.approvals > 0 ||
				f.questions > 0 ||
				f.runState === "Paused" ||
				f.runState === "Failed",
		).length;
		await waitFor(() => expect(document.querySelectorAll("article")).toHaveLength(n));
		expect(document.querySelectorAll("article").length).toBe(
			document.querySelectorAll("li article").length,
		);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Find a feature" }));
		await user.type(await screen.findByRole("searchbox", { name: "Find a feature" }), "ACME-4");
		await waitFor(() => expect(document.querySelectorAll("article")).toHaveLength(1));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "ACME-4" }));
	});

	it("shows three facts on a card, the title, who and the state, and not the workflow or the cost", async () => {
		await renderRuns();
		const build = await column("Build");
		// A paused run needs a person (Resume): its card is an attention card.
		const card = within(
			(await build.findByRole("heading", { name: exact("Cache the project list") })).closest(
				"article",
			) as HTMLElement,
		);
		expect(card.getByText("Cache the project list")).toBeVisible();
		// The step shows its display name, as the run page does (not the raw id `fix`).
		expect(card.getByRole("img", { name: "Fixer" })).toBeVisible();
		expect(card.getByText("Budget reached")).toBeVisible();
		expect(card.queryByText(/^Feature · /)).toBeNull();
		expect(card.queryByText(/\$/)).toBeNull();
	});

	it("keeps a failed run in Build and in History, and its card menu starts the run again and opens it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const failed = await find("ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed.id);
		if (rec) rec.state = "Failed";
		const router = mountApp("/factory/runs");
		const build = await column("Build");
		fireEvent.contextMenu(await build.findByRole("button", { name: /Bump dependencies/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Start run" }));
		expect(await screen.findByRole("region", { name: "ACME-3" })).toBeVisible();
		const mine = (await unwrap(commands.runsList())).filter((r) => r.key === "ACME-3");
		expect(mine).toHaveLength(2);
		const started = mine.find((r) => r.id !== failed.id);
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${started?.id}`));
	});

	it("counts the features of Ready on the board and lists them in Done", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const ready = (await unwrap(commands.featuresList())).filter((f) => f.stage === "ready");
		expect(ready.length).toBeGreaterThan(0);
		mountApp("/factory/runs?view=history");
		// Done is one list: each ended run, and each finished feature.
		const rows = await screen.findByRole("list", { name: "History" });
		for (const f of ready)
			expect(
				(await within(rows).findAllByRole("button", { name: new RegExp(`^${f.title}`) })).length,
			).toBeGreaterThan(0);
		// The exact count: each ended run, then each ready feature that has no run in that list.
		const ended = historyRuns(await unwrap(commands.runsList()));
		const listed = new Set(ended.map((r) => r.reference));
		const extra = ready.filter((f) => !(f.run && listed.has(f.run))).length;
		expect(within(rows).getAllByRole("listitem")).toHaveLength(ended.length + extra);
		expect(screen.queryByRole("list", { name: "Features" })).toBeNull();
	});

	it("shows an empty column when the filter hides every card", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/factory/runs?filter=needs");
		const ready = await column("Ready");
		await waitFor(() =>
			expect(ready.getByRole("heading", { level: 2 })).toHaveTextContent("Ready0"),
		);
		expect(ready.queryAllByRole("listitem")).toHaveLength(0);
	});

	it("moves the focus to the plan after a click on a card that waits for the plan", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const spec = await column("Spec");
		const card = within(
			(await spec.findByRole("heading", { name: exact("Write the onboarding guide") })).closest(
				"article",
			) as HTMLElement,
		);
		await user.click(card.getByRole("button", { name: exact("Write the onboarding guide") }));
		const plan = await screen.findByRole("region", { name: "Plan" });
		await waitFor(() => expect(plan).toHaveFocus());
	});

	it("moves the focus to the answer field of a blocked run and to Send of an approval", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		for (const [key, focused] of [
			["ACME-9", () => document.querySelector("main form input")],
			["ACME-2", () => document.getElementById("decision-send")],
		] as const) {
			const { title } = await find(key);
			const heading = await screen.findByRole("heading", { name: exact(title) });
			await user.click(
				within(heading.closest("article") as HTMLElement).getByRole("button", {
					name: exact(title),
				}),
			);
			await waitFor(() => {
				const el = focused();
				expect(el).not.toBeNull();
				expect(el).toHaveFocus();
			});
			await router.navigate({ to: "/flow/flow" });
		}
	});

	it("shows the reason on Stop and Start run in the card menu for a viewer", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const failed = await find("ACME-3");
		const rec = mockState().factory.runs.find((r) => r.id === failed.id);
		if (rec) rec.state = "Failed";
		mountApp("/factory/runs");
		const reason = "Your role, Viewer, cannot start agents.";
		const build = await column("Build");
		fireEvent.contextMenu(await build.findByRole("button", { name: /Bump dependencies/ }));
		const start = await screen.findByRole("menuitem", { name: "Start run" });
		expect(start).toHaveAttribute("aria-disabled", "true");
		expect(start).toHaveAccessibleDescription(reason);
		fireEvent.keyDown(start, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Start run" })).toBeNull());
		fireEvent.contextMenu(
			await build.findByRole("heading", { name: exact("Add export endpoint") }),
		);
		const stop = await screen.findByRole("menuitem", { name: "Stop run" });
		expect(stop).toHaveAttribute("aria-disabled", "true");
		expect(stop).toHaveAccessibleDescription(reason);
		expect(stop).toHaveAttribute("title", reason);
		fireEvent.keyDown(stop, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Stop run" })).toBeNull());
	});

	it("asks before it stops a run, tells the person that it is in History and leads there", async () => {
		const user = userEvent.setup();
		const router = await renderRuns();
		const build = await column("Build");
		fireEvent.contextMenu(
			await build.findByRole("heading", { name: exact("Add export endpoint") }),
		);
		mockState().confirm = false;
		await user.click(await screen.findByRole("menuitem", { name: "Stop run" }));
		expect((await find("ACME-2")).state).not.toBe("Cancelled");
		mockState().confirm = true;
		fireEvent.contextMenu(
			await build.findByRole("heading", { name: exact("Add export endpoint") }),
		);
		await user.click(await screen.findByRole("menuitem", { name: "Stop run" }));
		const toast = within(await screen.findByRole("status", { name: "Notifications" }));
		// The toast slides in from opacity 0: wait for the end of the slide.
		await waitFor(() => expect(toast.getByText("ACME-2 stopped")).toBeVisible());
		await waitFor(async () => expect((await find("ACME-2")).state).toBe("Cancelled"));
		await user.click(toast.getByRole("button", { name: "History" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/done"));
	});

	it("says Ready to merge on the card of a pull request with passing checks, in Review", async () => {
		await renderRuns();
		const review = await column("Review");
		const card = within(await review.findByRole("button", { name: /ACME-8/ }));
		expect(card.getByText("Ready to merge")).toBeVisible();
	});

	it("moves the focus off the page body after a card stops its run", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const build = await column("Build");
		fireEvent.contextMenu(
			await build.findByRole("heading", { name: exact("Add export endpoint") }),
		);
		await user.click(await screen.findByRole("menuitem", { name: "Stop run" }));
		await waitFor(async () => expect((await find("ACME-2")).state).toBe("Cancelled"));
		await waitFor(() => expect(document.body).not.toBe(document.activeElement));
	});

	it("searches without case or accents", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const ticket = mockState().sync.mirror.find((t) => t.key === "ACME-4");
		if (ticket) ticket.title = "Résumé parser";
		mountApp("/factory/runs");
		await screen.findByRole("region", { name: "Build" });
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Find a feature" }));
		await user.type(await screen.findByRole("searchbox", { name: "Find a feature" }), "resume");
		expect(await screen.findByRole("heading", { name: exact("Résumé parser") })).toBeVisible();
		expect(screen.queryByText("Fix login redirect")).toBeNull();
	});

	it("hides a run that a newer run of its ticket replaces: the feature shows once", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.syncItems({}));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await unwrap(commands.runStart("ACME-3"));
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const features = await unwrap(commands.featuresList());
		expect(features.filter((f) => f.ticket === "wi:ACME-3")).toHaveLength(1);
		expect(all.filter((r) => r.key === "ACME-3")).toHaveLength(2);
		for (const [stage, name] of STAGES) {
			const n = features.filter((f) => f.stage === stage).length;
			const col = await column(name);
			await waitFor(() =>
				expect(col.getByRole("heading", { level: 2 })).toHaveTextContent(`${name}${n}`),
			);
		}
	});
});

describe("Flow load failure", () => {
	afterEach(() => vi.restoreAllMocks());
	it("shows an error line, not only empty columns, when the features do not load", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "error",
			error: { code: "internal", message: "boom" },
		} as never);
		mountApp("/flow/flow");
		expect(await screen.findByRole("alert")).toBeInTheDocument();
	});
});
