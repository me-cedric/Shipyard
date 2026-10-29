import {
	addDays,
	addMonths,
	diffDays,
	formatMinutes,
	isoWeekday,
	parseDuration,
	slugify,
} from "./dates";

describe("dates", () => {
	it("adds days across a month and finds the weekday", () => {
		expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
		expect(diffDays("2026-11-02", "2026-11-09")).toBe(7);
		expect(isoWeekday("2026-11-02")).toBe(1);
		expect(isoWeekday("2026-11-08")).toBe(7);
		expect(addMonths("2026-12", 1)).toBe("2027-01");
		expect(addMonths("2026-01", -1)).toBe("2025-12");
	});

	it("reads and writes durations", () => {
		expect(parseDuration("90")).toBe(90);
		expect(parseDuration("2h")).toBe(120);
		expect(parseDuration("1h30")).toBe(90);
		expect(parseDuration("1,5h")).toBe(90);
		expect(parseDuration("soon")).toBeNull();
		expect(formatMinutes(150)).toBe("2h30");
		expect(formatMinutes(45)).toBe("45m");
		expect(formatMinutes(120)).toBe("2h");
	});

	it("makes a slug", () => {
		expect(slugify("Lot n°1 — Été")).toBe("lot-n-1-ete");
	});
});
