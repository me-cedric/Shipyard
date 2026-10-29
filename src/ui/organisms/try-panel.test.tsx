import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { TryPanel } from "./try-panel";

const labels = {
	server: "Server",
	method: "Method",
	path: "Path",
	body: "Body",
	send: "Send",
	status: "Status",
	failure: "Failed",
};
const params = [{ name: "id", in: "path", required: true, type: "string" }];

function setup(onSend: () => Promise<{ status: number; body: string }>, method = "GET") {
	renderApp(
		<TryPanel
			servers={["https://api.test"]}
			method={method}
			path="/o/{id}"
			params={params}
			onSend={onSend}
			labels={labels}
		/>,
	);
}

describe("TryPanel", () => {
	it("sends the built request and shows the status and body", async () => {
		const onSend = vi.fn().mockResolvedValue({ status: 200, body: '{"ok":true}' });
		setup(onSend);
		await userEvent.type(screen.getByRole("textbox", { name: "id" }), "7");
		await userEvent.click(screen.getByRole("button", { name: "Send" }));
		expect(onSend).toHaveBeenCalledWith({ url: "https://api.test/o/7", method: "GET" });
		expect(await screen.findByText('{"ok":true}')).toBeInTheDocument();
		expect(screen.getByText("200")).toBeInTheDocument();
	});

	it("shows a failure", async () => {
		setup(vi.fn().mockRejectedValue(new Error("network down")));
		await userEvent.type(screen.getByRole("textbox", { name: "id" }), "7");
		await userEvent.click(screen.getByRole("button", { name: "Send" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Failed: network down");
	});

	it("offers a body for a write only", () => {
		setup(vi.fn(), "POST");
		expect(screen.getByRole("textbox", { name: "Body" })).toBeInTheDocument();
	});
});
