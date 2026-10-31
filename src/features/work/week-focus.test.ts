import { memberWeek, parseMemberWeek, weekStart } from "./week-focus";

describe("week focus", () => {
	it("finds the Monday of a week, across a month end", () => {
		expect(weekStart("2026-11-02")).toBe("2026-11-02");
		expect(weekStart("2026-11-08")).toBe("2026-11-02");
		expect(weekStart("2026-12-01")).toBe("2026-11-30");
	});
	it("reads back what it wrote, and a plain handle has no week", () => {
		expect(parseMemberWeek(memberWeek("ada", "2026-11-02", "mvp-1"))).toEqual({
			handle: "ada",
			week: "2026-11-02",
			slug: "mvp-1",
		});
		expect(parseMemberWeek(memberWeek("a|b", "2026-11-02", "s"))).toEqual({
			handle: "a|b",
			week: "2026-11-02",
			slug: "s",
		});
		expect(parseMemberWeek("ada")).toEqual({ handle: "ada" });
	});
});
