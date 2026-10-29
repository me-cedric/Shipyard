import { buildRequest, parseOpenApi } from "./openapi";

const DOC = `
openapi: 3.0.0
info: { title: Shop, version: "1" }
servers: [{ url: https://api.test/ }]
components:
  parameters:
    Limit: { name: limit, in: query, schema: { type: integer } }
paths:
  /orders/{id}:
    parameters: [{ name: id, in: path, schema: { type: string } }]
    get:
      tags: [orders]
      summary: One order
      parameters: [{ $ref: "#/components/parameters/Limit" }]
      responses: { "200": { description: OK }, "404": { description: Missing } }
  /health:
    get: { responses: { "200": { description: Up } } }
`;

describe("parseOpenApi", () => {
	it("groups the operations by tag with parameters and responses", () => {
		const { doc, error } = parseOpenApi(DOC);
		expect(error).toBeUndefined();
		expect(doc?.servers).toEqual(["https://api.test/"]);
		expect(doc?.groups.map((g) => g.tag)).toEqual(["orders", ""]);
		const op = doc?.groups[0]?.ops[0];
		expect(op?.method).toBe("GET");
		expect(op?.parameters).toEqual([
			{ name: "id", in: "path", required: true, type: "string" },
			{ name: "limit", in: "query", required: false, type: "integer" },
		]);
		expect(op?.responses.map((r) => r.status)).toEqual(["200", "404"]);
	});

	it("returns an error and no endpoint for an invalid contract", () => {
		expect(parseOpenApi("a: [").doc).toBeUndefined();
		expect(parseOpenApi("a: [").error?.line).toBe(1);
		expect(parseOpenApi("info: {}").error?.message).toMatch(/openapi/);
		expect(parseOpenApi("openapi: 3.0.0\npaths: {}").doc).toBeUndefined();
	});
});

describe("buildRequest", () => {
	const params = [
		{ name: "id", in: "path", required: true, type: "string" },
		{ name: "limit", in: "query", required: false, type: "integer" },
		{ name: "skip", in: "query", required: false, type: "integer" },
	];
	it("fills the path, adds the query and drops an empty one", () => {
		expect(
			buildRequest("https://a.test/", "GET", "/o/{id}", params, { id: "a b", limit: "5" }, "x"),
		).toEqual({
			url: "https://a.test/o/a%20b?limit=5",
			method: "GET",
		});
	});
	it("sends a body for a write", () => {
		expect(buildRequest("https://a.test", "POST", "/o", [], {}, "{}").body).toBe("{}");
	});
});
