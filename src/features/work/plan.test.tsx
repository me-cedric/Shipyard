import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const aside = async (name: string) => within(await screen.findByRole("complementary", { name }));
const bars = () =>
	screen.findAllByRole("button", { name: /, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/ });
const bar = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

describe("Work / Plan", () => {
	it("draws a bar for each task of the sheet, with the today marker", async () => {
		await withTracker();
		mountApp("/work/plan");
		expect(await bars()).toHaveLength(6);
		expect(screen.getByRole("img", { name: "Today 2026-11-02" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Authentication (4)" })).toBeInTheDocument();
		expect(bar("Token API")).toHaveAccessibleName(/Ada Lovelace/);
	});

	it("moves a bar with the keyboard and stores the start decision only", async () => {
		await withTracker();
		mountApp("/work/plan");
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
		mountApp("/work/plan");
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
		mountApp("/work/plan");
		await bars();
		const plan = JSON.stringify(mockState().work.decisions);
		await user.click(screen.getByRole("button", { name: "Calendar" }));
		const panel = await aside("Calendar");
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

	it("has one primary action and is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/work/plan");
		expect(await screen.findByRole("button", { name: "Appliquer" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Calendrier" })).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Aujourd'hui 2026-11-02" })).toBeInTheDocument();
	});
});
