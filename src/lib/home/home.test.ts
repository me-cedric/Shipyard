import { timesheetDue } from "./index";

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
