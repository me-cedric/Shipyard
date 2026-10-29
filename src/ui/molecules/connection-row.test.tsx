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
		expect(within(row).getByText("Linear")).toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Test" })).toBeInTheDocument();
		expect(within(row).getByText("under")).toBeInTheDocument();
	});
});
