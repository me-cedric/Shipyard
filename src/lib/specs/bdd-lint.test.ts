import { lintGherkin } from "./bdd-lint";

describe("lintGherkin", () => {
	it("passes a scenario with When and Then", () => {
		const text = "Feature: x\n  Scenario: ok\n    Given a\n    When b\n    Then c\n    And d\n";
		expect(lintGherkin(text)).toEqual([]);
	});

	it("flags an empty scenario, a missing When, a missing Then and a duplicate title", () => {
		const text = [
			"Feature: x",
			"  Scenario: empty",
			"  Scenario: no when",
			"    Given a",
			"    Then c",
			"  Scenario: no then",
			"    When b",
			"    And c",
			"  Scenario: same",
			"    When b",
			"    Then c",
			"  Scenario: same",
			"    When b",
			"    Then c",
		].join("\n");
		expect(lintGherkin(text).map((f) => [f.line, f.rule])).toEqual([
			[2, "empty"],
			[3, "noWhen"],
			[6, "noThen"],
			[9, "dup"],
			[12, "dup"],
		]);
	});

	it("ignores comments and doc strings", () => {
		const text = 'Scenario: a\n  When b\n  """\n  Then no\n  """\n  # Then c\n';
		expect(lintGherkin(text).map((f) => f.rule)).toEqual(["noThen"]);
	});
});
