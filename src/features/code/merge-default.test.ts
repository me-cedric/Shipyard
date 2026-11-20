import { defaultMergeMethod, saveMergeMethod } from "./merge-default";

describe("the default method of the Merge button", () => {
	afterEach(() => localStorage.clear());

	it("is the first method of the code host until a method is saved", () => {
		expect(defaultMergeMethod(["merge", "squash"])).toBe("merge");
		expect(defaultMergeMethod([])).toBe("merge");
	});

	it("is the saved method when the code host offers it", () => {
		saveMergeMethod("squash");
		expect(defaultMergeMethod(["merge", "squash", "rebase"])).toBe("squash");
	});

	it("falls back when the code host lacks the saved method", () => {
		saveMergeMethod("rebase");
		expect(defaultMergeMethod(["merge", "squash"])).toBe("merge");
	});

	it("ignores a stored value that is no method", () => {
		localStorage.setItem("shipyard.merge-method", "fast-forward");
		expect(defaultMergeMethod(["squash", "merge"])).toBe("squash");
	});
});
