import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { DrawioViewer } from "./drawio-viewer";
import plain from "./fixtures/orders.drawio?raw";

describe("DrawioViewer", () => {
	it("shows a board svg as an image", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile/&gt;"/>';
		renderApp(<DrawioViewer text={svg} svg label="Board" invalid="Not a board" />);
		expect(screen.getByRole("img", { name: "Board" })).toHaveAttribute(
			"src",
			expect.stringContaining("data:image/svg+xml"),
		);
	});

	it("shows an error and no content for a plain svg", () => {
		const onError = vi.fn();
		renderApp(
			<DrawioViewer
				text="<svg xmlns='http://www.w3.org/2000/svg'/>"
				svg
				label="Board"
				invalid="Not a board"
				onError={onError}
			/>,
		);
		expect(screen.queryByRole("img")).toBeNull();
		expect(onError).toHaveBeenCalledWith({ message: "Not a board" });
	});

	it("draws a plain drawio file from its model", async () => {
		renderApp(<DrawioViewer text={plain} svg={false} label="Board" invalid="x" />);
		const img = await screen.findByRole("img", { name: "Board" });
		expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain("Order placed");
		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("shows the XML read-only when the model has nothing to draw", async () => {
		renderApp(
			<DrawioViewer text="<mxfile><diagram/></mxfile>" svg={false} label="Board" invalid="x" />,
		);
		expect(await screen.findByRole("textbox", { name: "Board" })).toHaveAttribute("readonly");
	});
});
