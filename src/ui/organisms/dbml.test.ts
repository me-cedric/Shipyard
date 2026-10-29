import { parseDbml } from "./dbml";

const MODEL = `
Table users {
  id integer [primary key]
  email varchar [not null]
}
Table orders {
  id integer [pk]
  user_id integer
}
Ref: orders.user_id > users.id
`;

describe("parseDbml", () => {
	it("reads tables, types, flags and relations", () => {
		const { data, error } = parseDbml(MODEL);
		expect(error).toBeUndefined();
		expect(data?.tables.map((t) => t.name)).toEqual(["users", "orders"]);
		expect(data?.tables[0]?.fields[1]).toMatchObject({ type: "varchar", notNull: true });
		expect(data?.refs).toEqual([{ from: "orders.user_id", to: "users.id" }]);
	});

	it("reads inline refs, composite refs and skips comments and enums", () => {
		const { data } = parseDbml(
			"Enum s { a }\nTable a { id int [pk] // c\n b_id int [ref: > b.id] }\nTable b { id int }\nRef: a.(id, b_id) < b.(id, id)",
		);
		expect(data?.refs).toEqual([
			{ from: "a.b_id", to: "b.id" },
			{ from: "a.id,b_id", to: "b.id,id" },
		]);
	});

	it("treats empty input as an empty model", () => {
		expect(parseDbml("  ")).toEqual({ data: { tables: [], refs: [] } });
	});

	it("returns the message with its line for a broken model", () => {
		const { data, error } = parseDbml("Table a {\n id int\n}\nTable b {\n id");
		expect(data).toBeUndefined();
		expect(error).toMatch(/line 4/);
	});
});
