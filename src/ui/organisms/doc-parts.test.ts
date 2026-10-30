import { field, joinBody, sections, setField, setSection, trimBody } from "./doc-parts";

const ADR =
	"---\nstatus: proposed\ndate: 2026-10-30\ndecision-makers: [Ann]\nx-custom: keep\n---\n# Title\n## Context and problem statement\n\nWhy.\n\n## Considered options\n\n```md\n## not a heading\n```\n## Decision outcome\n\n### Consequences\n";

describe("doc form parts", () => {
	it("reads the fields and the sections, and skips a heading in fenced code", () => {
		expect(field(ADR, "title")?.value).toBe("Title");
		expect(field(ADR, "status")?.value).toBe("proposed");
		expect(field(ADR, "people")?.value).toBe("[Ann]");
		expect(sections(ADR).map((s) => s.heading)).toEqual([
			"Context and problem statement",
			"Considered options",
			"Decision outcome",
		]);
	});

	it("gives the text back byte for byte when a part keeps its value", () => {
		expect(setSection(ADR, 1, sections(ADR)[1]?.body ?? "")).toBe(ADR);
		expect(setField(ADR, "status", "proposed")).toBe(ADR);
		const empty = "# T\n## A\n## B";
		expect(setSection(empty, 1, "")).toBe(empty);
	});

	it("changes only its own bytes and keeps the unknown parts", () => {
		const s = setField(ADR, "status", "accepted");
		expect(s).toBe(ADR.replace("status: proposed", "status: accepted"));
		const body = sections(ADR)[0]?.body ?? "";
		const t = setSection(ADR, 0, joinBody(trimBody(body), "Why not."));
		expect(t).toBe(ADR.replace("\nWhy.\n", "\nWhy not.\n"));
		expect(t).toContain("x-custom: keep");
	});

	it("gives an empty section a line end, so the next heading stays on its own line", () => {
		const text = "# T\n## A\n\n## B\n";
		const body = sections(text)[0]?.body ?? "";
		expect(setSection(text, 0, joinBody(trimBody(body), "Text"))).toBe("# T\n## A\n\nText\n## B\n");
	});

	it("reads and writes a CRLF document and keeps its bytes", () => {
		const crlf = ADR.replace(/\n/g, "\r\n");
		expect(field(crlf, "title")?.value).toBe("Title");
		expect(field(crlf, "status")?.value).toBe("proposed");
		expect(field(crlf, "people")?.value).toBe("[Ann]");
		expect(sections(crlf).map((s) => s.heading)).toEqual([
			"Context and problem statement",
			"Considered options",
			"Decision outcome",
		]);
		expect(setField(crlf, "status", "proposed")).toBe(crlf);
		expect(setField(crlf, "status", "accepted")).toBe(
			crlf.replace("status: proposed", "status: accepted"),
		);
		const body = sections(crlf)[0]?.body ?? "";
		expect(setSection(crlf, 0, joinBody(trimBody(body), trimBody(body).core))).toBe(crlf);
		expect(trimBody("\r\nWhy.\r\n").core).toBe("Why.");
	});

	it("finds the status and owner lines of a spec", () => {
		const spec = "# Spec: code\n\n## Purpose\n\nStatus: Draft\nOwner: Ann\n";
		expect(setField(spec, "status", "Approved")).toContain("Status: Approved\n");
		expect(field(spec, "people")?.value).toBe("Ann");
	});
});
