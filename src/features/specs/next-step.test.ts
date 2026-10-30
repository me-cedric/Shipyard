import { nextStep } from "./next-step";

describe("the next step along the loop", () => {
	it("gives one step for each kind and state", () => {
		expect(nextStep("adr:0004", {})).toBe("plan");
		expect(nextStep("q:Q-001", {})).toBe("plan");
		expect(nextStep("spec:auth", { plan: null })).toBe("plan");
		expect(nextStep("adr:0004", { plan: { id: "x" } as never })).toBe("split");
		expect(nextStep("change:add-auth", {})).toBe("split");
		expect(nextStep("wi:PROJ-1", { assigned: false })).toBe("assign");
		expect(nextStep("wi:PROJ-1", { assigned: true })).toBe("start");
		expect(nextStep("run:01J0000000000000000000000A", { run: "WaitingForAnswer" })).toBe("answer");
		expect(nextStep("run:01J0000000000000000000000A", { run: "PROpen" })).toBe("review");
		expect(nextStep("run:01J0000000000000000000000A", { run: "Done" })).toBeNull();
		expect(nextStep("pr:github:1", { pr: { state: "open", draft: false } })).toBe("merge");
		expect(nextStep("pr:github:1", { pr: { state: "open", draft: true } })).toBeNull();
		expect(nextStep("test:auth-login", {})).toBeNull();
	});
});
