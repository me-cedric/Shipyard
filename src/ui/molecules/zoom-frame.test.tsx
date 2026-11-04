import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { MAX_ZOOM, MIN_ZOOM, ZoomFrame, zoomBy } from "./zoom-frame";

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
