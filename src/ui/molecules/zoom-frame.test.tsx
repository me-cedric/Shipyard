import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { clampAt, fitTo, MAX_ZOOM, MIN_ZOOM, ZoomFrame, zoomBy } from "./zoom-frame";

const mount = () =>
	renderApp(
		<ZoomFrame label="Plan">
			<p>picture</p>
		</ZoomFrame>,
	);
const scaleOf = () => screen.getByText("picture").parentElement?.style.transform ?? "";

describe("ZoomFrame", () => {
	it("keeps the scale inside the limits", () => {
		expect(zoomBy(MAX_ZOOM, 2)).toBe(MAX_ZOOM);
		expect(zoomBy(MIN_ZOOM, 0.5)).toBe(MIN_ZOOM);
		expect(zoomBy(1, 2)).toBe(2);
	});

	it("fits a content far wider than the frame, centred and whole", () => {
		const { scale, at } = fitTo({ width: 400, height: 300 }, { width: 8000, height: 1000 });
		expect(scale).toBeCloseTo(0.05);
		expect(at.x).toBeCloseTo(0);
		expect(at.y).toBeCloseTo(125);
		const small = fitTo({ width: 400, height: 300 }, { width: 100, height: 300 });
		expect(small.at.x).toBeCloseTo(150);
		expect(fitTo({ width: 0, height: 0 }, { width: 10, height: 10 })).toEqual({
			scale: 1,
			at: { x: 0, y: 0 },
		});
	});

	it("keeps a part of the content in the frame when it pans", () => {
		const box = { width: 400, height: 300 };
		const content = { width: 1000, height: 1000 };
		expect(clampAt({ x: -5000, y: -5000 }, 1, box, content)).toEqual({ x: -952, y: -952 });
		expect(clampAt({ x: 5000, y: 5000 }, 1, box, content)).toEqual({ x: 352, y: 252 });
		expect(clampAt({ x: -10, y: 20 }, 1, box, content)).toEqual({ x: -10, y: 20 });
	});

	it("pans with the wheel only on purpose, else the page scrolls", () => {
		const sizes = (w: number) => {
			const box = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
			const pic = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(w);
			return () => {
				box.mockRestore();
				pic.mockRestore();
			};
		};
		const wheel = (init: WheelEventInit) =>
			// fireEvent returns false when the handler called preventDefault.
			!fireEvent.wheel(screen.getByRole("region", { name: "Zoom and move: Plan" }), init);
		mount();
		const area = screen.getByRole("region", { name: "Zoom and move: Plan" });
		// Picture as wide as the frame: a sideways gesture and a vertical one both scroll the page.
		let restore = sizes(100);
		expect(wheel({ deltaX: 30, deltaY: 10 })).toBe(false);
		expect(wheel({ deltaX: 5, deltaY: 40 })).toBe(false);
		restore();
		// Wider picture: a mostly sideways gesture pans it.
		restore = sizes(1000);
		expect(wheel({ deltaX: 30, deltaY: 10 })).toBe(true);
		expect(scaleOf()).toContain("translate(-30px, -10px)");
		// A vertical wheel scrolls the page unless Shift is held or the frame has focus.
		expect(wheel({ deltaX: 5, deltaY: 40 })).toBe(false);
		expect(wheel({ deltaX: 0, deltaY: 40, shiftKey: true })).toBe(true);
		area.focus();
		expect(wheel({ deltaX: 0, deltaY: 40 })).toBe(true);
		// Ctrl or Cmd plus wheel zooms.
		area.blur();
		expect(wheel({ deltaY: -100, ctrlKey: true })).toBe(true);
		expect(wheel({ deltaY: -100, metaKey: true })).toBe(true);
		restore();
	});

	it("zooms with the buttons, the keys and Ctrl plus wheel, and fits", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(screen.getByRole("button", { name: "Zoom in" }));
		expect(scaleOf()).toContain("scale(1.25)");
		await user.click(screen.getByRole("button", { name: "Zoom out" }));
		await user.click(screen.getByRole("button", { name: "Zoom out" }));
		expect(scaleOf()).toContain("scale(0.8)");
		await user.click(screen.getByRole("button", { name: "Fit" }));
		expect(scaleOf()).toContain("scale(1)");
		const area = screen.getByRole("region", { name: "Zoom and move: Plan" });
		area.focus();
		await user.keyboard("+");
		expect(scaleOf()).toContain("scale(1.25)");
		await user.keyboard("{ArrowRight}");
		expect(scaleOf()).toContain("translate(-40px, 0px)");
		await user.keyboard("0");
		expect(scaleOf()).toContain("scale(1)");
		fireEvent.wheel(area, { deltaY: -100 });
		expect(scaleOf()).toContain("scale(1)");
		fireEvent.wheel(area, { deltaY: -100, ctrlKey: true });
		expect(scaleOf()).not.toContain("scale(1)");
	});

	it("opens the picture full screen", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(screen.getByRole("button", { name: "Full screen" }));
		expect(await screen.findByRole("dialog", { name: "Plan" })).toBeVisible();
	});
});
