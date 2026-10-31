import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { DbmlView } from "./dbml-view";
import { DrawioViewer } from "./drawio-viewer";
import plain from "./fixtures/orders.drawio?raw";
import { OpenApiView } from "./openapi-view";

const LABELS = { pk: "PK", notNull: "Not null", relations: "Relations" };
const good = "Table a { id int [pk] }\nTable b { a_id int }\nRef: b.a_id > a.id";

function Harness({ onError }: { onError: () => void }) {
	const [source, setSource] = useState(good);
	return (
		<>
			<button type="button" onClick={() => setSource("Table a {")}>
				break
			</button>
			<DbmlView source={source} labels={LABELS} onError={onError} />
		</>
	);
}

describe("DbmlView", () => {
	it("shows tables and relations, and keeps the last good model on an error", async () => {
		const onError = vi.fn();
		renderApp(<Harness onError={onError} />);
		expect(await screen.findByRole("region", { name: "a" })).toBeInTheDocument();
		expect(screen.getByText("b.a_id → a.id")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "break" }));
		await waitFor(() =>
			expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ line: 1 })),
		);
		expect(screen.getByRole("region", { name: "a" })).toBeInTheDocument();
	});
});

describe("OpenApiView", () => {
	const labels = {
		parameters: "Parameters",
		responses: "Responses",
		required: "Required",
		untagged: "Other",
	};
	const doc = `openapi: 3.0.0
paths:
  /o/{id}:
    get:
      tags: [orders]
      parameters: [{ name: id, in: path }]
      responses: { "200": { description: OK } }`;

	it("shows the operations by tag", async () => {
		renderApp(<OpenApiView source={doc} labels={labels} />);
		expect(screen.getByRole("region", { name: "orders" })).toBeInTheDocument();
		await userEvent.click(screen.getByText("/o/{id}"));
		expect(screen.getByText("OK")).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Parameters" })).toBeInTheDocument();
	});

	it("shows no endpoint for an invalid contract and reports the error", () => {
		const onError = vi.fn();
		renderApp(<OpenApiView source="a: [" labels={labels} onError={onError} />);
		expect(screen.queryByText("GET")).toBeNull();
		expect(onError).toHaveBeenCalledWith(expect.objectContaining({ line: 1 }));
	});
});

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
