import { capabilityOf, lastLine, openItems, planRef } from "./index";

describe("specs rules", () => {
	it("names the ref of a plan, a capability and an answer", () => {
		expect(planRef("docs/delivery/test-plans/Auth Login.feature")).toBe("test:auth-login");
		expect(capabilityOf("spec:auth#REQ-001")).toBe("auth");
		expect(capabilityOf("q:Q-1")).toBe("");
		expect(lastLine("\nWhy?\n\nUse Jira.\n\n")).toBe("Use Jira.");
	});

	it("reads the open items of an archive refusal", () => {
		expect(openItems("open items: A-1 One; A-2 Two")).toEqual(["A-1 One", "A-2 Two"]);
		expect(openItems("no change x")).toBeNull();
	});
});
