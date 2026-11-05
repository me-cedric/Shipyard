import { foldWords, snippetParts } from "./query";

describe("search text helpers", () => {
	it("splits a snippet at the marks of the index", () => {
		expect(snippetParts("a \u0002b\u0003 c")).toEqual([
			{ text: "a ", hit: false },
			{ text: "b", hit: true },
			{ text: " c", hit: false },
		]);
		expect(snippetParts("plain")).toEqual([{ text: "plain", hit: false }]);
	});

	it("folds case and accents into words", () => {
		expect(foldWords("La Décision, finale!")).toEqual(["la", "decision", "finale"]);
	});
});
