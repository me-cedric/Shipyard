import { bricksPath, bricksText, parseBricks, parseFlows, slug } from "./index";

describe("design helpers", () => {
	it("reads the rows of a flow file, and names a text that does not parse", () => {
		expect(
			parseFlows(
				"rows:\n- {id: 1, source: a, destination: b, network: v, protocol: tcp, action: allow}\n",
			).rows,
		).toHaveLength(1);
		expect(parseFlows("rows: []\n").rows).toEqual([]);
		expect(parseFlows("").rows).toEqual([]);
		expect(parseFlows("rows: [").error).not.toBeNull();
	});

	it("reads the JSON form of a flow file with its name, subnet and bricks", () => {
		const json =
			'{"version":1,"flows":[{"name":"web-db","sourceName":"Web","destinationName":"DB","source":"10.0.0.0/24","destination":"10.0.1.5/32","vlan":"10","subnet":"10.0.0.0/24","protocol":"TCP","ports":"5432","action":"Deny"}]}';
		const [row] = parseFlows(json).rows;
		expect(row).toMatchObject({
			id: 1,
			name: "web-db",
			sourceName: "Web",
			network: "10",
			subnet: "10.0.0.0/24",
			port: "5432",
			action: "deny",
		});
	});

	it("reads and writes the bricks file next to the flows", () => {
		expect(bricksPath("docs/flows/network.json")).toBe("docs/flows/bricks.json");
		const text = bricksText([{ id: "a", name: "Web", description: "" }]);
		expect(parseBricks(text)).toEqual([{ id: "a", name: "Web", description: "" }]);
		expect(parseBricks("{")).toEqual([]);
	});

	it("makes a file name from a title", () => {
		expect(slug("Déploiement  Prod!")).toBe("deploiement-prod");
	});
});
