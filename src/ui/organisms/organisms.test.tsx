import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { EditorFrame } from "./editor-frame";
import { Inspector } from "./inspector";

describe("Inspector (REQ-005, REQ-010)", () => {
	it("opens the detail in a 320 px panel and closes with Escape", async () => {
		const onClose = vi.fn();
		renderApp(
			<Inspector open onClose={onClose} title="Detail">
				<button type="button">Inside</button>
			</Inspector>,
		);
		const panel = screen.getByRole("complementary", { name: "Detail" });
		expect(panel.className).toContain("data-[open=true]:w-80");
		await userEvent.click(screen.getByRole("button", { name: "Inside" }));
		await userEvent.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("turns inert when closed, so its content leaves the tab order", () => {
		renderApp(
			<Inspector open={false} onClose={() => {}} title="Detail">
				<button type="button">Inside</button>
			</Inspector>,
		);
		expect(screen.getByRole("complementary", { name: "Detail", hidden: true })).toHaveAttribute(
			"inert",
		);
	});
});

describe("EditorFrame (REQ-005, REQ-006)", () => {
	const labels = {
		copy: "Copy ref",
		dirty: "Unsaved",
		conflict: "File changed on disk",
		reload: "Reload",
		keepMine: "Keep mine",
		line: "Line",
	};

	it("shows the ref chip and one primary action", async () => {
		const onClick = vi.fn();
		renderApp(
			<EditorFrame
				title="Checkout"
				refId="spec:checkout"
				primary={{ label: "Save", onClick }}
				labels={labels}
			>
				<p>body</p>
			</EditorFrame>,
		);
		expect(screen.getByText("spec:checkout")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(onClick).toHaveBeenCalledOnce();
	});
});
