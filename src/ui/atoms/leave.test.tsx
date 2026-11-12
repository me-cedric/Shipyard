import { render, screen, waitFor } from "@testing-library/react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { describe, expect, it } from "vitest";
import { Leave } from "./leave";

// spec:ux-declutter#REQ-024
const List = ({ keys, motion = "always" }: { keys: string[]; motion?: "always" | "never" }) => (
	<MotionConfig reducedMotion={motion}>
		<ul tabIndex={-1} aria-label="list">
			<AnimatePresence initial={false}>
				{keys.map((k) => (
					<Leave as="li" key={k}>
						<button type="button">{k}</button>
					</Leave>
				))}
			</AnimatePresence>
		</ul>
	</MotionConfig>
);

describe("Leave", () => {
	it("removes the row and moves the focus to the next row", async () => {
		const { rerender } = render(<List keys={["a", "b"]} />);
		screen.getByText("a").focus();
		rerender(<List keys={["b"]} />);
		await waitFor(() => expect(screen.queryByText("a")).toBeNull());
		expect(screen.getByText("b")).toHaveFocus();
	});

	it("moves the focus to the list when the last row leaves", async () => {
		const { rerender } = render(<List keys={["a"]} />);
		screen.getByText("a").focus();
		rerender(<List keys={[]} />);
		await waitFor(() => expect(screen.queryByText("a")).toBeNull());
		expect(screen.getByLabelText("list")).toHaveFocus();
	});

	it("keeps a leaving row mounted and inert while it moves out", async () => {
		const { rerender } = render(<List keys={["a", "b"]} motion="never" />);
		rerender(<List keys={["b"]} motion="never" />);
		expect(screen.getByText("a").closest("li")).toHaveAttribute("inert");
		expect(screen.getByText("b").closest("li")).not.toHaveAttribute("inert");
		await waitFor(() => expect(screen.queryByText("a")).toBeNull());
	});

	it("skips a row that is leaving when it moves the focus", async () => {
		const { rerender } = render(<List keys={["a", "b", "c"]} motion="never" />);
		screen.getByText("b").focus();
		rerender(<List keys={["a", "b"]} motion="never" />);
		rerender(<List keys={["a"]} motion="never" />);
		expect(screen.getByText("a")).toHaveFocus();
		await waitFor(() => expect(screen.queryByText("b")).toBeNull());
	});

	it("does not move the focus when the row that leaves does not hold it", async () => {
		const { rerender } = render(<List keys={["a", "b", "c"]} />);
		screen.getByText("c").focus();
		rerender(<List keys={["b", "c"]} />);
		await waitFor(() => expect(screen.queryByText("a")).toBeNull());
		expect(screen.getByText("c")).toHaveFocus();
	});
});
