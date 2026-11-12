import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderApp } from "../test-utils";
import { Loading } from "./loading";

// spec:ux-declutter#REQ-024
function Page() {
	const [done, setDone] = useState(false);
	return (
		<div data-testid="page">
			<button type="button" onClick={() => setDone(true)}>
				Load
			</button>
			{done ? <p>Content</p> : <Loading title="Runs" />}
		</div>
	);
}

describe("Loading", () => {
	it("keeps the title while it loads and swaps to the content with no fade marker", async () => {
		renderApp(<Page />);
		expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
		await userEvent.click(screen.getByText("Load"));
		expect(screen.getByText("Content")).toBeInTheDocument();
		expect(screen.getByTestId("page")).not.toHaveAttribute("data-reveal");
	});
});
