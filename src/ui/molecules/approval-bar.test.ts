import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { approvalSentence } from "./approval-bar";

const home = en.home;
const base = { kind: "transition", key: "ACME-2", title: "t" };

describe("approvalSentence", () => {
	it("names the status of a status change", () => {
		expect(approvalSentence(home, { ...base, force: false, detail: "In Progress" })).toBe(
			"Move ACME-2 to In Progress",
		);
	});

	it("falls back to the translated sentence without a status", () => {
		expect(approvalSentence(home, { ...base, force: false })).toBe("Change the status of ACME-2");
	});

	it("ignores the status of a force push", () => {
		expect(approvalSentence(home, { ...base, force: true, detail: "x" })).not.toContain("x");
	});
});
