import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { weekStart } from "@/features/work/week-focus";
import { errorMessages } from "@/lib/i18n/errors";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { addDays } from "@/lib/work";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const aside = async (name: string) => within(await screen.findByRole("complementary", { name }));
const bars = () =>
	screen.findAllByRole("button", { name: /, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/ });
// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- test input is a fixed name
const bar = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

describe("Plan / Timeline and People", () => {
	it("draws a bar for each task of the sheet, with the today marker", async () => {
		await withTracker();
		mountApp("/plan/timeline");
		expect(await bars()).toHaveLength(6);
		expect(screen.getByRole("img", { name: "Today 2026-11-02" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Authentication (4)" })).toBeInTheDocument();
		expect(bar("Token API")).toHaveAccessibleName(/Ada Lovelace/);
	});

	it("moves a bar with the keyboard and stores the start decision only", async () => {
		await withTracker();
		mountApp("/plan/timeline");
		await bars();
		const before = (await unwrap(commands.planGet("mvp-1"))).gantt.bars.find(
			(b) => b.task === "est:mvp-1#auth-api",
		);
		fireEvent.keyDown(bar("Token API"), { key: "ArrowRight" });
		await waitFor(() =>
			expect(mockState().work.decisions.tasks["est:mvp-1#auth-api"]).toBeDefined(),
		);
		const decision = mockState().work.decisions.tasks["est:mvp-1#auth-api"];
		// The decision holds a fixed start and nothing computed: no end, no days, no member.
		expect(Object.keys(decision ?? {})).toEqual(["start"]);
		expect(decision?.start).toBe("2026-11-03");
		expect(before?.start).toBe("2026-11-02");
		await waitFor(() => expect(bar("Token API")).toHaveAccessibleName(/2026-11-03 to /));
		// Shift moves a week.
		fireEvent.keyDown(bar("Token API"), { key: "ArrowLeft", shiftKey: true });
		await waitFor(() =>
			expect(mockState().work.decisions.tasks["est:mvp-1#auth-api"]?.start).toBe("2026-10-27"),
		);
	});

	it("chooses a member in the inspector", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/plan/timeline");
		await bars();
		// The seed fixes a start and names a member for this task.
		await user.click(bar("Login form"));
		const panel = await aside("Login form");
		await user.click(panel.getByRole("combobox", { name: "Member" }));
		await user.click(await screen.findByRole("option", { name: "Ada Lovelace" }));
		await waitFor(() =>
			expect(mockState().work.decisions.tasks["est:mvp-1#auth-web"]).toEqual({
				member: "ada",
				start: "2026-11-09",
			}),
		);
	});

	it("stores a holiday in the calendar and no date in the plan", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/plan/timeline");
		await bars();
		const plan = JSON.stringify(mockState().work.decisions);
		await user.click(screen.getByRole("button", { name: "Dates and days off" }));
		const panel = await aside("Dates and days off");
		expect(panel.getByRole("heading", { name: "Holidays (1)" })).toBeInTheDocument();
		fireEvent.change(panel.getByLabelText("Holiday"), { target: { value: "2026-11-04" } });
		await user.click(panel.getByRole("button", { name: "Add holiday" }));
		await waitFor(() =>
			expect(mockState().work.calendar.holidays).toEqual(["2026-11-04", "2026-11-11"]),
		);
		expect(JSON.stringify(mockState().work.decisions)).toBe(plan);
		// No task works on the holiday.
		const gantt = await unwrap(commands.planGet("mvp-1"));
		expect(gantt.gantt.bars.every((b) => b.start !== "2026-11-04")).toBe(true);
	});

	it("moves the dates when the team changes and changes no plan file", async () => {
		await withTracker();
		const plan = JSON.stringify(mockState().work.decisions);
		const before = (await unwrap(commands.planGet("mvp-1"))).gantt.bars.map((b) => b.end);
		const team = await unwrap(commands.workTeam());
		await unwrap(
			commands.workTeamSave({
				members: team.team.members.map((m) => (m.handle === "ada" ? { ...m, capacity: 2 } : m)),
			}),
		);
		const after = (await unwrap(commands.planGet("mvp-1"))).gantt.bars.map((b) => b.end);
		expect(after).not.toEqual(before);
		expect(JSON.stringify(mockState().work.decisions)).toBe(plan);
	});

	it("zooms, and People groups the tasks by member and shows the load and the warnings", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/timeline");
		await bars();
		const plan = await unwrap(commands.planGet("mvp-1"));
		const over = plan.load.members.filter((m) =>
			m.days.some((d) => (d.used ?? 0) > (d.capacity ?? 0)),
		);
		// Two lots book the same people on the same days.
		expect(over.length).toBeGreaterThan(0);
		await user.click(screen.getByRole("tab", { name: "Month" }));
		expect(screen.getByRole("tab", { name: "Month" })).toHaveAttribute("aria-selected", "true");
		expect(await bars()).toHaveLength(6);
		// The view by person is the section People: the load and the warning of each person are there.
		await router.navigate({ to: "/plan/people" });
		expect(
			await screen.findByRole("heading", { name: /^Ada Lovelace \(\d+\)$/ }),
		).toBeInTheDocument();
		expect(screen.getAllByText(/is over capacity on \d+ days/)).toHaveLength(over.length);
		// The load against the capacity: one total for each person, and one for each of their weeks.
		const weeks = plan.load.members.flatMap((m) => [
			...new Set(m.days.map((d) => `${m.handle} ${weekStart(d.day)}`)),
		]);
		expect(screen.getAllByText(/^[\d.]+ of [\d.]+ days$/)).toHaveLength(
			plan.load.members.length + weeks.length,
		);
		const ada = screen.getByRole("heading", { name: /^Ada Lovelace/ }).closest("li") as HTMLElement;
		expect(within(ada).getByText("Week of 11/2/2026").closest("li")).toHaveTextContent(
			"10 of 5 days",
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("links a capacity warning to the member and the week in Crew", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/people");
		const plan = await unwrap(commands.planGet("mvp-1"));
		const who = plan.load.members.find((m) =>
			m.days.some((d) => (d.used ?? 0) > (d.capacity ?? 0) + 1e-6),
		);
		const first = who?.days.find((d) => (d.used ?? 0) > (d.capacity ?? 0) + 1e-6);
		const name = (await unwrap(commands.workTeam())).team.members.find(
			(m) => m.handle === who?.handle,
		)?.name;
		await user.click(
			(
				await screen.findAllByRole("link", {
					name: /is over capacity on \d+ days/,
				})
			)[0] as HTMLElement,
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/crew/crew"));
		// The member opens in Crew, under the name of the member: the capacity is there to change.
		expect(await screen.findByRole("heading", { name: name ?? "" })).toBeInTheDocument();
		await waitFor(() => expect(screen.getByLabelText(/Capacity/)).toBeInTheDocument());
		// The week of the warning is there too: the load of the member on each day of it.
		const week = await screen.findByRole("region", {
			name: `Week of ${weekStart(first?.day ?? "")}`,
		});
		expect(within(week).getByText(new RegExp(`^${first?.day}: `))).toBeInTheDocument();
		for (const li of within(week).getAllByRole("listitem")) {
			const day = li.textContent?.slice(0, 10) ?? "";
			expect(
				day >= weekStart(first?.day ?? "") && day <= addDays(weekStart(first?.day ?? ""), 6),
			).toBe(true);
		}
	});

	it("takes the public holidays of the country of the calendar, France by default", async () => {
		const user = userEvent.setup();
		await withTracker();
		const plan = await unwrap(commands.planGet("mvp-1"));
		expect(plan.publicHolidays).toContain("2026-12-25");
		mountApp("/plan/timeline");
		await bars();
		await user.click(screen.getByRole("button", { name: "Dates and days off" }));
		const panel = await aside("Dates and days off");
		await user.click(panel.getByRole("combobox", { name: "Public holidays" }));
		await user.click(await screen.findByRole("option", { name: "None" }));
		await waitFor(() => expect(mockState().work.calendar.country).toBe(""));
		expect((await unwrap(commands.planGet("mvp-1"))).publicHolidays).toEqual([]);
	});

	it("exports the chart as a PNG image", async () => {
		const user = userEvent.setup();
		const ctx = new Proxy(
			{},
			{ get: (_, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}) },
		);
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
		vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) =>
			done(new Blob([png])),
		);
		await withTracker();
		mountApp("/plan/timeline");
		await bars();
		await user.click(screen.getByRole("button", { name: "Export" }));
		await user.click(await screen.findByRole("menuitem", { name: "Image (PNG)" }));
		await waitFor(() =>
			expect(mockState().reports.exported).toContainEqual({
				kind: "gantt",
				path: "/mock/mvp-1.png",
			}),
		);
		await expect(unwrap(commands.planPngSave("/mock/x.png", [1, 2], true))).rejects.toThrow(
			errorMessages.en.file_unsupported,
		);
		vi.restoreAllMocks();
	});

	it("has one primary action and is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/plan/timeline");
		expect(
			await screen.findByRole("button", { name: "Envoyer à l'outil de suivi" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Dates et jours non travaillés" }),
		).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Aujourd'hui 2026-11-02" })).toBeInTheDocument();
	});

	// spec:app-redesign#REQ-018
	it("says in the title when the release ends", async () => {
		await withTracker();
		mountApp("/plan/timeline");
		await bars();
		const end = (await unwrap(commands.planGet("mvp-1"))).gantt.bars
			.map((b) => b.end)
			.sort()
			.at(-1);
		expect(end).toBe("2026-11-17");
		expect(screen.getByRole("heading", { name: "MVP 1 ends 11/17/2026" })).toBeInTheDocument();
		expect(screen.getByText("Tasks with no owner")).toBeInTheDocument();
	});

	it("shows three people over their capacity as one card with proposals, and applies one", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/timeline");
		await bars();
		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(1);
		const card = within(cards[0] as HTMLElement);
		expect(card.getByRole("heading", { name: "3 people have too much work" })).toBeInTheDocument();
		// The heading order is valid: a level-two heading comes before the level-three heading of the card.
		const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
		expect(levels.slice(0, 3)).toEqual([1, 2, 3]);
		expect(card.getAllByRole("button", { name: /^Apply: / })).toHaveLength(3);
		expect(card.getByRole("button", { name: "Rebalance" })).toBeInTheDocument();
		// Grace Hopper has no room on these days: the task does not go to her, it starts later.
		await user.click(
			card.getByRole("button", { name: "Apply: Export endpoint starts 11/13/2026" }),
		);
		await waitFor(() =>
			expect(mockState().work.decisions.tasks["est:mvp-1#export-api"]).toEqual({
				start: "2026-11-13",
			}),
		);
		// The other decisions stay.
		expect(mockState().work.decisions.tasks["est:mvp-1#auth-web"]).toEqual({
			member: "grace",
			start: "2026-11-09",
		});
		await waitFor(() => expect(bar("Export endpoint")).toHaveAccessibleName(/2026-11-13 to /));
		// Show opens the people.
		await user.click(screen.getByRole("link", { name: "Show" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/plan/people"));
		expect(await screen.findAllByRole("button", { name: /^Apply: / })).not.toHaveLength(0);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

describe("the sheet of Plan", () => {
	it("keeps the chosen sheet from Timeline to People, in the search key sheet", async () => {
		const user = userEvent.setup();
		await withTracker();
		const sheets = (await unwrap(commands.estimateList())).filter((s) => s.state === "ready");
		const other = sheets[1];
		if (!other) throw new Error("the mock needs two ready sheets");
		const router = mountApp("/plan/timeline");
		await bars();
		await user.click(screen.getByRole("combobox", { name: "Sheet" }));
		await user.click(await screen.findByRole("option", { name: other.name ?? other.slug }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ sheet: other.slug }));
		// The section switch links with no search.
		await router.navigate({ to: "/plan/people" });
		expect(await screen.findByRole("combobox", { name: "Sheet" })).toHaveTextContent(
			other.name ?? other.slug,
		);
		// The next test starts on the first sheet again.
		await router.navigate({ to: "/plan/people", search: { sheet: sheets[0]?.slug } as never });
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
