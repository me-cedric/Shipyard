import { act, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { CountUp } from "./count-up";

const reduced = vi.hoisted(() => ({ on: false }));
vi.mock("motion/react", async (orig) => ({
	...(await orig<object>()),
	useReducedMotion: () => reduced.on,
}));

describe("CountUp", () => {
	it("ends on the exact formatted value", async () => {
		reduced.on = false;
		const format = (n: number) => `$${n.toFixed(2)}`;
		const { rerender } = render(<CountUp value={0} format={format} />);
		rerender(<CountUp value={12.34} format={format} />);
		await waitFor(() => expect(screen.getByText("$12.34")).toBeInTheDocument(), { timeout: 3000 });
	});

	it("shows the new value at once under reduced motion", () => {
		reduced.on = true;
		const { rerender } = render(<CountUp value={1} />);
		act(() => rerender(<CountUp value={500} />));
		expect(screen.getByText("500")).toBeInTheDocument();
	});
});
