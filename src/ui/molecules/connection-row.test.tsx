import { screen, within } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { ConnectionRow } from "./connection-row";
import { FlagList } from "./flag-list";

describe("FlagList", () => {
	it("gives each flag a shape for on and another for off", () => {
		renderApp(
			<FlagList
				label="Flags"
				onLabel="On"
				offLabel="Off"
				flags={[
					{ id: "a", label: "Hierarchy", on: true },
					{ id: "b", label: "Time tracking", on: false },
				]}
			/>,
		);
		const [on, off] = screen.getAllByRole("listitem");
		expect(within(on as HTMLElement).getByRole("img", { name: "On" })).toHaveAttribute(
			"data-shape",
			"circle",
		);
		expect(within(off as HTMLElement).getByRole("img", { name: "Off" })).toHaveAttribute(
			"data-shape",
			"dash",
		);
		expect(on).toHaveTextContent("Hierarchy");
	});
});

describe("ConnectionRow", () => {
	it("names the group, shows the state shape and holds the actions", () => {
		renderApp(
			<ConnectionRow
				status="success"
				statusLabel="Passed"
				name="Acme"
				product="Linear"
				actions={<button type="button">Test</button>}
			>
				<p>under</p>
			</ConnectionRow>,
		);
		const row = screen.getByRole("group", { name: "Acme" });
		expect(within(row).getByRole("img", { name: "Passed" })).toBeInTheDocument();
		expect(within(row).getByTitle("Linear")).toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Test" })).toBeInTheDocument();
		expect(within(row).getByText("under")).toBeInTheDocument();
	});

	it("shows the logo of the product, or its first letter (spec:visual-cues#REQ-003)", () => {
		const { container, unmount } = renderApp(
			<ConnectionRow
				status="idle"
				statusLabel="Off"
				name="Work"
				brand="jira-cloud"
				actions={null}
			/>,
		);
		expect(container.querySelector("[data-brand]")).toHaveAttribute("data-brand", "Jira");
		unmount();
		const other = renderApp(
			<ConnectionRow
				status="idle"
				statusLabel="Off"
				name="Work"
				product="Azure DevOps"
				brand="azure-dev-ops"
				actions={null}
			/>,
		);
		expect(other.container.querySelector("[data-brand]")).toBeNull();
		expect(screen.getByRole("group", { name: "Work" })).toHaveTextContent("A");
	});
});
