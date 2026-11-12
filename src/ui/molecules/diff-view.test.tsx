import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderApp } from "../test-utils";
import { DiffView, parseDiff } from "./diff-view";

// Counts the draws of the code of a line: a memoised row that does not draw again does not count.
const drawn = vi.hoisted(() => ({ count: 0 }));
vi.mock("./code-editor", async (orig) => {
	const real = await orig<typeof import("./code-editor")>();
	return {
		...real,
		CodeLine: (p: Parameters<typeof real.CodeLine>[0]) => {
			drawn.count++;
			return real.CodeLine(p);
		},
	};
});

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

	it("draws no line button without onLineAction", () => {
		const { container } = renderApp(
			<DiffView
				text={TWO}
				label="Diff"
				binaryLabel=""
				truncatedLabel=""
				lineActionLabel="Add {n}"
			/>,
		);
		expect(container.querySelectorAll("button")).toHaveLength(0);
	});
});

const ADD = "Add a comment on line {n}";
const withAction = (act = vi.fn(), text = TWO) =>
	renderApp(
		<DiffView
			text={text}
			path="a.ts"
			label="Diff"
			binaryLabel=""
			truncatedLabel=""
			lineActionLabel={ADD}
			onLineAction={act}
		/>,
	);

describe("DiffView line button", () => {
	it("shows on added and context lines only, never on a removed line or a hunk header", () => {
		const { container } = withAction();
		// TWO: ctx 1, del, add 2, hunk, ctx 10, add 11, ctx 12.
		const rows = [...container.querySelectorAll("[data-kind]")];
		expect(rows.map((r) => r.querySelectorAll("button").length)).toEqual([0, 1, 0, 1, 0, 1, 1, 1]);
		expect(screen.queryByRole("button", { name: "Add a comment on line 2" })).toBeInTheDocument();
		expect(screen.getAllByRole("button")).toHaveLength(5);
	});

	it("shows on row hover and on keyboard focus, and has a focus ring", () => {
		withAction();
		const button = screen.getByRole("button", { name: "Add a comment on line 1" });
		expect(button).toHaveClass("opacity-0", "group-hover:opacity-100", "focus-visible:opacity-100");
		expect(button).toHaveClass("focus-visible:shadow-glow");
		expect(button.closest("[data-kind]")).toHaveClass("group");
	});

	it("calls onLineAction with the path and the new line", async () => {
		const act = vi.fn();
		withAction(act);
		await userEvent.click(screen.getByRole("button", { name: "Add a comment on line 11" }));
		expect(act).toHaveBeenCalledWith({ path: "a.ts", newLine: 11 });
	});

	it("is one tab stop and moves with the arrow keys", async () => {
		const user = userEvent.setup();
		withAction();
		const buttons = screen.getAllByRole("button");
		expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
		expect(buttons[0]?.tabIndex).toBe(0);
		buttons[0]?.focus();
		await user.keyboard("{ArrowDown}{ArrowDown}");
		expect(document.activeElement).toBe(buttons[2]);
		expect(buttons[2]?.tabIndex).toBe(0);
		expect(buttons[0]?.tabIndex).toBe(-1);
		await user.keyboard("{ArrowUp}");
		expect(document.activeElement).toBe(buttons[1]);
		await user.keyboard("{ArrowUp}{ArrowUp}");
		expect(document.activeElement).toBe(buttons[0]);
	});
});

const BIG = `@@ -1,500 +1,500 @@\n${Array.from({ length: 500 }, (_, i) => ` l${i}`).join("\n")}`;

function Harness() {
	const [on, setOn] = useState(false);
	return (
		<DiffView
			text={BIG}
			path="a.ts"
			label="Diff"
			binaryLabel=""
			truncatedLabel=""
			lineActionLabel={ADD}
			onLineAction={() => setOn(true)}
			notes={on ? { 3: <p>Box</p> } : undefined}
		/>
	);
}

describe("DiffView rows", () => {
	it("does not draw the other rows again when a note opens under one line", async () => {
		const user = userEvent.setup();
		renderApp(<Harness />);
		const before = drawn.count;
		expect(before).toBeGreaterThanOrEqual(500);
		await user.click(screen.getByRole("button", { name: "Add a comment on line 3" }));
		expect(screen.getByText("Box")).toBeInTheDocument();
		// Three rows at most draw again: the line with the note, the old tab stop and the new one.
		expect(drawn.count - before).toBeLessThanOrEqual(3);
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

	it("turns the plus off with the reason, keeps it focusable and calls nothing", async () => {
		const act = vi.fn();
		renderApp(
			<DiffView
				text={TWO}
				path="a.ts"
				label="Diff"
				binaryLabel=""
				truncatedLabel=""
				lineActionLabel={ADD}
				onLineAction={act}
				lineActionDisabled="Needs the right code.write"
			/>,
		);
		const plus = screen.getByRole("button", { name: "Add a comment on line 2" });
		expect(plus).toHaveAttribute("aria-disabled", "true");
		expect(plus).toHaveAttribute("title", "Needs the right code.write");
		expect(plus).toHaveAccessibleDescription("Needs the right code.write");
		plus.focus();
		expect(plus).toHaveFocus();
		await userEvent.click(plus);
		expect(act).not.toHaveBeenCalled();
	});

	it("says how many lines with a note wait for Show all under the cap", () => {
		const text = `@@ -0,0 +1,2500 @@\n${Array.from({ length: 2500 }, (_, i) => `+l${i}`).join("\n")}`;
		renderApp(
			<DiffView
				text={text}
				label="Diff"
				binaryLabel=""
				truncatedLabel=""
				showAllLabel="Show all {n} lines"
				hiddenNotesLabel="{n} comments are hidden until Show all"
				notes={{ 5: <p>seen</p>, 2300: <p>hidden</p>, 2400: <p>hidden too</p> }}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent("2 comments are hidden until Show all");
		expect(screen.queryByText("hidden")).toBeNull();
	});
});
