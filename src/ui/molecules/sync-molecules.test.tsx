import { screen, within } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { SyncStatus } from "./sync-status";
import { WorkItemRow } from "./work-item-row";

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

describe("WorkItemRow", () => {
	it("names the group by the key and shows the status as text", () => {
		renderApp(
			<WorkItemRow
				itemKey="ACME-1"
				title="Fix login"
				status="In Progress"
				category="in-progress"
				assignee="Ada"
				claimed="Claimed"
				actions={<button type="button">Link</button>}
			>
				<p>under</p>
			</WorkItemRow>,
		);
		const row = screen.getByRole("group", { name: "ACME-1" });
		expect(within(row).getByText("Fix login")).toBeInTheDocument();
		expect(within(row).getByText("In Progress")).toBeInTheDocument();
		expect(within(row).getByText("Ada")).toBeInTheDocument();
		expect(within(row).getByRole("img", { name: "Claimed" })).toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Link" })).toBeInTheDocument();
		expect(within(row).getByText("under")).toBeInTheDocument();
	});

	it("shows no claim mark for a free ticket", () => {
		renderApp(<WorkItemRow itemKey="ACME-2" title="t" status="To Do" category="todo" />);
		expect(screen.queryByRole("img")).toBeNull();
	});
});
