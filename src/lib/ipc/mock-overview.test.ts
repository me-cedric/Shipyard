import { describe, expect, it } from "vitest";
import { cards, chainGate } from "./mock-overview";

describe("mock overview", () => {
	it("warns when a spec moves and its test plan does not", () => {
		expect(chainGate(["docs/openspec/x/spec.md"])).toHaveLength(1);
		expect(chainGate(["docs/openspec/x/spec.md", "docs/delivery/test-plans/a.md"])).toEqual([]);
		expect(chainGate(["src/a.ts"])).toEqual([]);
	});
	it("gives one card for each project", () => {
		const p = { id: "a", name: "A", path: "/a", state: "changed" } as never;
		expect(cards([p])[0]).toMatchObject({ id: "a", changes: 3, host: "example.com" });
	});
});
