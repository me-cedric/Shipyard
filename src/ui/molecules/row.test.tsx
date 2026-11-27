import { render, screen } from "@testing-library/react";
import { Row } from "./row";

const sources = import.meta.glob("/src/**/*.{ts,tsx}", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

describe("Row width", () => {
	it("is the card width minus the inset for a div, a button and a link, and a caller w-full cannot widen it", () => {
		render(
			<>
				<Row className="w-full">div</Row>
				<Row render={(p) => <button type="button" {...p} />}>button</Row>
				<Row className="w-full" render={(p) => <a href="/x" {...p} />}>
					link
				</Row>
			</>,
		);
		for (const name of ["div", "button", "link"]) {
			const cls = screen.getByText(name).className.split(" ");
			expect(cls).toContain("w-[calc(100%-1rem)]");
			expect(cls).toContain("max-w-[calc(100%-1rem)]");
			expect(cls).not.toContain("w-full");
		}
	});
});

describe("Rule: no class string holds the row inset mx-2 together with w-full", () => {
	it("finds none in src", () => {
		const bad = Object.entries(sources)
			.filter(([file]) => !file.includes(".test."))
			.flatMap(([file, code]) =>
				[...code.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)]
					.filter(
						([, , s]) => /(^|\s)mx-2(\s|$)/.test(s ?? "") && /(^|\s)w-full(\s|$)/.test(s ?? ""),
					)
					.map(() => file),
			);
		expect(bad).toEqual([]);
	});
});

describe("Rule: a caller of Row adds no w-full to the class that Row gives", () => {
	it("finds none in src", () => {
		const bad = Object.entries(sources)
			.filter(([file]) => !file.includes(".test."))
			.filter(([, code]) => /\b(p|r|props)\.className[^\n]*\bw-full\b/.test(code))
			.map(([file]) => file);
		expect(bad).toEqual([]);
	});
});
