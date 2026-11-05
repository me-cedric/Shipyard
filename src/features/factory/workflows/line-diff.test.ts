import { describe, expect, it } from "vitest";
import { parseDiff } from "@/ui/molecules/diff-view";
import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
	it("marks a changed line, an added line and a removed line", () => {
		expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toBe("@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d");
		expect(lineDiff("a\nb", "a")).toBe("@@ -1,2 +1,1 @@\n a\n-b");
	});

	it("shows a new file as added lines only", () => {
		expect(lineDiff("", "x\ny")).toBe("@@ -0,0 +1,2 @@\n+x\n+y");
	});

	it("reads back through the diff view", () => {
		const kinds = parseDiff(lineDiff("a\nb", "a\nc")).map((l) => l.kind);
		expect(kinds).toEqual(["hunk", "ctx", "del", "add"]);
	});
});
