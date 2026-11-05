import { dbml, languageFor, likec4 } from "./syntax";

describe("Design highlighting", () => {
	it("colours LikeC4 keywords, strings, arrows and comments, and keeps the text", () => {
		const line = "  customer -> app 'Uses' // the main flow";
		const out = likec4(line);
		expect(out.map(([t]) => t).join("")).toBe(line);
		expect(out).toContainEqual(["->", "step"]);
		expect(out).toContainEqual(["'Uses'", "string"]);
		expect(out.at(-1)).toEqual(["// the main flow", "comment"]);
		expect(likec4("model {")).toContainEqual(["model", "keyword"]);
	});

	it("colours DBML keywords, settings and references", () => {
		const line = 'Table users { id int [pk, note: "key"] }';
		const out = dbml(line);
		expect(out.map(([t]) => t).join("")).toBe(line);
		expect(out).toContainEqual(["Table", "keyword"]);
		expect(out).toContainEqual(["pk", "keyword"]);
		expect(out).toContainEqual(['"key"', "string"]);
		expect(dbml("Ref: posts.user_id > users.id")).toContainEqual([">", "step"]);
	});
});

describe("languageFor", () => {
	it("maps file paths and fence languages, and leaves other types plain", () => {
		expect(languageFor("src/a.rs")).toBe(languageFor("rust"));
		expect(languageFor("a.feature")).toBe(languageFor("gherkin"));
		expect(languageFor("README.md")).toBeNull();
		expect(languageFor(undefined)).toBeNull();
	});
});
