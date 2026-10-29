import { ALL, distinct, type FlowRow, filterFlows, NO_FILTER } from "./flow-rows";

const row = (id: string, o: Partial<FlowRow>): FlowRow => ({
	id,
	source: "web",
	destination: "db",
	network: "VLAN10",
	protocol: "tcp",
	port: "5432",
	action: "allow",
	...o,
});
const rows = [
	row("1", {}),
	row("2", { protocol: "udp", port: "53", destination: "dns" }),
	row("3", { network: "VNET2", action: "deny" }),
];

describe("filterFlows", () => {
	it("keeps all rows without a filter", () => {
		expect(filterFlows(rows, NO_FILTER)).toHaveLength(3);
	});
	it("combines network, protocol, action and text", () => {
		expect(filterFlows(rows, { ...NO_FILTER, network: "VLAN10" }).map((r) => r.id)).toEqual([
			"1",
			"2",
		]);
		expect(
			filterFlows(rows, { ...NO_FILTER, network: "VLAN10", protocol: "udp" }).map((r) => r.id),
		).toEqual(["2"]);
		expect(
			filterFlows(rows, { network: ALL, protocol: "tcp", action: "deny", query: "" }).map(
				(r) => r.id,
			),
		).toEqual(["3"]);
		expect(filterFlows(rows, { ...NO_FILTER, query: " DNS " }).map((r) => r.id)).toEqual(["2"]);
		expect(filterFlows(rows, { ...NO_FILTER, query: "dns", action: "deny" })).toEqual([]);
	});
	it("lists distinct values", () => {
		expect(distinct(rows, "network")).toEqual(["VLAN10", "VNET2"]);
	});
});
