import { noticeTarget } from "@/lib/notifications/targets";
import { historyRuns, latestPerTicket, timesheetDue } from "./index";

describe("timesheetDue", () => {
	const thursday = new Date(2026, 9, 29, 10);
	it("is due on Thursday without time logged that day", () => {
		expect(timesheetDue(thursday, ["2026-10-28"])).toBe(true);
	});
	it("is not due when that day has time", () => {
		expect(timesheetDue(thursday, ["2026-10-29"])).toBe(false);
	});
	it("is not due on another day", () => {
		expect(timesheetDue(new Date(2026, 9, 30, 10), [])).toBe(false);
	});
});

describe("latestPerTicket", () => {
	it("drops a run that a newer run of the same ticket replaces", () => {
		const r = (id: string, key: string, project = "p") => ({ id, key, project });
		const runs = [r("01", "A-1"), r("02", "A-1"), r("01", "A-2"), r("01", "A-1", "q")];
		expect(latestPerTicket(runs)).toEqual([r("02", "A-1"), r("01", "A-2"), r("01", "A-1", "q")]);
	});
});

describe("historyRuns", () => {
	const r = (id: string, key: string, state: string, last: number | null = null) => ({
		id,
		key,
		state,
		project: "p",
		steps: [{ units: [{ last }] }],
	});
	it("lists the older run of a ticket and each ended run", () => {
		const runs = [
			r("01", "A-1", "Failed"),
			r("02", "A-1", "Working"),
			r("01", "A-2", "Working"),
			r("03", "A-3", "Done"),
		];
		expect(historyRuns(runs).map((x) => x.id)).toEqual(["03", "01"]);
		expect(historyRuns(runs).map((x) => x.key)).toEqual(["A-3", "A-1"]);
	});
	it("sorts by end time, newest first, and puts a run with no end time after them", () => {
		const runs = [
			r("01", "A-1", "Done", 100),
			r("02", "A-2", "Done", 300),
			r("03", "A-3", "Done"),
			r("04", "A-4", "Done", 200),
			r("05", "A-5", "Failed"),
		];
		expect(historyRuns(runs).map((x) => x.id)).toEqual(["02", "04", "01", "05", "03"]);
	});
});

describe("noticeTarget", () => {
	it("sends a plan review to the plan block of the run", () => {
		expect(noticeTarget({ source: "plan", run: "R1" })).toEqual({ ref: "run:R1", anchor: "plan" });
	});
});
