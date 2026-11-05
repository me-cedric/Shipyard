import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmButton } from "./confirm-button";

describe("ConfirmButton", () => {
	it("asks first, acts on the second click, and drops the question on blur", async () => {
		const user = userEvent.setup();
		const stop = vi.fn();
		render(
			<ConfirmButton confirm="Stop the run?" onConfirm={stop}>
				Stop
			</ConfirmButton>,
		);
		await user.click(screen.getByRole("button", { name: "Stop" }));
		expect(stop).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Stop the run?" })).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Stop" }));
		await user.click(screen.getByRole("button", { name: "Stop the run?" }));
		expect(stop).toHaveBeenCalledTimes(1);
	});
});
