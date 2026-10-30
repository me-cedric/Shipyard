import type { QualityReport } from "@/lib/code";
import { securityScore } from "./security-score";

const report = (...severity: string[]): QualityReport => ({
	kind: "scanner",
	name: "x",
	at: "2026-10-30T10:00:00Z",
	passed: severity.length === 0,
	durationMs: 1,
	tail: "",
	findings: severity.map((s) => ({ severity: s, path: "a", line: null, message: "m" })) as never,
});

describe("securityScore", () => {
	it("has no score before a scan and 100 for a clean scan", () => {
		expect(securityScore([null, null])).toBeNull();
		expect(securityScore([report()])).toBe(100);
	});
	it("takes a penalty for each finding and stops at 0", () => {
		expect(securityScore([report("critical"), report("high", "medium", "low")])).toBe(60);
		expect(securityScore([report("critical", "critical", "critical", "critical", "low")])).toBe(0);
	});
});
