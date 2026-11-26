import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { ErrorNotice } from "./error-notice";

describe("ErrorNotice", () => {
	it("shows the sentence, and the raw text behind Details with a Copy button", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		renderApp(<ErrorNotice error={{ code: "unknown", details: "odd failure", action: null }} />);
		expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
		expect(screen.getByText("odd failure").tagName).toBe("CODE");
		expect(screen.getByText("Details")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		expect(writeText).toHaveBeenCalledWith("odd failure");
	});

	it("moves the output of a failed program into Details", () => {
		renderApp(<ErrorNotice error="`git fetch` failed: no route" />);
		expect(screen.getByText("`git fetch` failed: no route").tagName).toBe("CODE");
	});

	it("has no Details for a known code or a sentence of the interface", () => {
		renderApp(<ErrorNotice error={new Error("Enter a limit.")} />);
		expect(screen.getByRole("alert")).toHaveTextContent("Enter a limit.");
		expect(screen.queryByText("Details")).toBeNull();
	});
});
