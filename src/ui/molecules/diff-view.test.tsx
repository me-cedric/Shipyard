import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { DiffView, parseDiff } from "./diff-view";

const PATCH = "@@ -1,1 +1,1 @@\n-let a = 1\n+const a = 2";

describe("DiffView colours", () => {
	it("colours the code of a changed line by the file type", () => {
		renderApp(
			<DiffView text={PATCH} path="src/a.ts" label="Diff" binaryLabel="" truncatedLabel="" />,
		);
		expect(screen.getByText("const")).toHaveClass("text-accent-text");
	});

	it("keeps the text plain without a known type", () => {
		renderApp(<DiffView text={PATCH} path="a.md" label="Diff" binaryLabel="" truncatedLabel="" />);
		expect(screen.queryByText("const")).toBeNull();
		expect(screen.getByText("const a = 2")).toBeInTheDocument();
	});
});

const TWO = "@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -10,2 +10,3 @@\n x\n+y\n z";
const cells = (row: Element) =>
	[...row.querySelectorAll("span[aria-hidden]")].map((s) => s.textContent);

describe("DiffView line numbers", () => {
	it("draws the old and the new number of each line, and no number on a hunk header", () => {
		const { container } = renderApp(
			<DiffView text={TWO} label="Diff" binaryLabel="" truncatedLabel="" />,
		);
		const rows = [...container.querySelectorAll("[data-kind]")];
		expect(rows.map((r) => cells(r).slice(0, 2).join("/"))).toEqual([
			"", // hunk header: it spans the width
			"1/1",
			"2/",
			"/2",
			"",
			"10/10",
			"/11",
			"11/12",
		]);
		expect(rows[0]).toHaveTextContent("@@ -1,2 +1,2 @@");
		expect((rows[1] as HTMLElement).querySelector("span")).toHaveClass(
			"select-none",
			"tabular-nums",
		);
	});

	it("shows the first 2000 lines and a button for the rest", async () => {
		const text = `@@ -0,0 +1,2500 @@\n${Array.from({ length: 2500 }, (_, i) => `+l${i}`).join("\n")}`;
		const { container } = renderApp(
			<DiffView
				text={text}
				label="Diff"
				binaryLabel=""
				truncatedLabel=""
				showAllLabel="Show all {n} lines"
			/>,
		);
		expect(container.querySelectorAll("[data-kind]")).toHaveLength(2000);
		await userEvent.click(screen.getByRole("button", { name: "Show all 2501 lines" }));
		expect(container.querySelectorAll("[data-kind]")).toHaveLength(2501);
	});

	it("draws a gutter control on new-side lines only through the render slot", () => {
		const act = vi.fn();
		const { container } = renderApp(
			<DiffView
				text={TWO}
				path="a.ts"
				label="Diff"
				binaryLabel=""
				truncatedLabel=""
				onLineAction={act}
				gutterAction={({ newLine, act: go }) => (
					<button type="button" onClick={go}>{`+${newLine}`}</button>
				)}
			/>,
		);
		expect(container.querySelectorAll("button")).toHaveLength(5);
		screen.getByRole("button", { name: "+12" }).click();
		expect(act).toHaveBeenCalledWith({ path: "a.ts", newLine: 12 });
	});
});

describe("parseDiff", () => {
	it("keeps a blank context line whose leading space was stripped, so later numbers hold", () => {
		// The hunk says 4 old and 5 new lines: the empty line is context, not noise.
		const lines = parseDiff("@@ -1,4 +1,5 @@\n a\n\n b\n+c\n d\n");
		expect(lines.map((l) => [l.kind, l.text, l.old, l.new])).toEqual([
			["hunk", "@@ -1,4 +1,5 @@", null, null],
			["ctx", "a", 1, 1],
			["ctx", "", 2, 2],
			["ctx", "b", 3, 3],
			["add", "c", null, 4],
			["ctx", "d", 4, 5],
		]);
	});

	it("drops the empty text after the last line of the patch", () => {
		expect(parseDiff("@@ -1,1 +1,1 @@\n a\n")).toHaveLength(2);
	});
});
