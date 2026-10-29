import { errorLine, toEditorError } from "./error-line";

describe("errorLine", () => {
	it("finds the line in the common forms", () => {
		expect(errorLine("Parse error on line 3:\n...")).toBe(3);
		expect(errorLine("Expected table name (line 12)")).toBe(12);
		expect(errorLine("a.c4:7:2 bad token")).toBe(7);
		expect(errorLine("YAMLParseError at line 5, column 1")).toBe(5);
	});
	it("returns null when there is none", () => {
		expect(errorLine("boom")).toBeNull();
	});
	it("prefers a given line", () => {
		expect(toEditorError(new Error("line 2"), 9)).toEqual({ message: "line 2", line: 9 });
		expect(toEditorError("x line 2")).toEqual({ message: "x line 2", line: 2 });
	});
});
