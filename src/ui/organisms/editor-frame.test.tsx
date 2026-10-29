import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { EditorFrame, type SaveState } from "./editor-frame";

const labels = {
	copy: "Copy ref",
	dirty: "Unsaved",
	conflict: "File changed on disk",
	reload: "Reload",
	keepMine: "Keep mine",
	line: "Line",
};

function frame(save: SaveState, extra = {}) {
	const fns = { onSave: vi.fn(), onReload: vi.fn(), onKeepMine: vi.fn() };
	renderApp(
		<EditorFrame
			title="Checkout"
			refId="spec:checkout"
			save={save}
			primary={{ label: "Save", onClick: fns.onSave }}
			onReload={fns.onReload}
			onKeepMine={fns.onKeepMine}
			labels={labels}
			{...extra}
		>
			<p>body</p>
		</EditorFrame>,
	);
	return fns;
}

describe("EditorFrame", () => {
	it("shows the dirty state and saves", async () => {
		const { onSave } = frame("dirty");
		expect(screen.getByRole("img", { name: "Unsaved" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(onSave).toHaveBeenCalled();
	});

	it("offers reload or keep mine on a conflict and holds the save", async () => {
		const { onReload, onKeepMine } = frame("conflict");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await userEvent.click(screen.getByRole("button", { name: "Reload" }));
		await userEvent.click(screen.getByRole("button", { name: "Keep mine" }));
		expect(onReload).toHaveBeenCalled();
		expect(onKeepMine).toHaveBeenCalled();
	});

	it("shows the error with its line", () => {
		frame("clean", { error: { message: "bad token", line: 4 } });
		expect(screen.getByRole("alert")).toHaveTextContent("Line 4bad token");
	});

	it("copies the ref", async () => {
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		frame("clean");
		await userEvent.click(screen.getByRole("button", { name: "Copy ref" }));
		expect(writeText).toHaveBeenCalledWith("spec:checkout");
	});
});
