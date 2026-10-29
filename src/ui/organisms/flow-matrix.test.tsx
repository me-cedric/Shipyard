import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { FlowMatrix } from "./flow-matrix";
import type { FlowRow } from "./flow-rows";

const labels = {
	source: "Source",
	destination: "Destination",
	network: "Network",
	protocol: "Protocol",
	port: "Port",
	action: "Action",
	all: "All",
	search: "Search",
	add: "Add flow",
	edit: "Edit",
	remove: "Remove",
	save: "Save",
	cancel: "Cancel",
};
const rows: FlowRow[] = [
	{
		id: "1",
		source: "web",
		destination: "db",
		network: "VLAN10",
		protocol: "tcp",
		port: "5432",
		action: "allow",
	},
	{
		id: "2",
		source: "app",
		destination: "dns",
		network: "VNET2",
		protocol: "udp",
		port: "53",
		action: "deny",
	},
];
const actions = [
	{ value: "allow", label: "Allow" },
	{ value: "deny", label: "Deny" },
];

function setup(props = {}) {
	const fns = { onAdd: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() };
	renderApp(<FlowMatrix rows={rows} actions={actions} labels={labels} {...fns} {...props} />);
	return fns;
}

describe("FlowMatrix", () => {
	it("filters rows by text", async () => {
		setup();
		expect(screen.getAllByRole("row")).toHaveLength(3);
		await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "dns");
		expect(screen.getAllByRole("row")).toHaveLength(2);
		expect(screen.queryByText("5432")).toBeNull();
	});

	it("adds a row and keeps the editor open when the caller refuses", async () => {
		const { onAdd } = setup({ error: { id: "", field: "port", message: "Not a port" } });
		onAdd.mockReturnValueOnce(false);
		await userEvent.click(screen.getByRole("button", { name: "Add flow" }));
		await userEvent.type(screen.getByRole("textbox", { name: "Port" }), "x");
		await userEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ port: "x" }));
		expect(screen.getByRole("alert")).toHaveTextContent("Port: Not a port");
		await userEvent.click(screen.getByRole("button", { name: "Save" }));
		expect(screen.queryByRole("textbox", { name: "Port" })).toBeNull();
	});

	it("edits and removes a row", async () => {
		const { onEdit, onRemove } = setup();
		await userEvent.click(screen.getByRole("button", { name: "Edit web db" }));
		const port = screen.getByRole("textbox", { name: "Port" });
		await userEvent.clear(port);
		await userEvent.type(port, "5433");
		await userEvent.click(
			within(screen.getAllByRole("row")[1] as HTMLElement).getByRole("button", { name: "Save" }),
		);
		expect(onEdit).toHaveBeenCalledWith(
			"1",
			expect.objectContaining({ port: "5433", source: "web" }),
		);
		await userEvent.click(screen.getByRole("button", { name: "Remove app dns" }));
		expect(onRemove).toHaveBeenCalledWith("2");
	});
});
