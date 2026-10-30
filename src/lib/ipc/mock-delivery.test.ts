import { personasSave, seedDelivery, ticketsConfigSave } from "./mock-delivery";

describe("the delivery mock", () => {
	it("refuses a persona with no name, a duplicate id and a negative rate", () => {
		const d = seedDelivery();
		const [a, b] = d.personas;
		if (!(a && b)) throw new Error("seed");
		expect(() => personasSave(d, [{ ...a, name: " " }])).toThrow("needs an id and a name");
		expect(() => personasSave(d, [a, { ...b, id: a.id }])).toThrow("two personas");
		expect(() => personasSave(d, [{ ...a, tjm: -1 }])).toThrow("zero or more");
		personasSave(d, [{ ...a, name: " Dev " }]);
		expect(d.personas).toHaveLength(1);
		expect(d.personas[0]?.name).toBe("Dev");
	});

	it("validates the tickets config like the Rust command", () => {
		const d = seedDelivery();
		const c = d.tickets;
		expect(() => ticketsConfigSave(d, { ...c, epic: "" })).toThrow("issue type");
		expect(() => ticketsConfigSave(d, { ...c, estimateMode: "x" })).toThrow("estimate mode");
		expect(() => ticketsConfigSave(d, { ...c, hierarchy: "x" })).toThrow("hierarchy");
		expect(() => ticketsConfigSave(d, { ...c, hoursPerDay: 25 })).toThrow("between 1 and 24");
		expect(() => ticketsConfigSave(d, { ...c, specBaseUrl: "ftp://x" })).toThrow("http");
		ticketsConfigSave(d, { ...c, labels: [" a ", ""] });
		expect(d.tickets.labels).toEqual(["a"]);
	});
});
