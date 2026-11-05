import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/ui/test-utils";
import { RunLive } from "./quality-live";

describe("RunLive", () => {
	it("shows the last output line on one line and the full output in a dialog", async () => {
		const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
		renderApp(<RunLive run={{ startedAt: Date.now(), lines }} name="Lint" />);
		const last = await screen.findByText("line 30");
		expect(last).toHaveClass("truncate");
		expect(screen.queryByText("line 1")).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: "Output of Lint" }));
		expect(await screen.findByText(/line 1 line 2/)).toBeInTheDocument();
	});
});
