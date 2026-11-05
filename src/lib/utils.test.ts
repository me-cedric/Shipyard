import { formatDuration } from "./utils";

describe("formatDuration", () => {
	it("reads in ms, s, then min and s", () => {
		expect(formatDuration(850)).toBe("850 ms");
		expect(formatDuration(12_400)).toBe("12.4 s");
		expect(formatDuration(75_471)).toBe("1 min 15 s");
		expect(formatDuration(120_000)).toBe("2 min 0 s");
		expect(formatDuration(12_400, "fr")).toBe("12,4 s");
	});
});
