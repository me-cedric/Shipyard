import { dbml, languageFor, likec4, markdown, mermaid } from "./syntax";

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
		expect(languageFor("logo.png")).toBeNull();
		expect(languageFor(undefined)).toBeNull();
	});
});

describe("mermaid", () => {
	it("colours keywords, arrows, the start state, strings and comments", () => {
		expect(mermaid('  Queued --> Claimed: Claim "x" %% note')).toEqual([
			["  ", null],
			["Queued", null],
			[" ", null],
			["-->", "step"],
			[" ", null],
			["Claimed", null],
			[":", null],
			[" ", null],
			["Claim", null],
			[" ", null],
			['"x"', "string"],
			[" ", null],
			["%% note", "comment"],
		]);
		expect(mermaid("stateDiagram-v2")).toEqual([["stateDiagram-v2", "keyword"]]);
		expect(mermaid("A-->B").map(([t]) => t)).toEqual(["A", "-->", "B"]);
		expect(mermaid("[*] --> Queued")[0]).toEqual(["[*]", "tag"]);
		expect(languageFor("docs/diagrams/run.mmd")).toBe(mermaid);
	});
});

describe("markdown", () => {
	it("colours headings, list markers, inline code, links and refs", () => {
		expect(markdown("## Goal")).toEqual([["## Goal", "keyword"]]);
		expect(markdown("> note")).toEqual([["> note", "comment"]]);
		expect(markdown("- [x] Use `pnpm` see [guide](a.md) and spec:factory#REQ-1")).toEqual([
			["", null],
			["- [x] ", "step"],
			["Use ", null],
			["`pnpm`", "string"],
			[" see ", null],
			["[guide](a.md)", "ref"],
			[" and ", null],
			["spec:factory#REQ-1", "ref"],
		]);
		expect(languageFor("docs/guide/start.md")).toBe(markdown);
	});
});
