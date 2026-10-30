import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { CodeEditor, gherkin } from "./code-editor";

describe("CodeEditor", () => {
	it("numbers the lines, marks the error line and reports an edit", async () => {
		const onChange = vi.fn();
		const { container } = renderApp(
			<CodeEditor label="Source" value={"a\nb\nc"} errorLine={2} onChange={onChange} />,
		);
		expect(container.querySelectorAll("[aria-hidden] > div > div")).toHaveLength(3);
		expect(container.querySelector("[data-error]")?.textContent).toBe("2");
		expect(screen.getByRole("textbox", { name: "Source" })).toBeInvalid();
		await userEvent.type(screen.getByRole("textbox", { name: "Source" }), "x");
		expect(onChange).toHaveBeenCalledWith("a\nb\ncx");
	});

	it("does not mark a line without an error", () => {
		const { container } = renderApp(<CodeEditor label="Source" value="a" readOnly />);
		expect(container.querySelector("[data-error]")).toBeNull();
		expect(screen.getByRole("textbox", { name: "Source" })).toHaveAttribute("readonly");
	});

	it("marks the last line when the error names a line after it", () => {
		const { container } = renderApp(<CodeEditor label="Source" value={"a\nb"} errorLine={9} />);
		expect(container.querySelector("[data-error]")?.textContent).toBe("2");
	});

	it("colours Gherkin: keywords, steps, tags, comments, strings and refs", () => {
		expect(gherkin("Feature: Login")).toEqual([
			["", null],
			["Feature", "keyword"],
			[": Login", null],
		]);
		expect(gherkin('  Given a "user" for spec:auth#REQ-001')).toEqual([
			["  ", null],
			["Given", "step"],
			[" a ", null],
			['"user"', "string"],
			[" for ", null],
			["spec:auth#REQ-001", "ref"],
		]);
		expect(gherkin("  @smoke")).toEqual([["  @smoke", "tag"]]);
		expect(gherkin("# note")).toEqual([["# note", "comment"]]);
		expect(gherkin("| a |").map(([, tone]) => tone)).toEqual(["comment", null, "comment"]);
	});

	it("draws the coloured layer under a clear field", () => {
		const { container } = renderApp(
			<CodeEditor label="Plan" value={"Feature: A\n  Given b"} highlight={gherkin} />,
		);
		expect(container.querySelector("pre")?.textContent).toBe("Feature: A  Given b");
		expect(screen.getByRole("textbox", { name: "Plan" })).toHaveClass("text-transparent");
	});
});
