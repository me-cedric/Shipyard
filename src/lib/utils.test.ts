import { cn, formatDuration } from "./utils";

describe("cn", () => {
	it("keeps the text colour beside a type size of the tokens", () => {
		expect(cn("text-n-12", "text-17")).toBe("text-n-12 text-17");
		expect(cn("text-primary-fg text-ui")).toBe("text-primary-fg text-ui");
		expect(cn("text-accent", "text-44", "text-11")).toBe("text-accent text-11");
	});

	it("keeps the last height and the last radius of the tokens", () => {
		expect(cn("min-h-control", "min-h-13")).toBe("min-h-13");
		expect(cn("rounded-md", "rounded-field")).toBe("rounded-field");
	});
});

describe("formatDuration", () => {
	it("reads in ms, s, then min and s", () => {
		expect(formatDuration(850)).toBe("850 ms");
		expect(formatDuration(12_400)).toBe("12.4 s");
		expect(formatDuration(75_471)).toBe("1 min 15 s");
		expect(formatDuration(120_000)).toBe("2 min 0 s");
		expect(formatDuration(12_400, "fr")).toBe("12,4 s");
	});
});
