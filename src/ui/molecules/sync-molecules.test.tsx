import { screen, within } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { SyncStatus } from "./sync-status";

describe("SyncStatus", () => {
	it("shows the state by shape and by name, with the time and the reason", () => {
		renderApp(
			<SyncStatus
				status="danger"
				label="Failed"
				time="10:42"
				dateTime="2026-10-29T10:42:00Z"
				detail="offline"
			/>,
		);
		const s = screen.getByRole("status");
		expect(s).toHaveTextContent("Failed");
		expect(s).toHaveTextContent("10:42");
		expect(s).toHaveTextContent("offline");
		expect(within(s).getByText("10:42")).toHaveAttribute("datetime", "2026-10-29T10:42:00Z");
		// The shape is a diamond: the state does not rest on the colour.
		expect(s.querySelector("[data-shape=diamond]")).not.toBeNull();
	});
});
