import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { SplitPane } from "./split-pane";

const pane = () =>
	renderApp(
		<div>
			<SplitPane id="test-pane" label="Test width" fallback={300}>
				<p>First</p>
			</SplitPane>
			<p>Second</p>
		</div>,
	);

describe("SplitPane", () => {
	it("moves with an arrow key and resets on a double-click", async () => {
		pane();
		const bar = await screen.findByRole("separator", { name: "Test width" });
		expect(bar).toHaveAttribute("aria-valuenow", "300");
		fireEvent.keyDown(bar, { key: "ArrowRight" });
		expect(await screen.findByRole("separator")).toHaveAttribute("aria-valuenow", "316");
		fireEvent.doubleClick(screen.getByRole("separator"));
		expect(await screen.findByRole("separator")).toHaveAttribute("aria-valuenow", "300");
	});
});
