import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { Splitter } from "./splitter";

const setup = (props: Partial<Parameters<typeof Splitter>[0]> = {}) => {
	const onChange = vi.fn();
	const onReset = vi.fn();
	renderApp(
		<Splitter
			label="Width"
			value={300}
			min={200}
			max={400}
			onChange={onChange}
			onReset={onReset}
			{...props}
		/>,
	);
	return { onChange, onReset, bar: screen.getByRole("separator", { name: "Width" }) };
};

describe("Splitter", () => {
	it("moves with the arrow keys and stops at the limits", async () => {
		const { onChange, bar } = setup();
		bar.focus();
		await userEvent.keyboard("{ArrowRight}{ArrowLeft}{Home}{End}");
		expect(onChange.mock.calls).toEqual([
			[316, true],
			[284, true],
			[200, true],
			[400, true],
		]);
	});

	it("widens toward the start when inverted, and a horizontal bar uses the up and down keys", async () => {
		const { onChange, bar } = setup({ vertical: false, invert: true });
		expect(bar).toHaveAttribute("aria-orientation", "horizontal");
		bar.focus();
		await userEvent.keyboard("{ArrowUp}");
		expect(onChange).toHaveBeenCalledWith(316, true);
	});

	it("follows a drag inside the limits, then saves", () => {
		const { onChange, bar } = setup();
		fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
		fireEvent.pointerMove(bar, { clientX: 500, pointerId: 1 });
		expect(onChange).toHaveBeenLastCalledWith(400, false);
		fireEvent.pointerUp(bar, { pointerId: 1 });
		expect(onChange).toHaveBeenLastCalledWith(300, true);
	});

	it.each([
		["a cancel", fireEvent.pointerCancel],
		["a lost capture", fireEvent.lostPointerCapture],
	])("ends the drag and saves on %s, once", (_, end) => {
		const { onChange, bar } = setup();
		fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
		end(bar, { pointerId: 1 });
		expect(onChange).toHaveBeenLastCalledWith(300, true);
		// A pointer up after it, or a move, changes nothing.
		fireEvent.pointerUp(bar, { pointerId: 1 });
		fireEvent.pointerMove(bar, { clientX: 150, pointerId: 1 });
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it("resets on a double-click", async () => {
		const { onReset, bar } = setup();
		await userEvent.dblClick(bar);
		expect(onReset).toHaveBeenCalledOnce();
	});
});
