import { render, waitFor } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { LookPreview } from "./look-rows";

// spec:ux-declutter#REQ-023
describe("LookPreview", () => {
	const ui = (reducedMotion: "never" | "always") => (
		<MotionConfig reducedMotion={reducedMotion}>
			<LookPreview width={2} />
		</MotionConfig>
	);

	it("stops the moving dot when the preference turns to reduced while it is mounted", async () => {
		const { container, rerender } = render(ui("never"));
		const dot = container.querySelector<HTMLElement>(".rounded-full");
		await waitFor(() => expect(dot?.style.transform).toMatch(/translateX\([1-9]/));
		rerender(ui("always"));
		await waitFor(() => expect(dot?.style.transform).toMatch(/^(none|translateX\(0(px)?\))$/));
	});
});
