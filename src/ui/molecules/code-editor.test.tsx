import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { CodeEditor } from "./code-editor";

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
});
