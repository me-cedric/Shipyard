import { noticeTarget } from "@/lib/notifications/targets";
import { latestPerTicket, timesheetDue } from "./index";

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

describe("noticeTarget", () => {
	it("sends a plan review to the plan block of the run", () => {
		expect(noticeTarget({ source: "plan", run: "R1" })).toEqual({ ref: "run:R1", anchor: "plan" });
	});
});
