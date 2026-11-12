import { act, render, screen, waitFor } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { CountUp } from "./count-up";

describe("CountUp", () => {
	it("ends on the exact formatted value", async () => {
		const format = (n: number) => `$${n.toFixed(2)}`;
		const { rerender } = render(<CountUp value={0} format={format} />);
		rerender(<CountUp value={12.34} format={format} />);
		await waitFor(() => expect(screen.getByText("$12.34")).toBeInTheDocument(), { timeout: 3000 });
	});

	it("shows the new value at once under reduced motion", () => {
		// The OS setting is off: only the preference of the person (MotionConfig) asks for reduced motion.
		const ui = (v: number) => (
			<MotionConfig reducedMotion="always">
				<CountUp value={v} />
			</MotionConfig>
		);
		const { rerender } = render(ui(1));
		act(() => rerender(ui(500)));
		expect(screen.getByText("500")).toBeInTheDocument();
	});
});
