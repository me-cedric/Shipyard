import { parseFlows, slug } from "./index";

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

	it("makes a file name from a title", () => {
		expect(slug("Déploiement  Prod!")).toBe("deploiement-prod");
	});
});
