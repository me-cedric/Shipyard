import type { Change } from "./index";
import { capabilityOf, kindStatus, lastLine, openItems, planRef } from "./index";

const art = (
	artifact: string,
	status: "missing" | "draft" | "done",
	capability: string | null,
) => ({
	artifact,
	capability,
	path: "x",
	status,
	findings: [],
});
const change = (artifacts: Change["artifacts"]): Change => ({
	id: "c",
	path: "p",
	validated: false,
	artifacts,
});

describe("specs rules", () => {
	it("gives one status for each artifact kind", () => {
		const c = change([
			art("proposal", "done", null),
			art("spec", "done", "a"),
			art("spec", "draft", "b"),
			art("plan", "missing", "a"),
		]);
		expect(kindStatus(c, "proposal")).toBe("done");
		expect(kindStatus(c, "spec")).toBe("draft");
		expect(kindStatus(c, "plan")).toBe("missing");
		// No file of the kind at all.
		expect(kindStatus(c, "tasks")).toBe("missing");
	});

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
